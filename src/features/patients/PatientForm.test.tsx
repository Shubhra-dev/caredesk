import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PatientForm from './PatientForm';
import { api } from '../../lib/api';
vi.mock('../../lib/api', async (original) => ({
  ...(await original<typeof import('../../lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
afterEach(cleanup);
beforeEach(() => {
  mockedApi.mockImplementation(async () => ({ items: [], total: 0 }));
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSaved = vi.fn(),
    onExisting = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PatientForm onSaved={onSaved} onExisting={onExisting} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSaved, onExisting };
}
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name *'), 'Component Test');
  await user.type(screen.getByLabelText('Contact number *'), '01700000123');
  const input = screen.getByLabelText('Date of birth *');
  await user.type(input, '1994-03-15');
}
describe('patient registration component', () => {
  it('submits a typed DOB payload and invokes success callback', async () => {
    const { user, onSaved } = setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Register patient' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const call = mockedApi.mock.calls.find((c) => c[1]?.method === 'POST');
    expect(call?.[0]).toBe('/patients');
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.dateOfBirth).toBe('1994-03-15');
    expect(body.estimatedAgeMonths).toBeUndefined();
    expect(call?.[1]?.headers).toHaveProperty('x-idempotency-key');
  });
  it('preserves the draft and shows server failure instead of claiming success', async () => {
    mockedApi.mockImplementation(async (_path, options) => {
      if (options?.method === 'POST') throw new Error('Server unavailable');
      return { items: [], total: 0 };
    });
    const { user, onSaved } = setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Register patient' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('Server unavailable');
    expect((screen.getByLabelText('Full name *') as HTMLInputElement).value).toBe('Component Test');
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('does not silently turn a blank estimated age into zero', async () => {
    const { user, onSaved } = setup();
    await user.type(screen.getByLabelText('Full name *'), 'Newborn');
    await user.type(screen.getByLabelText('Contact number *'), '01700000123');
    await user.selectOptions(screen.getByLabelText('Age information'), 'estimated');
    await user.click(screen.getByRole('button', { name: 'Register patient' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter estimated years');
    expect(onSaved).not.toHaveBeenCalled();
    expect(mockedApi.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
  });
  it('offers existing shared-contact records without creating a new patient', async () => {
    const patient = {
      id: 'existing',
      mrn: 'PT-000001',
      full_name: 'Existing Mother',
      phone: '01700000123',
      dob: '1990-01-01',
    };
    mockedApi.mockResolvedValue({ items: [patient], total: 1 });
    const { user, onExisting } = setup();
    await user.type(screen.getByLabelText('Contact number *'), '01700000123');
    await screen.findByRole('button', { name: 'Use existing' });
    await user.click(screen.getByRole('button', { name: 'Use existing' }));
    expect(onExisting).toHaveBeenCalledWith(patient);
    expect(mockedApi.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
  });
});
