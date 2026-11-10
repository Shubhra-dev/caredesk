import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';

export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function openDatabase(
  path = process.env.DB_PATH || './data/clinic.sqlite',
  { seed = true } = {},
) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('ADMIN','RECEPTIONIST')));
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS patients(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, mrn TEXT UNIQUE, full_name TEXT NOT NULL, phone TEXT NOT NULL, dob TEXT, estimated_months INTEGER, age_recorded_on TEXT, address TEXT NOT NULL DEFAULT '', contact_name TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK((dob IS NOT NULL AND estimated_months IS NULL AND age_recorded_on IS NULL) OR (dob IS NULL AND estimated_months IS NOT NULL AND estimated_months >= 0 AND age_recorded_on IS NOT NULL)));
    CREATE INDEX IF NOT EXISTS patient_phone ON patients(phone);
    CREATE INDEX IF NOT EXISTS patient_name ON patients(full_name);
    CREATE TABLE IF NOT EXISTS doctors(id TEXT PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL, fee INTEGER NOT NULL CHECK(fee >= 0), followup_fee INTEGER NOT NULL CHECK(followup_fee >= 0), capacity INTEGER NOT NULL CHECK(capacity > 0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
    CREATE TABLE IF NOT EXISTS appointments(id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), doctor_id TEXT NOT NULL REFERENCES doctors(id), visit_date TEXT NOT NULL, token INTEGER NOT NULL, visit_type TEXT NOT NULL CHECK(visit_type IN ('NEW','FOLLOW_UP')), status TEXT NOT NULL DEFAULT 'BOOKED' CHECK(status IN ('BOOKED','CHECKED_IN','IN_CONSULTATION','COMPLETED','CANCELLED','NO_SHOW')), created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(doctor_id,visit_date,token));
    CREATE TABLE IF NOT EXISTS invoices(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, number TEXT UNIQUE, appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id), total INTEGER NOT NULL CHECK(total >= 0), created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS payments(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, invoice_id TEXT NOT NULL REFERENCES invoices(id), amount INTEGER NOT NULL CHECK(amount > 0), method TEXT NOT NULL CHECK(method IN ('CASH','MFS','CARD')), reference TEXT NOT NULL DEFAULT '', request_key TEXT NOT NULL UNIQUE, paid_on TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), reversed_at TEXT, reversal_reason TEXT, reversed_by TEXT REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS audits(seq INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, entity_id TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO schema_version VALUES(1);
  `);
  if (seed && !db.prepare('SELECT id FROM users LIMIT 1').get()) seedDatabase(db);
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    db.exec('COMMIT');
    return value;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
export function audit(db, userId, action, entityId, detail = '') {
  db.prepare('INSERT INTO audits(user_id,action,entity_id,detail) VALUES(?,?,?,?)').run(
    userId,
    action,
    entityId,
    detail,
  );
}
export function insertPatient(db, data, userId) {
  const id = randomUUID();
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO patients(id,full_name,phone,dob,estimated_months,age_recorded_on,address,contact_name,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      data.fullName,
      data.phone,
      data.dateOfBirth ?? null,
      data.estimatedAgeMonths ?? null,
      data.ageRecordedOn ?? null,
      data.address || '',
      data.contactName || '',
      userId,
    );
  db.prepare('UPDATE patients SET mrn=? WHERE id=?').run(
    `PT-${String(lastInsertRowid).padStart(6, '0')}`,
    id,
  );
  audit(db, userId, 'PATIENT_CREATED', id);
  return id;
}
export function seedDatabase(db) {
  const password = process.env.INITIAL_ADMIN_PASSWORD || 'ClinicDemo!2026';
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.INITIAL_ADMIN_PASSWORD || password.length < 12)
  )
    throw new Error(
      'Set INITIAL_ADMIN_PASSWORD (12+ characters) before production initialization.',
    );
  transaction(db, () => {
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
      'admin',
      'Clinic Administrator',
      'admin@clinic.local',
      passwordHash(password),
      'ADMIN',
    );
    if (process.env.NODE_ENV === 'production') return;
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
      'reception',
      'Front Desk',
      'reception@clinic.local',
      passwordHash('ClinicDemo!2026'),
      'RECEPTIONIST',
    );
    const doctors = [
      ['dr-1', 'Dr. Ayesha Rahman', 'General Medicine', 80000, 50000, 20],
      ['dr-2', 'Dr. Farhan Ahmed', 'Pediatrics', 100000, 60000, 16],
      ['dr-3', 'Dr. Nusrat Jahan', 'Internal Medicine', 120000, 70000, 18],
    ];
    const addDoctor = db.prepare(
      'INSERT INTO doctors(id,name,specialty,fee,followup_fee,capacity) VALUES(?,?,?,?,?,?)',
    );
    doctors.forEach((d) => addDoctor.run(...d));
    const people = [
      ['Rahima Begum', '01712345678', '1988-04-12'],
      ['Arif Hossain', '01812345678', '1996-07-08'],
      ['Maliha Akter', '01912345678', '2002-01-17'],
      ['Sajid Hasan', '01612345678', '2018-03-21'],
      ['Sumaiya Rahman', '01512345678', '1993-11-04'],
      ['Abdul Karim', '01312345678', '1965-02-10'],
      ['Tanvir Ahmed', '01412345678', '1985-09-15'],
      ['Nadia Islam', '01712345678', '2015-08-02'],
    ];
    people.forEach((p, index) => {
      const patientId = insertPatient(
        db,
        { fullName: p[0], phone: p[1], dateOfBirth: p[2], address: 'Nazipur, Naogaon' },
        'admin',
      );
      if (index >= 6) return;
      const appointmentId = randomUUID(),
        invoiceId = randomUUID(),
        doctor = doctors[index % 3];
      db.prepare(
        'INSERT INTO appointments(id,patient_id,doctor_id,visit_date,token,visit_type,status,created_by) VALUES(?,?,?,?,?,?,?,?)',
      ).run(
        appointmentId,
        patientId,
        doctor[0],
        today(),
        Math.floor(index / 3) + 1,
        'NEW',
        index === 0
          ? 'COMPLETED'
          : index === 1
            ? 'IN_CONSULTATION'
            : index === 2
              ? 'CHECKED_IN'
              : 'BOOKED',
        'admin',
      );
      const r = db
        .prepare('INSERT INTO invoices(id,appointment_id,total) VALUES(?,?,?)')
        .run(invoiceId, appointmentId, doctor[3]);
      db.prepare('UPDATE invoices SET number=? WHERE id=?').run(
        `INV-${String(r.lastInsertRowid).padStart(6, '0')}`,
        invoiceId,
      );
      if (index < 3)
        db.prepare(
          'INSERT INTO payments(id,invoice_id,amount,method,request_key,paid_on,created_by) VALUES(?,?,?,?,?,?,?)',
        ).run(randomUUID(), invoiceId, doctor[3], 'CASH', randomUUID(), today(), 'admin');
    });
  });
}
