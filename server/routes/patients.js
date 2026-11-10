import { z } from 'zod';
import { createHash } from 'node:crypto';
import { today, transaction, audit, insertPatient } from '../db.js';
import { patientSchema, requireThat, normalizePhone } from '../validation.js';
import { appointmentQuery } from '../services.js';

export function registerPatientsRoutes(app, db) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS patient_requests(request_key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, patient_id TEXT NOT NULL REFERENCES patients(id))',
  );
  const getPatient = (id) => db.prepare('SELECT * FROM patients WHERE id=?').get(id);
  app.get('/api/patients', (req, res) => {
    const rawSearch = z
      .string()
      .max(120)
      .parse(req.query.search || '')
      .trim();
    const search = /^[+০-৯0-9\s()-]+$/.test(rawSearch) ? normalizePhone(rawSearch) : rawSearch;
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(req.query.page || 1);
    const pattern = `%${search.replace(/[!%_]/g, '!$&')}%`,
      where =
        "WHERE full_name LIKE ? ESCAPE '!' OR phone LIKE ? ESCAPE '!' OR mrn LIKE ? ESCAPE '!'";
    const total = db
      .prepare(`SELECT COUNT(*) n FROM patients ${where}`)
      .get(pattern, pattern, pattern).n;
    const items = db
      .prepare(`SELECT * FROM patients ${where} ORDER BY seq DESC LIMIT 10 OFFSET ?`)
      .all(pattern, pattern, pattern, (page - 1) * 10);
    res.json({ items, total, page, pageSize: 10 });
  });
  app.get('/api/patients/:id', (req, res) => {
    const patient = getPatient(req.params.id);
    requireThat(patient, 404, 'Patient not found.');
    res.json({
      patient,
      appointments: db
        .prepare(`${appointmentQuery} WHERE a.patient_id=? ORDER BY a.visit_date DESC`)
        .all(patient.id),
    });
  });
  app.post('/api/patients', (req, res) => {
    const data = patientSchema.parse(req.body);
    requireThat(
      (data.dateOfBirth || data.ageRecordedOn) <= today(),
      400,
      'Birth or recording date cannot be in the future.',
    );
    const key = z.string().uuid().parse(req.get('x-idempotency-key'));
    const digest = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const id = transaction(db, () => {
      const prior = db.prepare('SELECT * FROM patient_requests WHERE request_key=?').get(key);
      if (prior) {
        requireThat(
          prior.payload_hash === digest,
          409,
          'Submission key already used with different details.',
        );
        return prior.patient_id;
      }
      const id = insertPatient(db, data, req.user.id);
      db.prepare('INSERT INTO patient_requests VALUES(?,?,?)').run(key, digest, id);
      return id;
    });
    res.status(201).json(getPatient(id));
  });
  app.put('/api/patients/:id', (req, res) => {
    const data = patientSchema.parse(req.body);
    requireThat(getPatient(req.params.id), 404, 'Patient not found.');
    requireThat(
      (data.dateOfBirth || data.ageRecordedOn) <= today(),
      400,
      'Birth or recording date cannot be in the future.',
    );
    transaction(db, () => {
      db.prepare(
        "UPDATE patients SET full_name=?,phone=?,dob=?,estimated_months=?,age_recorded_on=?,address=?,contact_name=?,updated_at=datetime('now') WHERE id=?",
      ).run(
        data.fullName,
        data.phone,
        data.dateOfBirth ?? null,
        data.estimatedAgeMonths ?? null,
        data.ageRecordedOn ?? null,
        data.address,
        data.contactName,
        req.params.id,
      );
      audit(db, req.user.id, 'PATIENT_UPDATED', req.params.id);
    });
    res.json(getPatient(req.params.id));
  });
}
