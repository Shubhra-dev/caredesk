import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Printer, CalendarDays, ArrowLeft } from 'lucide-react';
import { api, clinicToday, json, money, toPaisa } from '../../lib/api';
import type { Invoice, Payment, Report } from '../../lib/types';
import { useAuth } from '../auth/AuthContext';
import {
  PageHeading,
  ErrorNotice,
  Loading,
  Empty,
  Status,
  Field,
  Modal,
} from '../../components/ui';
function DailyReport({ date }: { date: string }) {
  const q = useQuery({
    queryKey: ['report', date],
    queryFn: () => api<Report>(`/reports/daily?date=${date}`),
  });
  return (
    <>
      <ErrorNotice error={q.error} />
      {q.data && (
        <>
          <div className="stats-grid">
            {[
              ['Gross collections', q.data.gross],
              ['Reversals recorded', q.data.reversed],
              ['Net collection', q.data.net],
              ['Visit balance', q.data.due],
            ].map(([label, value]) => (
              <div className="stat-card" key={String(label)}>
                <span>{label}</span>
                <strong>{money(Number(value))}</strong>
              </div>
            ))}
          </div>
          <section className="panel report-panel">
            <h2>Collection methods</h2>
            {q.data.byMethod.length ? (
              q.data.byMethod.map((m) => (
                <div className="report-line" key={m.method}>
                  <span>
                    {m.method} · {m.count} payments
                  </span>
                  <strong>{money(m.amount)}</strong>
                </div>
              ))
            ) : (
              <Empty title="No collections" detail="Recorded payments will appear here." />
            )}
            <p className="footnote">
              Collections use payment date; reversals use reversal date. Visit balance uses
              appointment date and excludes cancelled/no-show visits. They measure different things.
            </p>
          </section>
        </>
      )}
    </>
  );
}
export default function BillingPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || clinicToday();
  const [tab, setTab] = useState('invoices');
  const q = useQuery({
    queryKey: ['invoices', date],
    queryFn: () => api<Invoice[]>(`/invoices?date=${date}`),
  });
  return (
    <>
      <PageHeading
        eyebrow="A CLEARER PICTURE"
        title="Billing & collections"
        description="Every payment recorded. Every balance easy to find."
      />
      <div className="billing-filters">
        <div className="tabs">
          <button className={tab === 'invoices' ? 'active' : ''} onClick={() => setTab('invoices')}>
            Invoices
          </button>
          {user?.role === 'ADMIN' && (
            <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>
              Daily report
            </button>
          )}
        </div>
        <label className="inline-filter">
          <CalendarDays size={17} />
          <input
            aria-label="Billing date"
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setParams({ date: e.target.value });
            }}
          />
        </label>
      </div>
      {tab === 'report' ? (
        <DailyReport date={date} />
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Invoices by visit date</h2>
              <p>Open an invoice to record payment or print a receipt.</p>
            </div>
          </div>
          <ErrorNotice error={q.error} />
          {q.isPending ? (
            <Loading />
          ) : q.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Patient</th>
                    <th>Doctor</th>
                    <th>Total</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((i) => (
                    <tr key={i.id}>
                      <td className="mono">{i.number}</td>
                      <td>
                        <strong>{i.full_name}</strong>
                        <small className="block muted">{i.mrn}</small>
                      </td>
                      <td>{i.doctor_name}</td>
                      <td>{money(i.total)}</td>
                      <td>{money(i.total - i.paid)}</td>
                      <td>
                        <Status
                          value={i.paid >= i.total ? 'PAID' : i.paid > 0 ? 'PARTIAL' : 'UNPAID'}
                        />
                      </td>
                      <td>
                        <Link className="text-link" to={`/receipts/${i.id}`}>
                          Open <ArrowUpRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No invoices for this date"
              detail="Booking an appointment automatically creates its invoice."
            />
          )}
        </section>
      )}
    </>
  );
}
function PaymentForm({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void }) {
  const cache = useQueryClient();
  const key = useRef(crypto.randomUUID());
  const [amount, setAmount] = useState(((invoice.total - invoice.paid) / 100).toFixed(2)),
    [method, setMethod] = useState('CASH'),
    [reference, setReference] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(`/invoices/${invoice.id}/payments`, {
            method: 'POST',
            body: json({ amount: toPaisa(amount), method, reference, requestKey: key.current }),
          });
          await cache.invalidateQueries();
          onSaved();
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="notice">
        Remaining balance: <strong>{money(invoice.total - invoice.paid)}</strong>
      </div>
      <Field label="Amount received (BDT) *">
        <input
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            key.current = crypto.randomUUID();
          }}
        />
      </Field>
      <Field label="Payment method">
        <select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            key.current = crypto.randomUUID();
          }}
        >
          <option value="CASH">Cash</option>
          <option value="MFS">Mobile financial service</option>
          <option value="CARD">Card</option>
        </select>
      </Field>
      {method !== 'CASH' && (
        <Field label="Transaction reference *">
          <input
            required
            maxLength={100}
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              key.current = crypto.randomUUID();
            }}
          />
        </Field>
      )}
      <p className="footnote">
        Record only money you have confirmed receiving. This does not charge a card or verify an MFS
        transaction.
      </p>
      <ErrorNotice error={error} />
      <button className="button primary full" disabled={busy}>
        {busy ? 'Recording…' : 'Confirm payment received'}
      </button>
    </form>
  );
}
export function ReceiptPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const cache = useQueryClient();
  const [pay, setPay] = useState(false),
    [reverse, setReverse] = useState<Payment | null>(null),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const q = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api<{ invoice: Invoice; payments: Payment[] }>(`/invoices/${id}`),
  });
  const invoice = q.data?.invoice;
  return (
    <>
      <div className="no-print receipt-actions">
        <Link className="text-link" to="/billing">
          <ArrowLeft size={16} /> Back to billing
        </Link>
        <div>
          <button className="button subtle" onClick={() => window.print()}>
            <Printer size={16} /> Print invoice / receipt
          </button>
          {invoice &&
            invoice.total > invoice.paid &&
            !['CANCELLED', 'NO_SHOW'].includes(invoice.appointment_status) && (
              <button className="button primary" onClick={() => setPay(true)}>
                Collect payment
              </button>
            )}
        </div>
      </div>
      <ErrorNotice error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        invoice && (
          <article className="receipt panel">
            <header className="receipt-heading">
              <div>
                <span className="eyebrow">CAREDESK · NAZIPUR CLINIC</span>
                <h1>
                  {invoice.paid >= invoice.total
                    ? 'Paid invoice / receipt'
                    : 'Consultation invoice'}
                </h1>
                <p className="mono">{invoice.number}</p>
              </div>
              <Status
                value={
                  invoice.paid >= invoice.total ? 'PAID' : invoice.paid > 0 ? 'PARTIAL' : 'UNPAID'
                }
              />
            </header>
            <div className="receipt-meta">
              <div>
                <small>PATIENT</small>
                <strong>{invoice.full_name}</strong>
                <span>
                  {invoice.mrn} · {invoice.phone}
                </span>
              </div>
              <div>
                <small>CONSULTATION</small>
                <strong>{invoice.doctor_name}</strong>
                <span>
                  {invoice.visit_date} · Token #{invoice.token}
                </span>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="align-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Consultation fee</td>
                  <td className="align-right">{money(invoice.total)}</td>
                </tr>
                <tr>
                  <td>Confirmed payments (less reversals)</td>
                  <td className="align-right">{money(invoice.paid)}</td>
                </tr>
                <tr className="receipt-total">
                  <td>Balance due</td>
                  <td className="align-right">{money(invoice.total - invoice.paid)}</td>
                </tr>
              </tbody>
            </table>
            <h2>Payment history</h2>
            {q.data?.payments.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Receipt / date</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Recorded by</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className="mono">PAY-{String(p.seq).padStart(6, '0')}</span>
                          <small className="block muted">{p.created_at} UTC</small>
                        </td>
                        <td>
                          {p.method}
                          <small className="block muted">{p.reference}</small>
                        </td>
                        <td>{money(p.amount)}</td>
                        <td>{p.recorded_by}</td>
                        <td>
                          {p.reversed_at ? (
                            <>
                              <Status value="REVERSED" />
                              <small className="block muted">{p.reversal_reason}</small>
                            </>
                          ) : (
                            <>
                              <Status value="PAID" />
                              {user?.role === 'ADMIN' && (
                                <button
                                  className="text-link danger no-print"
                                  onClick={() => {
                                    setReverse(p);
                                    setReason('');
                                    setError(null);
                                  }}
                                >
                                  Record reversal
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No payments recorded. This invoice is not proof of payment.</p>
            )}
            <footer className="receipt-note">
              Thank you. Please retain this document for your records. Payment references are
              manually recorded by clinic staff.
            </footer>
          </article>
        )
      )}
      {pay && invoice && (
        <Modal title="Collect payment" onClose={() => setPay(false)}>
          <PaymentForm invoice={invoice} onSaved={() => setPay(false)} />
        </Modal>
      )}
      {reverse && (
        <Modal title="Record payment reversal" onClose={() => setReverse(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await api(`/payments/${reverse.id}/reverse`, {
                  method: 'POST',
                  body: json({ reason }),
                });
                await cache.invalidateQueries();
                setReverse(null);
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              This records a reversal of {money(reverse.amount)}. Arrange the actual refund
              separately; no money is transferred by this application.
            </p>
            <Field label="Reason *">
              <textarea
                required
                minLength={5}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <ErrorNotice error={error} />
            <button className="button danger-button" disabled={busy}>
              {busy ? 'Recording…' : 'Confirm reversal record'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
