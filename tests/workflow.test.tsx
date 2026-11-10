import { StrictMode } from 'react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { AuthProvider } from '../src/features/auth/AuthContext';
import App from '../src/App';

const db = openDatabase(':memory:');
const server = createApp(db, { copilotOptions: { apiKey: '', model: '' } }).listen(0, '127.0.0.1');
const nativeFetch = globalThis.fetch;
let cookie = '';
beforeAll(async () => {
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  vi.stubGlobal('fetch', async (input, options = {}) => {
    const headers = new Headers(options.headers);
    if (cookie) headers.set('cookie', cookie);
    const result = await nativeFetch(new URL(String(input), base), { ...options, headers });
    const set = result.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return result;
  });
  // DOM emulation only: this does not prove native focus containment or layout.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  };
});
afterEach(cleanup);
afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise((resolve) => server.close(resolve));
  db.close();
});
it('runs login → patient → appointment → partial/full payment → copilot against the real API', async () => {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
  await user.type(await screen.findByLabelText('Email address'), 'admin@clinic.local');
  await user.type(screen.getByLabelText('Password'), 'ClinicDemo!2026');
  await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  await screen.findByRole('heading', { name: 'A good day to care.' });
  await user.click(screen.getByRole('link', { name: 'Patients', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Register patient' }));
  let dialog = within(screen.getByRole('dialog'));
  await user.type(dialog.getByLabelText('Full name *'), 'Workflow Test Patient');
  await user.type(dialog.getByLabelText('Contact number *'), '01700000991');
  await user.type(dialog.getByLabelText('Date of birth *'), '1994-03-15');
  await user.click(dialog.getByRole('button', { name: 'Register patient' }));
  await screen.findByText('Workflow Test Patient', { exact: true });
  expect(
    db.prepare('SELECT COUNT(*) n FROM patients WHERE full_name=?').get('Workflow Test Patient').n,
  ).toBe(1);
  await user.click(screen.getByRole('link', { name: 'Appointments', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Book appointment', exact: true }));
  dialog = within(screen.getByRole('dialog'));
  const patient = db
    .prepare('SELECT id FROM patients WHERE full_name=?')
    .get('Workflow Test Patient');
  await user.selectOptions(
    dialog.getByLabelText('Patient *'),
    await dialog.findByRole('option', { name: /Workflow Test Patient/ }),
  );
  await user.selectOptions(dialog.getByLabelText('Doctor *'), 'dr-1');
  await user.click(dialog.getByRole('button', { name: 'Confirm appointment' }));
  await screen.findByText('Workflow Test Patient', { exact: true });
  expect(
    db.prepare('SELECT COUNT(*) n FROM appointments WHERE patient_id=?').get(patient.id).n,
  ).toBe(1);
  await user.click(screen.getByRole('link', { name: 'Billing & receipts', exact: true }));
  const row = await screen.findByRole('row', { name: /Workflow Test Patient/ });
  await user.click(within(row).getByRole('link', { name: 'Open' }));
  await user.click(await screen.findByRole('button', { name: 'Collect payment', exact: true }));
  dialog = within(screen.getByRole('dialog'));
  await user.clear(dialog.getByLabelText('Amount received (BDT) *'));
  await user.type(dialog.getByLabelText('Amount received (BDT) *'), '300');
  await user.click(dialog.getByRole('button', { name: 'Confirm payment received' }));
  await screen.findByText('partial', { exact: true });
  await user.click(screen.getByRole('button', { name: 'Collect payment', exact: true }));
  dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByLabelText('Amount received (BDT) *').value).toBe('500.00');
  await user.click(dialog.getByRole('button', { name: 'Confirm payment received' }));
  await screen.findByRole('heading', { name: 'Paid invoice / receipt' });
  await user.click(screen.getByRole('link', { name: /AI Copilot/ }));
  await user.click(screen.getByRole('button', { name: /Show collection report/ }));
  await screen.findByText('Local demo · rule-based, not an LLM', { exact: true });
  expect(screen.queryByRole('alert')).toBeNull();
}, 20000);
