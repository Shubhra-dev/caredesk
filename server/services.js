import { randomUUID } from 'node:crypto';
import { transaction, audit, today } from './db.js';
import { requireThat } from './validation.js';
export const invoiceQuery = `SELECT i.*,a.patient_id,a.doctor_id,a.visit_date,a.token,a.status appointment_status,p.full_name,p.mrn,p.phone,d.name doctor_name,COALESCE((SELECT SUM(amount) FROM payments pay WHERE pay.invoice_id=i.id AND pay.reversed_at IS NULL),0) paid FROM invoices i JOIN appointments a ON a.id=i.appointment_id JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id`;
export const appointmentQuery = `SELECT a.*,p.full_name,p.mrn,p.phone,d.name doctor_name,d.specialty,i.id invoice_id,i.number invoice_number,i.total,COALESCE((SELECT SUM(amount) FROM payments pay WHERE pay.invoice_id=i.id AND pay.reversed_at IS NULL),0) paid FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id JOIN invoices i ON i.appointment_id=a.id`;
export function createAppointment(db, data, userId) {
  return transaction(db, () => {
    const doctor = db.prepare('SELECT * FROM doctors WHERE id=? AND active=1').get(data.doctorId);
    requireThat(doctor, 404, 'Active doctor not found.');
    requireThat(
      db.prepare('SELECT id FROM patients WHERE id=?').get(data.patientId),
      404,
      'Patient not found.',
    );
    const used = db
      .prepare(
        "SELECT COUNT(*) n FROM appointments WHERE doctor_id=? AND visit_date=? AND status NOT IN ('CANCELLED','NO_SHOW')",
      )
      .get(data.doctorId, data.date).n;
    requireThat(used < doctor.capacity, 409, 'This session has reached capacity.');
    requireThat(
      !db
        .prepare(
          "SELECT id FROM appointments WHERE patient_id=? AND doctor_id=? AND visit_date=? AND status NOT IN ('CANCELLED','NO_SHOW')",
        )
        .get(data.patientId, data.doctorId, data.date),
      409,
      'Patient already has an appointment with this doctor on this date.',
    );
    const token = db
      .prepare(
        'SELECT COALESCE(MAX(token),0)+1 n FROM appointments WHERE doctor_id=? AND visit_date=?',
      )
      .get(data.doctorId, data.date).n;
    const id = randomUUID(),
      invoiceId = randomUUID();
    db.prepare(
      'INSERT INTO appointments(id,patient_id,doctor_id,visit_date,token,visit_type,created_by) VALUES(?,?,?,?,?,?,?)',
    ).run(id, data.patientId, data.doctorId, data.date, token, data.visitType, userId);
    const r = db
      .prepare('INSERT INTO invoices(id,appointment_id,total) VALUES(?,?,?)')
      .run(invoiceId, id, data.visitType === 'NEW' ? doctor.fee : doctor.followup_fee);
    db.prepare('UPDATE invoices SET number=? WHERE id=?').run(
      `INV-${String(r.lastInsertRowid).padStart(6, '0')}`,
      invoiceId,
    );
    audit(db, userId, 'APPOINTMENT_CREATED', id);
    return db.prepare(`${appointmentQuery} WHERE a.id=?`).get(id);
  });
}
export function recordPayment(db, invoiceId, data, userId) {
  return transaction(db, () => {
    const existing = db.prepare('SELECT * FROM payments WHERE request_key=?').get(data.requestKey);
    if (existing) {
      requireThat(
        existing.invoice_id === invoiceId &&
          existing.amount === data.amount &&
          existing.method === data.method &&
          existing.reference === data.reference,
        409,
        'Payment request key already used with different details.',
      );
      return existing;
    }
    const invoice = db.prepare(`${invoiceQuery} WHERE i.id=?`).get(invoiceId);
    requireThat(invoice, 404, 'Invoice not found.');
    requireThat(
      !['CANCELLED', 'NO_SHOW'].includes(invoice.appointment_status),
      409,
      'Cannot collect payment for a cancelled or no-show appointment.',
    );
    requireThat(
      data.amount <= invoice.total - invoice.paid,
      409,
      'Amount exceeds the remaining balance.',
    );
    const id = randomUUID();
    db.prepare(
      'INSERT INTO payments(id,invoice_id,amount,method,reference,request_key,paid_on,created_by) VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      id,
      invoiceId,
      data.amount,
      data.method,
      data.reference,
      data.requestKey,
      today(),
      userId,
    );
    audit(db, userId, 'PAYMENT_RECORDED', id);
    return db.prepare('SELECT * FROM payments WHERE id=?').get(id);
  });
}
export function dailyReport(db, date) {
  const gross = db
    .prepare('SELECT COALESCE(SUM(amount),0) value FROM payments WHERE paid_on=?')
    .get(date).value;
  const reversed = db
    .prepare('SELECT COALESCE(SUM(amount),0) value FROM payments WHERE substr(reversed_at,1,10)=?')
    .get(date).value;
  const byMethod = db
    .prepare(
      'SELECT method,SUM(amount) amount,COUNT(*) count FROM payments WHERE paid_on=? GROUP BY method',
    )
    .all(date);
  const appointmentCounts = db
    .prepare('SELECT status,COUNT(*) count FROM appointments WHERE visit_date=? GROUP BY status')
    .all(date);
  const due = db
    .prepare(
      `SELECT COALESCE(SUM(total-paid),0) value FROM (${invoiceQuery}) WHERE visit_date=? AND appointment_status NOT IN ('CANCELLED','NO_SHOW')`,
    )
    .get(date).value;
  return { date, gross, reversed, net: gross - reversed, due, byMethod, appointmentCounts };
}
export const transitions = {
  BOOKED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_CONSULTATION', 'CANCELLED'],
  IN_CONSULTATION: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
