import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { openDatabase, today } from '../server/db.js';
import { createApp } from '../server/app.js';
import { AuthProvider } from '../src/features/auth/AuthContext';
import App from '../src/App';
const db = openDatabase(':memory:');
const server = createApp(db, {
  copilotOptions: { provider: 'gemini', apiKey: 'simulated-key', model: 'test-model' },
}).listen(0, '127.0.0.1');
const nativeFetch = globalThis.fetch;
let cookie = '',
  modelCalls = 0;
let patientId = '';
const tomorrow = () => new Date(Date.parse(today()) + 86400000).toISOString().slice(0, 10);
beforeAll(async () => {
  if (!server.listening) await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  vi.stubGlobal('fetch', async (input, options = {}) => {
    if (String(input).startsWith('https://generativelanguage.googleapis.com')) {
      modelCalls++;
      const body = JSON.parse(options.body);
      const lastUser = body.messages.findLastIndex((m) => m.role === 'user');
      const current = body.messages.slice(lastUser + 1);
      const last = current.at(-1);
      function response(message) {
        return Response.json({ choices: [{ message: { role: 'assistant', ...message } }] });
      }
      function call(id, name, args) {
        return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
      }
      if (!current.length) {
        if (body.messages[lastUser].content.toLowerCase().includes('balance'))
          return response({
            content: null,
            tool_calls: [call('history', 'patient_history', { patientId })],
          });
        return response({
          content: null,
          tool_calls: [
            call('patients', 'search_patients', { query: 'Abdul Karim' }),
            call('doctors', 'find_doctors', { query: 'Ayesha' }),
          ],
        });
      }
      const result = JSON.parse(last.content);
      if (result.kind === 'doctors') {
        const patientResult = current.find(
          (m) => m.role === 'tool' && JSON.parse(m.content).kind === 'patients',
        );
        patientId = JSON.parse(patientResult.content).items[0].id;
        return response({
          content: null,
          tool_calls: [
            call('preview', 'prepare_booking', {
              patientId,
              doctorId: result.items[0].id,
              date: tomorrow(),
              visitType: 'NEW',
            }),
          ],
        });
      }
      if (result.kind === 'action_preview')
        return response({ content: 'Booking prepared for review.' });
      if (result.kind === 'patient_history')
        return response({
          content: 'The selected patient’s verified visits and balances are shown below.',
        });
      throw new Error('Unexpected simulated tool result');
    }
    const headers = new Headers(options.headers);
    if (cookie) headers.set('cookie', cookie);
    const res = await nativeFetch(new URL(String(input), base), { ...options, headers });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  });
  sessionStorage.clear();
  history.replaceState({}, '', '/copilot');
});
afterEach(cleanup);
afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise((r) => server.close(r));
  db.close();
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}
it('plans a booking, waits for a real Confirm click, follows up with context, and reloads the conversation', async () => {
  const user = userEvent.setup();
  mount();
  await user.type(await screen.findByLabelText('Email address'), 'admin@clinic.local');
  await user.type(screen.getByLabelText('Password'), 'ClinicDemo!2026');
  await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  await screen.findByRole('heading', { name: 'Your clinic copilot' });
  await waitFor(() =>
    expect((screen.getByLabelText('Ask the copilot') as HTMLTextAreaElement).disabled).toBe(false),
  );
  const before = db.prepare('SELECT COUNT(*) n FROM appointments').get().n;
  await user.type(
    screen.getByLabelText('Ask the copilot'),
    'Book Abdul Karim with Dr Ayesha tomorrow',
  );
  await user.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByRole('heading', { name: 'Review appointment' });
  expect(db.prepare('SELECT COUNT(*) n FROM appointments').get().n).toBe(before);
  await user.click(screen.getByRole('button', { name: 'Confirm booking', exact: true }));
  await screen.findByText(/Appointment booked. Token/);
  expect(db.prepare('SELECT COUNT(*) n FROM appointments').get().n).toBe(before + 1);
  expect(screen.queryByRole('button', { name: 'Confirm booking', exact: true })).toBeNull();
  await waitFor(() =>
    expect((screen.getByLabelText('Ask the copilot') as HTMLTextAreaElement).disabled).toBe(false),
  );
  await user.type(screen.getByLabelText('Ask the copilot'), 'Show selected patient balance');
  await user.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('The selected patient’s verified visits and balances are shown below.');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(modelCalls).toBe(5);
  cleanup();
  mount();
  await screen.findByText('The selected patient’s verified visits and balances are shown below.');
  expect(screen.getByText(/Appointment booked. Token/)).toBeTruthy();
}, 20000);
