let csrf = '';
export const setCsrf = (value: string) => {
  csrf = value;
};
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf, ...options.headers },
  });
  const body = await response
    .json()
    .catch(() => ({ message: 'Server returned an unreadable response.' }));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(response.status, body.message || 'Request failed.');
  }
  return body as T;
}
export const json = (body: unknown) => JSON.stringify(body);
export const money = (paisa: number) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(paisa / 100);
export const clinicToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const displayDate = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(`${value}T00:00:00+06:00`));
export function toPaisa(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error('Enter a positive amount with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > 100000000) throw new Error('Amount is too large.');
  return amount;
}
