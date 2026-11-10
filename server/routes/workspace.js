import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { today, transaction, audit, passwordHash } from '../db.js';
import { dateSchema, requireThat } from '../validation.js';
import { adminOnly } from '../auth.js';
import { dailyReport, appointmentQuery } from '../services.js';

export function registerWorkspaceRoutes(app, db) {
  app.get('/api/dashboard', (req, res) => {
    const date = today();
    const report = dailyReport(db, date);
    const appointments = db
      .prepare(`${appointmentQuery} WHERE a.visit_date=? ORDER BY a.token LIMIT 8`)
      .all(date);
    res.json({
      date,
      patientCount: db.prepare('SELECT COUNT(*) n FROM patients').get().n,
      doctorCount: db.prepare('SELECT COUNT(*) n FROM doctors WHERE active=1').get().n,
      report: req.user.role === 'ADMIN' ? report : undefined,
      appointmentCount: db
        .prepare('SELECT COUNT(*) n FROM appointments WHERE visit_date=?')
        .get(date).n,
      appointments,
    });
  });
  app.get('/api/reports/daily', adminOnly, (req, res) =>
    res.json(dailyReport(db, dateSchema.parse(req.query.date || today()))),
  );
  app.get('/api/audit', adminOnly, (_, res) =>
    res.json(
      db
        .prepare(
          'SELECT a.*,u.name actor FROM audits a JOIN users u ON u.id=a.user_id ORDER BY a.seq DESC LIMIT 100',
        )
        .all(),
    ),
  );
  app.get('/api/users', adminOnly, (_, res) =>
    res.json(db.prepare('SELECT id,name,email,role FROM users ORDER BY name').all()),
  );
  app.post('/api/users', adminOnly, (req, res) => {
    const d = z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().email().max(200),
        password: z.string().min(12).max(200),
        role: z.enum(['ADMIN', 'RECEPTIONIST']),
      })
      .parse(req.body);
    const id = randomUUID();
    requireThat(
      !db.prepare('SELECT id FROM users WHERE email=?').get(d.email.toLowerCase()),
      409,
      'Email already exists.',
    );
    transaction(db, () => {
      db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
        id,
        d.name,
        d.email.toLowerCase(),
        passwordHash(d.password),
        d.role,
      );
      audit(db, req.user.id, 'STAFF_CREATED', id);
    });
    res.status(201).json({ id });
  });
}
