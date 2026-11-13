import { audit, insertPatient, today, transaction } from '../db.js';
import { patientSchema, requireThat } from '../validation.js';
import { createAppointment } from '../services.js';
import { ownedConversation, getDraft, appendSystemEvent, publicConversation } from './store.js';

export function confirmDraft(db, id, userId, { acknowledgeSharedContact = false } = {}) {
  requireThat(
    process.env.NODE_ENV !== 'production' || process.env.COPILOT_PATIENT_TOOLS_APPROVED === 'true',
    403,
    'Patient action confirmation requires an approved deployment.',
  );
  return transaction(db, () => {
    const row = db.prepare('SELECT * FROM copilot_drafts WHERE id=? AND user_id=?').get(id, userId);
    requireThat(row, 404, 'Action not found.');
    const conversation = ownedConversation(db, row.conversation_id, userId);
    requireThat(
      conversation.busy_until < Date.now(),
      409,
      'Wait for the current answer to complete.',
    );
    if (row.status === 'CONFIRMED')
      return {
        action: getDraft(db, id, userId),
        conversation: publicConversation(db, row.conversation_id, userId),
      };
    requireThat(
      row.status === 'PENDING',
      409,
      'This preview is no longer active. Request a fresh preview.',
    );
    requireThat(row.expires_at > Date.now(), 409, 'This preview expired. Request a fresh preview.');
    const payload = JSON.parse(row.payload_json),
      preview = JSON.parse(row.preview_json);
    let result, content;
    if (row.kind === 'REGISTER_PATIENT') {
      const data = patientSchema.parse(payload);
      requireThat(
        (data.dateOfBirth || data.ageRecordedOn) <= today(),
        400,
        'Birth or recording date cannot be in the future.',
      );
      const matches = db.prepare('SELECT id FROM patients WHERE phone=?').all(data.phone);
      requireThat(
        !matches.length || acknowledgeSharedContact,
        409,
        'A patient has this phone. Review the matches and explicitly confirm a different person/shared contact.',
      );
      const patientId = insertPatient(db, data, userId),
        p = db.prepare('SELECT id,mrn,full_name FROM patients WHERE id=?').get(patientId);
      db.prepare('UPDATE copilot_conversations SET selected_patient_id=? WHERE id=?').run(
        patientId,
        row.conversation_id,
      );
      db.prepare('INSERT OR IGNORE INTO copilot_entities VALUES(?,?,?)').run(
        row.conversation_id,
        'patient',
        patientId,
      );
      result = {
        patientId,
        mrn: p.mrn,
        name: p.full_name,
        link: `/patients?search=${encodeURIComponent(p.mrn)}`,
      };
      content = `Patient registered: ${p.full_name} (${p.mrn}). You can now continue the booking request.`;
    } else {
      requireThat(row.kind === 'BOOK_APPOINTMENT', 400, 'Unsupported action.');
      const doctor = db
        .prepare('SELECT * FROM doctors WHERE id=? AND active=1')
        .get(payload.doctorId);
      requireThat(doctor, 409, 'Doctor is unavailable. Request a new preview.');
      const fee = payload.visitType === 'NEW' ? doctor.fee : doctor.followup_fee;
      requireThat(
        fee === preview.fee && doctor.name === preview.doctorName,
        409,
        'Doctor details or fee changed. Request a new preview before confirming.',
      );
      const patient = db.prepare('SELECT * FROM patients WHERE id=?').get(payload.patientId);
      requireThat(
        patient &&
          patient.full_name === preview.patientName &&
          patient.phone === preview.patientPhone,
        409,
        'Patient details changed. Review a new preview.',
      );
      requireThat(
        payload.date >= today(),
        409,
        'The appointment date is now in the past. Request a new preview.',
      );
      const appointment = createAppointment(db, payload, userId, { wrapTransaction: false });
      result = {
        appointmentId: appointment.id,
        invoiceId: appointment.invoice_id,
        token: appointment.token,
        date: appointment.visit_date,
        link: `/receipts/${appointment.invoice_id}`,
      };
      content = `Appointment booked. Token #${appointment.token} · ${appointment.visit_date} · ${appointment.doctor_name}. Invoice ${appointment.invoice_number}.`;
    }
    db.prepare("UPDATE copilot_drafts SET status='CONFIRMED',result_json=? WHERE id=?").run(
      JSON.stringify(result),
      id,
    );
    audit(db, userId, 'COPILOT_ACTION_CONFIRMED', id, row.kind);
    appendSystemEvent(db, row.conversation_id, userId, content, result);
    return {
      action: getDraft(db, id, userId),
      conversation: publicConversation(db, row.conversation_id, userId),
    };
  });
}
export function cancelDraft(db, id, userId) {
  return transaction(db, () => {
    const row = db.prepare('SELECT * FROM copilot_drafts WHERE id=? AND user_id=?').get(id, userId);
    requireThat(row, 404, 'Action not found.');
    const conv = ownedConversation(db, row.conversation_id, userId);
    requireThat(conv.busy_until < Date.now(), 409, 'Wait for the current answer to complete.');
    requireThat(row.status === 'PENDING', 409, 'Only a pending preview can be cancelled.');
    db.prepare("UPDATE copilot_drafts SET status='CANCELLED' WHERE id=?").run(id);
    audit(db, userId, 'COPILOT_ACTION_CANCELLED', id, row.kind);
    appendSystemEvent(
      db,
      row.conversation_id,
      userId,
      'Action cancelled. No patient or appointment was created.',
      null,
    );
    return publicConversation(db, row.conversation_id, userId);
  });
}
