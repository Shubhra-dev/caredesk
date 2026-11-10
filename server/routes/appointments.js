import { z } from 'zod';
import { today, transaction, audit } from '../db.js';
import { appointmentSchema, dateSchema, requireThat } from '../validation.js';
import { createAppointment, invoiceQuery, appointmentQuery, transitions } from '../services.js';

export function registerAppointmentsRoutes(app, db) {
  app.get('/api/appointments', (req, res) => {
    const date = dateSchema.parse(req.query.date || today());
    res.json(
      db.prepare(`${appointmentQuery} WHERE a.visit_date=? ORDER BY a.doctor_id,a.token`).all(date),
    );
  });
  app.post('/api/appointments', (req, res) => {
    const data = appointmentSchema.parse(req.body);
    requireThat(data.date >= today(), 400, 'Cannot book an appointment in the past.');
    res.status(201).json(createAppointment(db, data, req.user.id));
  });
  app.patch('/api/appointments/:id/status', (req, res) => {
    const { status } = z
      .object({
        status: z.enum(['CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
      })
      .parse(req.body);
    transaction(db, () => {
      const a = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);
      requireThat(a, 404, 'Appointment not found.');
      requireThat(
        transitions[a.status].includes(status),
        409,
        'Invalid appointment status transition.',
      );
      const invoice = db.prepare(`${invoiceQuery} WHERE i.appointment_id=?`).get(a.id);
      requireThat(
        !['CANCELLED', 'NO_SHOW'].includes(status) || invoice.paid === 0,
        409,
        'Reverse payments before cancelling or marking no-show.',
      );
      db.prepare('UPDATE appointments SET status=? WHERE id=?').run(status, a.id);
      audit(db, req.user.id, `APPOINTMENT_${status}`, a.id);
    });
    res.json({ ok: true });
  });
}
