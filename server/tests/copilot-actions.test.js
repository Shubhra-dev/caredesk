import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, today, insertPatient, transaction } from '../db.js';
import { executeTool } from '../copilot.js';
import {
  ensureCopilotSchema,
  createConversation,
  publicConversation,
  selectEntity,
  beginTurn,
  finishTurn,
} from '../copilot/store.js';
import { confirmDraft, cancelDraft } from '../copilot/actions.js';
import { createApp } from '../app.js';
import { createSession } from '../auth.js';
const tomorrow = () => new Date(Date.parse(today()) + 86400000).toISOString().slice(0, 10);
function setup(t) {
  const db = openDatabase(':memory:');
  ensureCopilotSchema(db);
  t.after(() => db.close());
  const id = createConversation(db, 'admin', 'Test workflow');
  return { db, id, context: { conversationId: id, userId: 'admin' } };
}
function booking(f) {
  const patient = executeTool(f.db, 'search_patients', { query: 'Abdul Karim' }, f.context)
    .items[0];
  const doctor = executeTool(f.db, 'find_doctors', { query: 'Ayesha' }, f.context).items[0];
  return executeTool(
    f.db,
    'prepare_booking',
    { patientId: patient.id, doctorId: doctor.id, date: tomorrow(), visitType: 'NEW' },
    f.context,
  ).action;
}

test('booking preparation never writes appointments; explicit confirmation commits exactly once', (t) => {
  const f = setup(t),
    before = f.db.prepare('SELECT COUNT(*) n FROM appointments').get().n,
    draft = booking(f);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM appointments').get().n, before);
  const first = confirmDraft(f.db, draft.id, 'admin'),
    retry = confirmDraft(f.db, draft.id, 'admin');
  assert.equal(first.action.status, 'CONFIRMED');
  assert.equal(first.action.result.appointmentId, retry.action.result.appointmentId);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM appointments').get().n, before + 1);
  assert.equal(
    f.db
      .prepare('SELECT COUNT(*) n FROM invoices WHERE appointment_id=?')
      .get(first.action.result.appointmentId).n,
    1,
  );
});
test('confirmation is bound to owner; cancelled, expired and superseded previews cannot execute', (t) => {
  const f = setup(t);
  let d = booking(f);
  assert.throws(
    () => confirmDraft(f.db, d.id, 'reception'),
    (e) => e.status === 404,
  );
  cancelDraft(f.db, d.id, 'admin');
  assert.throws(
    () => confirmDraft(f.db, d.id, 'admin'),
    (e) => e.status === 409,
  );
  d = booking(f);
  f.db.prepare('UPDATE copilot_drafts SET expires_at=0 WHERE id=?').run(d.id);
  assert.throws(() => confirmDraft(f.db, d.id, 'admin'), /expired/);
  d = booking(f);
  const newer = booking(f);
  assert.throws(() => confirmDraft(f.db, d.id, 'admin'), /no longer active/);
  assert.equal(newer.status, 'PENDING');
});
test('fee changes and new capacity conflicts are rechecked at confirmation', (t) => {
  const f = setup(t);
  let d = booking(f);
  f.db.prepare("UPDATE doctors SET fee=fee+100 WHERE id='dr-1'").run();
  assert.throws(() => confirmDraft(f.db, d.id, 'admin'), /fee changed/);
  d = booking(f);
  f.db.prepare("UPDATE doctors SET capacity=1 WHERE id='dr-1'").run();
  const other = transaction(f.db, () =>
    insertPatient(
      f.db,
      { fullName: 'Other Person', phone: '01700000099', dateOfBirth: '1990-01-01' },
      'admin',
    ),
  );
  f.db
    .prepare(
      'INSERT INTO appointments(id,patient_id,doctor_id,visit_date,token,visit_type,status,created_by) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(randomUUID(), other, 'dr-1', tomorrow(), 1, 'NEW', 'BOOKED', 'admin');
  const before = f.db.prepare('SELECT COUNT(*) n FROM invoices').get().n;
  assert.throws(() => confirmDraft(f.db, d.id, 'admin'), /capacity/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM invoices').get().n, before);
});
test('ambiguous patients require explicit selection, not model choosing the first match', (t) => {
  const f = setup(t);
  transaction(f.db, () =>
    insertPatient(
      f.db,
      { fullName: 'Abdul Karim Second', phone: '01700000098', dateOfBirth: '1980-01-01' },
      'admin',
    ),
  );
  const results = executeTool(f.db, 'search_patients', { query: 'Abdul Karim' }, f.context);
  assert.equal(results.requiresSelection, true);
  const doctor = executeTool(f.db, 'find_doctors', { query: 'Ayesha' }, f.context).items[0];
  const payload = {
    patientId: results.items[0].id,
    doctorId: doctor.id,
    date: tomorrow(),
    visitType: 'NEW',
  };
  assert.throws(() => executeTool(f.db, 'prepare_booking', payload, f.context), /ambiguous/);
  selectEntity(f.db, f.id, 'admin', 'patient', results.items[0].id, 0);
  assert.equal(executeTool(f.db, 'prepare_booking', payload, f.context).confirmationRequired, true);
});
test('unobserved IDs cannot be selected or used by model tools', (t) => {
  const f = setup(t);
  assert.throws(
    () => selectEntity(f.db, f.id, 'admin', 'patient', 'made-up', 0),
    /returned in this conversation/,
  );
  assert.throws(
    () =>
      executeTool(f.db, 'doctor_availability', { doctorId: 'dr-1', date: tomorrow() }, f.context),
    /Look up/,
  );
  assert.throws(
    () => executeTool(f.db, 'execute_sql', { sql: 'DELETE FROM patients' }, f.context),
    /Unknown/,
  );
});
test('patient registration preview requires confirmation, supports shared contacts, and retries safely', (t) => {
  const f = setup(t);
  executeTool(f.db, 'search_patients', { query: 'Different Child' }, f.context);
  const payload = {
    fullName: 'Different Child',
    phone: '01712345678',
    dateOfBirth: '2020-01-01',
    estimatedAgeMonths: null,
    ageRecordedOn: null,
    address: '',
    contactName: 'Mother',
  };
  const before = f.db.prepare('SELECT COUNT(*) n FROM patients').get().n;
  const draft = executeTool(f.db, 'prepare_registration', payload, f.context).action;
  assert.ok(draft.preview.matches.length);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM patients').get().n, before);
  assert.throws(() => confirmDraft(f.db, draft.id, 'admin'), /shared contact/);
  const first = confirmDraft(f.db, draft.id, 'admin', { acknowledgeSharedContact: true }),
    retry = confirmDraft(f.db, draft.id, 'admin', { acknowledgeSharedContact: true });
  assert.equal(first.action.result.patientId, retry.action.result.patientId);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM patients').get().n, before + 1);
  assert.equal(
    publicConversation(f.db, f.id, 'admin').selectedPatientId,
    first.action.result.patientId,
  );
});
test('conversation revisions prevent stale tabs and history is owner private', (t) => {
  const f = setup(t);
  beginTurn(f.db, f.id, 'admin', 0);
  assert.throws(() => beginTurn(f.db, f.id, 'admin', 0), /processing/);
  finishTurn(f.db, f.id, 'admin', 'Hello', {
    mode: 'LOCAL_DEMO',
    answer: 'Hi',
    toolCalls: [],
    actions: [],
  });
  assert.equal(publicConversation(f.db, f.id, 'admin').events.length, 2);
  assert.throws(() => beginTurn(f.db, f.id, 'admin', 0), /another tab/);
  assert.throws(
    () => publicConversation(f.db, f.id, 'reception'),
    (e) => e.status === 404,
  );
});
test('new question supersedes unconfirmed action without modifying operational records', (t) => {
  const f = setup(t),
    d = booking(f),
    before = f.db.prepare('SELECT COUNT(*) n FROM appointments').get().n;
  beginTurn(f.db, f.id, 'admin', 0);
  f.db.prepare('UPDATE copilot_conversations SET busy_until=0 WHERE id=?').run(f.id);
  assert.throws(() => confirmDraft(f.db, d.id, 'admin'), /no longer active/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM appointments').get().n, before);
});
test('report ranges are bounded and sum verified daily values', (t) => {
  const f = setup(t),
    r = executeTool(f.db, 'report_range', { fromDate: today(), toDate: tomorrow() });
  assert.equal(r.days.length, 2);
  assert.equal(
    r.totalNet,
    r.days.reduce((n, d) => n + d.net, 0),
  );
  assert.throws(
    () => executeTool(f.db, 'report_range', { fromDate: '2026-01-01', toDate: '2026-12-31' }),
    /31 days/,
  );
});
test('HTTP action confirmation rejects receptionist and fee/body tampering', async (t) => {
  const db = openDatabase(':memory:');
  const app = createApp(db, { copilotOptions: { apiKey: '', model: '' } }),
    server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });
  const id = createConversation(db, 'admin', 'HTTP test'),
    f = { db, id, context: { conversationId: id, userId: 'admin' } },
    draft = booking(f);
  const base = `http://127.0.0.1:${server.address().port}/api/copilot/actions/${draft.id}/confirm`;
  for (const [user, body, status] of [
    ['reception', {}, 403],
    ['admin', { fee: 1 }, 400],
  ]) {
    const s = createSession(db, user);
    const response = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `clinic_session=${s.token}`,
        'x-csrf-token': s.csrf,
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, status);
  }
  const s = createSession(db, 'admin'),
    options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `clinic_session=${s.token}`,
        'x-csrf-token': s.csrf,
      },
      body: '{}',
    };
  const [a, b] = await Promise.all([fetch(base, options), fetch(base, options)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(
    (await a.json()).action.result.appointmentId,
    (await b.json()).action.result.appointmentId,
  );
});

test('production gate also blocks an existing development draft at confirmation', (t) => {
  const f = setup(t),
    draft = booking(f);
  const before = f.db.prepare('SELECT COUNT(*) n FROM appointments').get().n;
  const oldMode = process.env.NODE_ENV,
    oldApproved = process.env.COPILOT_PATIENT_TOOLS_APPROVED;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.COPILOT_PATIENT_TOOLS_APPROVED;
    assert.throws(
      () => confirmDraft(f.db, draft.id, 'admin'),
      (e) => e.status === 403,
    );
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM appointments').get().n, before);
  } finally {
    if (oldMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldMode;
    if (oldApproved === undefined) delete process.env.COPILOT_PATIENT_TOOLS_APPROVED;
    else process.env.COPILOT_PATIENT_TOOLS_APPROVED = oldApproved;
  }
});
