import { z } from 'zod';
import { today } from '../db.js';
import {
  dateSchema,
  patientSchema,
  normalizePhone,
  requireThat,
  HttpError,
} from '../validation.js';
import { dailyReport, appointmentQuery, invoiceQuery } from '../services.js';
import { observe, ownedConversation, stageDraft } from './store.js';

const text = { type: 'string' };
function tool(name, description, properties, required = Object.keys(properties)) {
  return {
    type: 'function',
    function: {
      name,
      description,
      strict: true,
      parameters: { type: 'object', properties, required, additionalProperties: false },
    },
  };
}
const date = {
  type: 'string',
  description: 'Exact YYYY-MM-DD clinic date in Asia/Dhaka. Resolve relative dates against today.',
};
export const tools = [
  tool(
    'daily_report',
    'Verified collection, reversals and visit balance for one date, integer paisa.',
    { date },
  ),
  tool('appointment_summary', 'Identifier-free doctor/token queue for one date.', { date }),
  tool(
    'report_range',
    'Compare collections over an inclusive date range, maximum 31 days. Do not call this to get patient data.',
    { fromDate: date, toDate: date },
  ),
  tool(
    'search_patients',
    'Find existing patients by name, phone or MRN. Multiple matches REQUIRE the user to choose a patient card before booking. A unique result selects that patient. Never assume shared phone means same person.',
    { query: { type: 'string', description: 'Name, MRN or phone; at least 2 characters.' } },
  ),
  tool(
    'find_doctors',
    'Search active doctors by name or specialty. Empty query lists doctors. Multiple matches require user selection before booking.',
    { query: text },
  ),
  tool(
    'doctor_availability',
    'Check remaining booking capacity and current fees for a doctor/day. Capacity is not a timed slot.',
    { doctorId: text, date },
  ),
  tool(
    'patient_history',
    'Get the selected patient’s appointments and outstanding invoice balances. Select an unambiguous patient first.',
    { patientId: text },
  ),
  tool(
    'prepare_registration',
    'Prepare a NEW patient registration preview ONLY. Nothing is saved until the human clicks Confirm. First search for an existing patient. Ask for missing age/contact information. DOB OR estimated age with recording date, not both.',
    {
      fullName: text,
      phone: text,
      dateOfBirth: { type: ['string', 'null'] },
      estimatedAgeMonths: { type: ['integer', 'null'] },
      ageRecordedOn: { type: ['string', 'null'] },
      address: text,
      contactName: text,
    },
  ),
  tool(
    'prepare_booking',
    'Prepare an appointment preview ONLY for selected patient and selected doctor. Must use IDs returned by tools/user selection. Checks date, capacity and duplicate booking. Human confirmation is REQUIRED; never claim booked from this result.',
    {
      patientId: text,
      doctorId: text,
      date,
      visitType: { type: 'string', enum: ['NEW', 'FOLLOW_UP'] },
    },
  ),
];
const patientView = (p) => ({
  id: p.id,
  name: p.full_name,
  mrn: p.mrn,
  phoneEnding: p.phone.slice(-4),
  dateOfBirth: p.dob,
  estimatedAgeMonths: p.estimated_months,
  ageRecordedOn: p.age_recorded_on,
});
function contextFor(db, context) {
  requireThat(
    context?.conversationId && context?.userId,
    400,
    'Start a conversation to use patient and action tools.',
  );
  requireThat(
    process.env.NODE_ENV !== 'production' || process.env.COPILOT_PATIENT_TOOLS_APPROVED === 'true',
    403,
    'Patient tools require a reviewed deployment. They are enabled for fictional-data development only.',
  );
  return ownedConversation(db, context.conversationId, context.userId);
}
function observed(db, context, kind, id) {
  const row = contextFor(db, context);
  requireThat(
    db
      .prepare('SELECT 1 FROM copilot_entities WHERE conversation_id=? AND kind=? AND entity_id=?')
      .get(row.id, kind, id),
    400,
    `Look up the ${kind} first. Do not invent an ID.`,
  );
  return row;
}
export function executeTool(db, name, args, context) {
  if (name === 'daily_report' || name === 'appointment_summary') {
    const { date } = z.object({ date: dateSchema }).strict().parse(args);
    if (name === 'daily_report') return dailyReport(db, date);
    return db
      .prepare(`${appointmentQuery} WHERE a.visit_date=? ORDER BY a.doctor_id,a.token`)
      .all(date)
      .map((a) => ({
        doctor: a.doctor_name,
        token: a.token,
        status: a.status,
        visitType: a.visit_type,
      }));
  }
  if (name === 'report_range') {
    const { fromDate, toDate } = z
      .object({ fromDate: dateSchema, toDate: dateSchema })
      .strict()
      .parse(args);
    const count = Math.floor((Date.parse(toDate) - Date.parse(fromDate)) / 86400000) + 1;
    requireThat(count > 0 && count <= 31, 400, 'Use an ordered range of at most 31 days.');
    const days = Array.from({ length: count }, (_, i) =>
      dailyReport(db, new Date(Date.parse(fromDate) + i * 86400000).toISOString().slice(0, 10)),
    );
    return { fromDate, toDate, days, totalNet: days.reduce((n, d) => n + d.net, 0) };
  }
  if (name === 'search_patients') {
    const conv = contextFor(db, context);
    const { query } = z
      .object({ query: z.string().trim().min(2).max(120) })
      .strict()
      .parse(args);
    const q = /^[+০-৯0-9\s()-]+$/.test(query) ? normalizePhone(query) : query;
    const pattern = `%${q.replace(/[!%_]/g, '!$&')}%`;
    const filter =
      "WHERE full_name LIKE ? ESCAPE '!' OR phone LIKE ? ESCAPE '!' OR mrn LIKE ? ESCAPE '!'";
    const total = db
      .prepare(`SELECT COUNT(*) n FROM patients ${filter}`)
      .get(pattern, pattern, pattern).n;
    const rows = db
      .prepare(`SELECT * FROM patients ${filter} ORDER BY full_name LIMIT 10`)
      .all(pattern, pattern, pattern);
    observe(db, conv.id, 'patient', rows);
    context.searchedPatients = true;
    db.prepare('UPDATE copilot_conversations SET selected_patient_id=? WHERE id=?').run(
      total === 1 ? rows[0].id : null,
      conv.id,
    );
    return {
      kind: 'patients',
      items: rows.map(patientView),
      total,
      requiresSelection: total > 1,
      selectedId: total === 1 ? rows[0].id : null,
    };
  }
  if (name === 'find_doctors') {
    const conv = contextFor(db, context);
    const { query } = z
      .object({ query: z.string().trim().max(120) })
      .strict()
      .parse(args);
    const pattern = `%${query.replace(/[!%_]/g, '!$&')}%`;
    const rows = db
      .prepare(
        "SELECT id,name,specialty,fee,followup_fee,capacity FROM doctors WHERE active=1 AND (name LIKE ? ESCAPE '!' OR specialty LIKE ? ESCAPE '!') ORDER BY name LIMIT 30",
      )
      .all(pattern, pattern);
    observe(db, conv.id, 'doctor', rows);
    db.prepare('UPDATE copilot_conversations SET selected_doctor_id=? WHERE id=?').run(
      rows.length === 1 ? rows[0].id : null,
      conv.id,
    );
    return {
      kind: 'doctors',
      items: rows,
      requiresSelection: rows.length > 1,
      selectedId: rows.length === 1 ? rows[0].id : null,
    };
  }
  if (name === 'doctor_availability') {
    const data = z
      .object({ doctorId: z.string().min(1), date: dateSchema })
      .strict()
      .parse(args);
    observed(db, context, 'doctor', data.doctorId);
    const d = db.prepare('SELECT * FROM doctors WHERE id=? AND active=1').get(data.doctorId);
    requireThat(d, 404, 'Doctor not available.');
    const used = db
      .prepare(
        "SELECT COUNT(*) n FROM appointments WHERE doctor_id=? AND visit_date=? AND status NOT IN ('CANCELLED','NO_SHOW')",
      )
      .get(d.id, data.date).n;
    return {
      doctorId: d.id,
      name: d.name,
      date: data.date,
      capacity: d.capacity,
      booked: used,
      remaining: Math.max(0, d.capacity - used),
      newFee: d.fee,
      followupFee: d.followup_fee,
    };
  }
  if (name === 'patient_history') {
    const { patientId } = z
      .object({ patientId: z.string().min(1) })
      .strict()
      .parse(args);
    const conv = observed(db, context, 'patient', patientId);
    requireThat(
      conv.selected_patient_id === patientId,
      409,
      'Ask the user to select the patient card first.',
    );
    const rows = db
      .prepare(`${appointmentQuery} WHERE a.patient_id=? ORDER BY a.visit_date DESC LIMIT 30`)
      .all(patientId);
    return {
      kind: 'patient_history',
      patientId,
      totalOutstanding: db
        .prepare(
          `SELECT COALESCE(SUM(total-paid),0) amount FROM (${invoiceQuery}) WHERE patient_id=? AND appointment_status NOT IN ('CANCELLED','NO_SHOW')`,
        )
        .get(patientId).amount,
      limit: 30,
      items: rows.map((a) => ({
        appointmentId: a.id,
        date: a.visit_date,
        doctor: a.doctor_name,
        token: a.token,
        status: a.status,
        total: a.total,
        paid: a.paid,
        due: ['CANCELLED', 'NO_SHOW'].includes(a.status) ? 0 : a.total - a.paid,
        invoiceId: a.invoice_id,
        link: `/receipts/${a.invoice_id}`,
      })),
    };
  }
  if (name === 'prepare_registration') {
    contextFor(db, context);
    const data = patientSchema.parse(args);
    requireThat(
      (data.dateOfBirth || data.ageRecordedOn) <= today(),
      400,
      'Birth/recording date cannot be in the future.',
    );
    // The model must have attempted a lookup in this conversation; confirmation still rechecks shared contacts.
    const conv = ownedConversation(db, context.conversationId, context.userId);
    const prior =
      JSON.parse(conv.events_json).some((e) =>
        (e.toolCalls || []).some((t) => t.name === 'search_patients'),
      ) || context.searchedPatients;
    requireThat(prior, 400, 'Search for an existing patient before preparing registration.');
    const matches = db
      .prepare('SELECT * FROM patients WHERE phone=? LIMIT 10')
      .all(data.phone)
      .map(patientView);
    return {
      kind: 'action_preview',
      action: stageDraft(db, context, 'REGISTER_PATIENT', data, {
        fullName: data.fullName,
        phone: data.phone,
        dateOfBirth: data.dateOfBirth ?? null,
        estimatedAgeMonths: data.estimatedAgeMonths ?? null,
        ageRecordedOn: data.ageRecordedOn ?? null,
        address: data.address,
        contactName: data.contactName,
        matches,
      }),
      confirmationRequired: true,
    };
  }
  if (name === 'prepare_booking') {
    const data = z
      .object({
        patientId: z.string().min(1),
        doctorId: z.string().min(1),
        date: dateSchema,
        visitType: z.enum(['NEW', 'FOLLOW_UP']),
      })
      .strict()
      .parse(args);
    const conv = observed(db, context, 'patient', data.patientId);
    observed(db, context, 'doctor', data.doctorId);
    requireThat(
      conv.selected_patient_id === data.patientId,
      409,
      'Patient is ambiguous or changed. Ask the user to select a patient card.',
    );
    requireThat(
      conv.selected_doctor_id === data.doctorId,
      409,
      'Doctor is ambiguous or changed. Ask the user to select a doctor card.',
    );
    requireThat(data.date >= today(), 400, 'Cannot prepare an appointment in the past.');
    const d = db.prepare('SELECT * FROM doctors WHERE id=? AND active=1').get(data.doctorId),
      p = db.prepare('SELECT * FROM patients WHERE id=?').get(data.patientId);
    requireThat(d && p, 404, 'Patient or doctor unavailable.');
    const availability = executeTool(
      db,
      'doctor_availability',
      { doctorId: d.id, date: data.date },
      context,
    );
    requireThat(
      availability.remaining > 0,
      409,
      'This doctor/day is at capacity. Choose a different day or doctor.',
    );
    requireThat(
      !db
        .prepare(
          "SELECT id FROM appointments WHERE patient_id=? AND doctor_id=? AND visit_date=? AND status NOT IN ('CANCELLED','NO_SHOW')",
        )
        .get(p.id, d.id, data.date),
      409,
      'This patient already has an active appointment with that doctor/day.',
    );
    return {
      kind: 'action_preview',
      action: stageDraft(db, context, 'BOOK_APPOINTMENT', data, {
        patientName: p.full_name,
        patientPhone: p.phone,
        mrn: p.mrn,
        doctorName: d.name,
        date: data.date,
        visitType: data.visitType,
        fee: data.visitType === 'NEW' ? d.fee : d.followup_fee,
        remainingCapacity: availability.remaining,
      }),
      confirmationRequired: true,
    };
  }
  throw new HttpError(400, 'Unknown copilot tool.');
}
