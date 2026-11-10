import { randomUUID } from 'node:crypto';
import { transaction, audit } from '../db.js';
import { doctorSchema, requireThat } from '../validation.js';
import { adminOnly } from '../auth.js';

export function registerDoctorsRoutes(app, db) {
  app.get('/api/doctors', (_, res) =>
    res.json(db.prepare('SELECT * FROM doctors ORDER BY name').all()),
  );
  app.post('/api/doctors', adminOnly, (req, res) => {
    const d = doctorSchema.parse(req.body),
      id = randomUUID();
    transaction(db, () => {
      db.prepare('INSERT INTO doctors VALUES(?,?,?,?,?,?,?)').run(
        id,
        d.name,
        d.specialty,
        d.fee,
        d.followupFee,
        d.capacity,
        Number(d.active),
      );
      audit(db, req.user.id, 'DOCTOR_CREATED', id);
    });
    res.status(201).json({ id });
  });
  app.put('/api/doctors/:id', adminOnly, (req, res) => {
    const d = doctorSchema.parse(req.body);
    requireThat(
      db.prepare('SELECT id FROM doctors WHERE id=?').get(req.params.id),
      404,
      'Doctor not found.',
    );
    transaction(db, () => {
      db.prepare(
        'UPDATE doctors SET name=?,specialty=?,fee=?,followup_fee=?,capacity=?,active=? WHERE id=?',
      ).run(d.name, d.specialty, d.fee, d.followupFee, d.capacity, Number(d.active), req.params.id);
      audit(db, req.user.id, 'DOCTOR_UPDATED', req.params.id);
    });
    res.json({ ok: true });
  });
}
