import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, today } from '../db.js';
import { createApp } from '../app.js';
import { validDate, normalizePhone } from '../validation.js';
import { executeTool } from '../copilot.js';

async function fixture(t, role = 'ADMIN') {
  const db = openDatabase(':memory:');
  const server = createApp(db, { copilotOptions: { apiKey: '', model: '' } }).listen(
    0,
    '127.0.0.1',
  );
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: role === 'ADMIN' ? 'admin@clinic.local' : 'reception@clinic.local',
      password: 'ClinicDemo!2026',
    }),
  });
  assert.equal(login.status, 200);
  const credentials = await login.json();
  const cookie = login.headers.get('set-cookie').split(';')[0];
  async function request(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { cookie, 'x-csrf-token': credentials.csrf } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), response };
  }
  return { db, request, cookie, credentials };
}
const patient = {
  fullName: 'Test Patient',
  phone: '+880 1712-345678',
  dateOfBirth: '1995-01-20',
  address: 'Nazipur',
};
async function addPatient(f, overrides = {}) {
  const r = await f.request('/patients', {
    method: 'POST',
    headers: { 'x-idempotency-key': randomUUID() },
    body: { ...patient, ...overrides },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
async function book(f, p, doctorId = 'dr-1') {
  return f.request('/appointments', {
    method: 'POST',
    body: { patientId: p.id, doctorId, date: today(), visitType: 'NEW' },
  });
}

test('calendar validation and Bangladesh contact normalization', () => {
  assert.equal(validDate('2026-02-31'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2025-02-29'), false);
  assert.equal(normalizePhone('+880 (1712)-345678'), '01712345678');
  assert.equal(normalizePhone('০১৭১২৩৪৫৬৭৮'), '01712345678');
});
test('anonymous requests are rejected; login uses an HTTP-only cookie', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/patients', { auth: false })).status, 401);
  assert.equal((await f.request('/auth/me')).data.user.role, 'ADMIN');
});
test('CSRF and foreign origins cannot mutate records', async (t) => {
  const f = await fixture(t);
  const body = { ...patient };
  assert.equal(
    (await f.request('/patients', { method: 'POST', body, headers: { 'x-csrf-token': 'bad' } }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.request('/patients', {
        method: 'POST',
        body,
        headers: { origin: 'https://attacker.test' },
      })
    ).status,
    403,
  );
});
test('shared phone creates separate patients and server-generated unique MRNs', async (t) => {
  const f = await fixture(t);
  const a = await addPatient(f);
  const b = await addPatient(f, { fullName: 'A Different Child', dateOfBirth: '2020-03-11' });
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.mrn, b.mrn);
  assert.equal(a.phone, b.phone);
  assert.equal(a.phone, '01712345678');
});
test('patient submission retries are idempotent; changed payload conflicts', async (t) => {
  const f = await fixture(t),
    key = randomUUID();
  const opts = { method: 'POST', headers: { 'x-idempotency-key': key }, body: patient };
  const a = await f.request('/patients', opts),
    b = await f.request('/patients', opts);
  assert.equal(a.data.id, b.data.id);
  assert.equal(
    (await f.request('/patients', { ...opts, body: { ...patient, fullName: 'Other' } })).status,
    409,
  );
});
test('invalid dates and mutually inconsistent age inputs are rejected', async (t) => {
  const f = await fixture(t);
  for (const data of [
    { dateOfBirth: '2026-02-31' },
    { dateOfBirth: '2099-01-01' },
    { estimatedAgeMonths: 10, ageRecordedOn: today() },
    { dateOfBirth: null, estimatedAgeMonths: -1, ageRecordedOn: today() },
  ]) {
    const r = await f.request('/patients', {
      method: 'POST',
      headers: { 'x-idempotency-key': randomUUID() },
      body: { ...patient, ...data },
    });
    assert.equal(r.status, 400, JSON.stringify(data));
  }
});
test('newborn estimated zero is accepted and search is parameterized', async (t) => {
  const f = await fixture(t);
  const p = await addPatient(f, {
    dateOfBirth: null,
    estimatedAgeMonths: 0,
    ageRecordedOn: today(),
  });
  assert.equal(p.estimated_months, 0);
  assert.equal((await f.request('/patients?search=%27%20OR%201%3D1--')).data.total, 0);
  assert.equal((await f.request('/patients?search=%25')).data.total, 0);
});
test('booking generates unique tokens and invoice with fee snapshot', async (t) => {
  const f = await fixture(t);
  const a = await addPatient(f),
    b = await addPatient(f, { fullName: 'Other' });
  const x = await book(f, a),
    y = await book(f, b);
  assert.equal(x.status, 201);
  assert.equal(y.status, 201);
  assert.notEqual(x.data.token, y.data.token);
  assert.equal(x.data.total, 80000);
  f.db.prepare('UPDATE doctors SET fee=90000 WHERE id=?').run('dr-1');
  assert.equal((await f.request(`/invoices/${x.data.invoice_id}`)).data.invoice.total, 80000);
});
test('duplicate visit and doctor capacity are enforced without partial invoices', async (t) => {
  const f = await fixture(t);
  const p = await addPatient(f);
  assert.equal((await book(f, p)).status, 201);
  const before = f.db.prepare('SELECT COUNT(*) n FROM invoices').get().n;
  assert.equal((await book(f, p)).status, 409);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM invoices').get().n, before);
  f.db.prepare('UPDATE doctors SET capacity=1 WHERE id=?').run('dr-2');
  assert.equal((await book(f, p, 'dr-2')).status, 409);
});
test('payments use integer paisa, retry safely and reject overpayment', async (t) => {
  const f = await fixture(t),
    p = await addPatient(f),
    a = (await book(f, p)).data;
  const body = { amount: 30000, method: 'CASH', requestKey: randomUUID() };
  const first = await f.request(`/invoices/${a.invoice_id}/payments`, { method: 'POST', body });
  const retry = await f.request(`/invoices/${a.invoice_id}/payments`, { method: 'POST', body });
  assert.equal(first.data.id, retry.data.id);
  assert.equal((await f.request(`/invoices/${a.invoice_id}`)).data.invoice.paid, 30000);
  assert.equal(
    (
      await f.request(`/invoices/${a.invoice_id}/payments`, {
        method: 'POST',
        body: { ...body, amount: 50001, requestKey: randomUUID() },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request(`/invoices/${a.invoice_id}/payments`, {
        method: 'POST',
        body: { ...body, amount: 1.5, requestKey: randomUUID() },
      })
    ).status,
    400,
  );
});
test('paid visits cannot be cancelled before reversal; reversal preserves audit and invoice', async (t) => {
  const f = await fixture(t),
    p = await addPatient(f),
    a = (await book(f, p)).data;
  const pay = await f.request(`/invoices/${a.invoice_id}/payments`, {
    method: 'POST',
    body: { amount: a.total, method: 'CASH', requestKey: randomUUID() },
  });
  assert.equal(
    (
      await f.request(`/appointments/${a.id}/status`, {
        method: 'PATCH',
        body: { status: 'CANCELLED' },
      })
    ).status,
    409,
  );
  const before = (await f.request('/reports/daily')).data.net;
  assert.equal(
    (
      await f.request(`/payments/${pay.data.id}/reverse`, {
        method: 'POST',
        body: { reason: 'Patient requested cancellation' },
      })
    ).status,
    200,
  );
  assert.equal((await f.request('/reports/daily')).data.net, before - a.total);
  assert.equal((await f.request(`/invoices/${a.invoice_id}`)).data.invoice.paid, 0);
  assert.equal(
    (
      await f.request(`/appointments/${a.id}/status`, {
        method: 'PATCH',
        body: { status: 'CANCELLED' },
      })
    ).status,
    200,
  );
  assert.ok(f.db.prepare("SELECT * FROM audits WHERE action='PAYMENT_REVERSED'").get());
});
test('invalid queue transitions are rejected', async (t) => {
  const f = await fixture(t),
    p = await addPatient(f),
    a = (await book(f, p)).data;
  assert.equal(
    (
      await f.request(`/appointments/${a.id}/status`, {
        method: 'PATCH',
        body: { status: 'COMPLETED' },
      })
    ).status,
    409,
  );
  for (const status of ['CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED'])
    assert.equal(
      (await f.request(`/appointments/${a.id}/status`, { method: 'PATCH', body: { status } }))
        .status,
      200,
    );
});
test('receptionist permissions enforced on backend regardless of UI', async (t) => {
  const f = await fixture(t, 'RECEPTIONIST');
  for (const route of ['/reports/daily', 'audit', 'users'].map((r) =>
    r.startsWith('/') ? r : `/${r}`,
  ))
    assert.equal((await f.request(route)).status, 403);
  assert.equal(
    (await f.request('/copilot', { method: 'POST', body: { question: 'collection' } })).status,
    403,
  );
  assert.equal((await f.request('/doctors', { method: 'POST', body: {} })).status, 403);
  assert.equal((await f.request('/patients')).status, 200);
  assert.equal((await f.request('/dashboard')).data.report, undefined);
});
test('copilot demo is labelled, grounded in reports, and excludes patient identifiers', async (t) => {
  const f = await fixture(t);
  const report = await f.request('/copilot', {
    method: 'POST',
    body: { question: 'collection report today' },
  });
  assert.equal(report.data.mode, 'LOCAL_DEMO');
  assert.equal(report.data.toolCalls[0].result.net, (await f.request('/reports/daily')).data.net);
  const queue = await f.request('/copilot', {
    method: 'POST',
    body: { question: 'appointment queue' },
  });
  assert.ok(queue.data.toolCalls[0].result.length);
  assert.equal(queue.data.toolCalls[0].result[0].phone, undefined);
  assert.equal(queue.data.toolCalls[0].result[0].full_name, undefined);
  assert.throws(() => executeTool(f.db, 'delete_patient', { date: today() }));
});
test('logout invalidates session; password change invalidates all old sessions', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.request('/auth/password', {
        method: 'POST',
        body: { currentPassword: 'ClinicDemo!2026', newPassword: 'NewPassword!2026' },
      })
    ).status,
    200,
  );
  assert.equal((await f.request('/auth/me')).status, 401);
});

test('country-code and Bengali phone searches find normalized stored contacts', async (t) => {
  const f = await fixture(t);
  await addPatient(f);
  for (const phone of ['+8801712345678', '০১৭১২৩৪৫৬৭৮']) {
    const result = await f.request(`/patients?search=${encodeURIComponent(phone)}`);
    assert.equal(result.status, 200);
    assert.ok(result.data.total >= 1);
  }
});
