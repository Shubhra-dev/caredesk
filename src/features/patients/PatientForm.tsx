import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, clinicToday, json } from '../../lib/api';
import type { Patient, PatientInput } from '../../lib/types';
import { ErrorNotice, Field, useDebounced } from '../../components/ui';
export default function PatientForm({
  patient,
  onSaved,
  onExisting,
}: {
  patient?: Patient;
  onSaved: () => void;
  onExisting: (p: Patient) => void;
}) {
  const cache = useQueryClient();
  const key = useRef(crypto.randomUUID());
  const [form, setForm] = useState({
    fullName: patient?.full_name || '',
    phone: patient?.phone || '',
    kind: patient?.estimated_months != null ? 'estimated' : 'dob',
    dob: patient?.dob || '',
    years:
      patient?.estimated_months != null ? String(Math.floor(patient.estimated_months / 12)) : '',
    months: patient?.estimated_months != null ? String(patient.estimated_months % 12) : '',
    recordedOn: patient?.age_recorded_on || clinicToday(),
    address: patient?.address || '',
    contactName: patient?.contact_name || '',
  });
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [acknowledged, setAcknowledged] = useState(false);
  const phone = useDebounced(form.phone.trim());
  const matches = useQuery({
    queryKey: ['patients', 'duplicate', phone],
    queryFn: () =>
      api<{ items: Patient[]; total: number }>(`/patients?search=${encodeURIComponent(phone)}`),
    enabled: phone.length >= 7,
  });
  const duplicates = matches.data?.items.filter((p) => p.id !== patient?.id) || [];
  function change(name: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
    setError(null);
    setAcknowledged(false);
    key.current = crypto.randomUUID();
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (duplicates.length && !acknowledged) {
      setError(new Error('Review matching patients and confirm this is a different person.'));
      return;
    }
    const years = Number(form.years || 0),
      months = Number(form.months || 0);
    if (
      form.kind === 'estimated' &&
      ((!form.years && !form.months) ||
        !Number.isInteger(years) ||
        years < 0 ||
        !Number.isInteger(months) ||
        months < 0 ||
        months > 11)
    ) {
      setError(new Error('Enter estimated years and additional months (0–11).'));
      return;
    }
    const body: PatientInput = {
      fullName: form.fullName,
      phone: form.phone,
      address: form.address,
      contactName: form.contactName,
      ...(form.kind === 'dob'
        ? { dateOfBirth: form.dob }
        : { estimatedAgeMonths: years * 12 + months, ageRecordedOn: form.recordedOn }),
    };
    setBusy(true);
    try {
      await api(patient ? `/patients/${patient.id}` : '/patients', {
        method: patient ? 'PUT' : 'POST',
        headers: { 'x-idempotency-key': key.current },
        body: json(body),
      });
      await cache.invalidateQueries();
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Full name *">
          <input
            required
            maxLength={120}
            autoFocus
            value={form.fullName}
            onChange={(e) => change('fullName', e.target.value)}
          />
        </Field>
        <Field label="Contact number *" hint="Shared family numbers are allowed.">
          <input
            type="tel"
            required
            value={form.phone}
            onChange={(e) => change('phone', e.target.value)}
            placeholder="01712345678"
          />
        </Field>
      </div>
      {duplicates.length > 0 && (
        <div className="duplicate-box">
          <strong>Existing patients with a similar contact</strong>
          <p>Check the records before creating a new patient.</p>
          {duplicates.map((p) => (
            <div className="duplicate-row" key={p.id}>
              <span>
                <strong>{p.full_name}</strong>
                <small>
                  {p.mrn} · {p.dob || `${p.estimated_months} months (estimated)`}
                </small>
              </span>
              <button
                type="button"
                className="button subtle small-button"
                onClick={() => onExisting(p)}
              >
                Use existing
              </button>
            </div>
          ))}
          <label className="check-row">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I checked: this is a different person / shared contact.
          </label>
        </div>
      )}
      {matches.isError && phone.length >= 7 && (
        <div className="notice">
          Duplicate lookup unavailable. Check the directory before registering.
        </div>
      )}
      <Field label="Age information">
        <select value={form.kind} onChange={(e) => change('kind', e.target.value)}>
          <option value="dob">Known date of birth</option>
          <option value="estimated">Estimated age</option>
        </select>
      </Field>
      {form.kind === 'dob' ? (
        <Field label="Date of birth *">
          <input
            type="date"
            min="1900-01-01"
            max={clinicToday()}
            required
            value={form.dob}
            onChange={(e) => change('dob', e.target.value)}
          />
        </Field>
      ) : (
        <div className="form-grid">
          <Field label="Years">
            <input
              type="number"
              min="0"
              max="130"
              step="1"
              value={form.years}
              onChange={(e) => change('years', e.target.value)}
            />
          </Field>
          <Field label="Additional months (0–11)">
            <input
              type="number"
              min="0"
              max="11"
              step="1"
              value={form.months}
              onChange={(e) => change('months', e.target.value)}
            />
          </Field>
          <Field label="Age recorded on *">
            <input
              type="date"
              required
              min="1900-01-01"
              max={clinicToday()}
              value={form.recordedOn}
              onChange={(e) => change('recordedOn', e.target.value)}
            />
          </Field>
        </div>
      )}
      <Field label="Contact person (optional)">
        <input
          maxLength={120}
          value={form.contactName}
          onChange={(e) => change('contactName', e.target.value)}
          placeholder="Parent, guardian or primary contact"
        />
      </Field>
      <Field label="Address (optional)">
        <textarea
          maxLength={500}
          rows={2}
          value={form.address}
          onChange={(e) => change('address', e.target.value)}
        />
      </Field>
      <ErrorNotice error={error} />
      <div className="form-footer">
        <small>Patient number is generated securely by the server.</small>
        <button className="button primary" disabled={busy}>
          {busy ? 'Saving…' : patient ? 'Save changes' : 'Register patient'}
        </button>
      </div>
    </form>
  );
}
