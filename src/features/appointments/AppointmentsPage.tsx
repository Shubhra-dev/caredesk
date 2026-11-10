import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, CalendarDays, ArrowUpRight } from 'lucide-react';
import { api, clinicToday, json, money } from '../../lib/api';
import type { Appointment, AppointmentStatus, Doctor, Patient } from '../../lib/types';
import {
  PageHeading,
  Modal,
  ErrorNotice,
  Loading,
  Empty,
  Status,
  Field,
  useDebounced,
} from '../../components/ui';
const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  BOOKED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_CONSULTATION', 'CANCELLED'],
  IN_CONSULTATION: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
function BookingForm({
  defaultDate,
  patientId,
  onSaved,
}: {
  defaultDate: string;
  patientId: string;
  onSaved: () => void;
}) {
  const cache = useQueryClient();
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState(patientId),
    [doctor, setDoctor] = useState(''),
    [date, setDate] = useState(defaultDate),
    [visitType, setVisitType] = useState('NEW'),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const debounced = useDebounced(search);
  const patients = useQuery({
    queryKey: ['patients', 'booking', debounced],
    queryFn: () => api<{ items: Patient[] }>(`/patients?search=${encodeURIComponent(debounced)}`),
  });
  const initial = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api<{ patient: Patient }>(`/patients/${patientId}`),
    enabled: !!patientId,
  });
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: () => api<Doctor[]>('/doctors') });
  const chosen = doctors.data?.find((d) => d.id === doctor);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api('/appointments', {
            method: 'POST',
            body: json({ patientId: selected, doctorId: doctor, date, visitType }),
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
      <Field label="Find patient">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, phone or patient number"
        />
      </Field>
      <Field label="Patient *">
        <select required value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select a patient</option>
          {initial.data && !patients.data?.items.some((p) => p.id === patientId) && (
            <option value={patientId}>
              {initial.data.patient.full_name} · {initial.data.patient.mrn}
            </option>
          )}
          {patients.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name} · {p.mrn}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Doctor *">
        <select required value={doctor} onChange={(e) => setDoctor(e.target.value)}>
          <option value="">Select a doctor</option>
          {doctors.data
            ?.filter((d) => d.active)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.specialty}
              </option>
            ))}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Visit date *">
          <input
            type="date"
            required
            min={clinicToday()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Visit type">
          <select value={visitType} onChange={(e) => setVisitType(e.target.value)}>
            <option value="NEW">New consultation</option>
            <option value="FOLLOW_UP">Follow-up (staff verified)</option>
          </select>
        </Field>
      </div>
      {chosen && (
        <div className="notice">
          Consultation fee:{' '}
          <strong>{money(visitType === 'NEW' ? chosen.fee : chosen.followup_fee)}</strong> · Daily
          capacity: {chosen.capacity}. Final availability is checked when booking.
        </div>
      )}
      <ErrorNotice error={patients.error || doctors.error || initial.error || error} />
      <div className="form-footer">
        <small>One queue per doctor per day. Token and invoice are generated together.</small>
        <button className="button primary" disabled={busy}>
          {busy ? 'Booking…' : 'Confirm appointment'}
        </button>
      </div>
    </form>
  );
}
export default function AppointmentsPage() {
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || clinicToday();
  const [doctor, setDoctor] = useState(''),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState('');
  const query = useQuery({
    queryKey: ['appointments', date],
    queryFn: () => api<Appointment[]>(`/appointments?date=${date}`),
  });
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: () => api<Doctor[]>('/doctors') });
  const rows = query.data?.filter((a) => !doctor || a.doctor_id === doctor) || [];
  function close() {
    setParams((p) => {
      p.delete('new');
      p.delete('patient');
      return p;
    });
  }
  async function changeStatus(a: Appointment, status: string) {
    if (
      ['CANCELLED', 'NO_SHOW'].includes(status) &&
      !window.confirm(`Mark token #${a.token} as ${status.toLowerCase().replace('_', ' ')}?`)
    )
      return;
    setBusy(a.id);
    setError(null);
    try {
      await api(`/appointments/${a.id}/status`, { method: 'PATCH', body: json({ status }) });
      await cache.invalidateQueries();
    } catch (err) {
      setError(err);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="THE DAY, IN MOTION"
        title="Appointments & queue"
        description="From booking to consultation, keep every next step clear."
        action={
          <button
            className="button primary"
            onClick={() =>
              setParams((p) => {
                p.set('new', '1');
                return p;
              })
            }
          >
            <Plus size={17} /> Book appointment
          </button>
        }
      />
      <section className="panel">
        <div className="toolbar">
          <div className="filter-row">
            <label className="inline-filter">
              <CalendarDays size={17} />
              <input
                aria-label="Appointment date"
                type="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value)
                    setParams((p) => {
                      p.set('date', e.target.value);
                      return p;
                    });
                }}
              />
            </label>
            <select
              aria-label="Filter doctor"
              value={doctor}
              onChange={(e) => setDoctor(e.target.value)}
            >
              <option value="">All doctors</option>
              {doctors.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <span className="muted">{rows.length} appointments</span>
        </div>
        <ErrorNotice error={query.error || doctors.error || error} />
        {query.isPending ? (
          <Loading />
        ) : rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Patient</th>
                  <th>Doctor / visit</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="queue-token">{String(a.token).padStart(2, '0')}</span>
                    </td>
                    <td>
                      <strong>{a.full_name}</strong>
                      <small className="block muted mono">{a.mrn}</small>
                    </td>
                    <td>
                      {a.doctor_name}
                      <small className="block muted">
                        {a.visit_type === 'NEW' ? 'New consultation' : 'Follow-up'}
                      </small>
                    </td>
                    <td>
                      <Status value={a.status} />
                    </td>
                    <td>
                      <Status
                        value={a.paid >= a.total ? 'PAID' : a.paid > 0 ? 'PARTIAL' : 'UNPAID'}
                      />
                      <Link className="block text-link" to={`/receipts/${a.invoice_id}`}>
                        {money(a.total - a.paid)} due <ArrowUpRight size={12} />
                      </Link>
                    </td>
                    <td>
                      <select
                        aria-label={`Next step for ${a.full_name}`}
                        value=""
                        disabled={busy === a.id || !transitions[a.status].length}
                        onChange={(e) => {
                          if (e.target.value) void changeStatus(a, e.target.value);
                        }}
                      >
                        <option value="">
                          {transitions[a.status].length ? 'Update status' : 'No further steps'}
                        </option>
                        {transitions[a.status].map((s) => (
                          <option key={s} value={s}>
                            {s.toLowerCase().replaceAll('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No appointments for this day"
            detail="Book a visit to get the queue moving."
          />
        )}
      </section>
      <p className="footnote">
        Unpaid bookings are allowed. Follow-up eligibility is verified by staff. Cancellation with
        payments requires an administrator to record a reversal first.
      </p>
      {params.get('new') === '1' && (
        <Modal title="Book an appointment" onClose={close}>
          <BookingForm
            defaultDate={date < clinicToday() ? clinicToday() : date}
            patientId={params.get('patient') || ''}
            onSaved={close}
          />
        </Modal>
      )}
    </>
  );
}
