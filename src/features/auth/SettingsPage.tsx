import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import { api, json, money, toPaisa } from '../../lib/api';
import type { Doctor, User } from '../../lib/types';
import { PageHeading, ErrorNotice, Field, Modal, Status, Empty } from '../../components/ui';
import { useAuth } from './AuthContext';
function DoctorForm({ doctor, onSaved }: { doctor?: Doctor; onSaved: () => void }) {
  const cache = useQueryClient();
  const [name, setName] = useState(doctor?.name || ''),
    [specialty, setSpecialty] = useState(doctor?.specialty || ''),
    [fee, setFee] = useState(String((doctor?.fee || 0) / 100)),
    [follow, setFollow] = useState(String((doctor?.followup_fee || 0) / 100)),
    [capacity, setCapacity] = useState(doctor?.capacity || 20),
    [active, setActive] = useState(doctor ? !!doctor.active : true),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(doctor ? `/doctors/${doctor.id}` : '/doctors', {
            method: doctor ? 'PUT' : 'POST',
            body: json({
              name,
              specialty,
              fee: toPaisa(fee),
              followupFee: toPaisa(follow),
              capacity,
              active,
            }),
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
      <Field label="Doctor name *">
        <input
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Specialty *">
        <input
          required
          minLength={2}
          maxLength={100}
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="New visit fee (BDT)">
          <input
            required
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </Field>
        <Field label="Follow-up fee (BDT)">
          <input
            required
            inputMode="decimal"
            value={follow}
            onChange={(e) => setFollow(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Daily booking capacity">
        <input
          type="number"
          required
          min="1"
          max="500"
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
      </Field>
      <label className="check-row">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Available for new bookings
      </label>
      <ErrorNotice error={error} />
      <button className="button primary full" disabled={busy}>
        {busy ? 'Saving…' : 'Save doctor'}
      </button>
    </form>
  );
}
export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const admin = user?.role === 'ADMIN';
  const cache = useQueryClient();
  const [tab, setTab] = useState('doctors'),
    [doctor, setDoctor] = useState<Doctor | null>(null),
    [newDoctor, setNewDoctor] = useState(false),
    [staff, setStaff] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const doctors = useQuery({
    queryKey: ['doctors'],
    queryFn: () => api<Doctor[]>('/doctors'),
    enabled: admin,
  });
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<User[]>('/users'),
    enabled: admin,
  });
  const audits = useQuery({
    queryKey: ['audit'],
    queryFn: () =>
      api<{ seq: number; actor: string; action: string; detail: string; created_at: string }[]>(
        '/audit',
      ),
    enabled: admin && tab === 'audit',
  });
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE, WELL KEPT"
        title={admin ? 'Clinic settings' : 'Account settings'}
        description="Manage the details behind a dependable front desk."
      />
      <div className="tabs settings-tabs">
        {(admin ? ['doctors', 'staff', 'audit', 'password'] : ['password']).map((t) => (
          <button
            key={t}
            className={(admin ? tab : 'password') === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t === 'password'
              ? 'Change password'
              : t === 'audit'
                ? 'Audit trail'
                : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <ErrorNotice error={error || doctors.error || users.error || audits.error} />
      {admin && tab === 'doctors' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Doctor directory</h2>
              <p>Fee changes apply to future bookings only.</p>
            </div>
            <button className="button primary" onClick={() => setNewDoctor(true)}>
              <Plus size={16} /> Add doctor
            </button>
          </div>
          {doctors.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>New / follow-up</th>
                    <th>Capacity / day</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {doctors.data.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.name}</strong>
                        <small className="block muted">{d.specialty}</small>
                      </td>
                      <td>
                        {money(d.fee)} / {money(d.followup_fee)}
                      </td>
                      <td>{d.capacity}</td>
                      <td>
                        <Status value={d.active ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td>
                        <button className="text-link" onClick={() => setDoctor(d)}>
                          <Pencil size={15} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No doctors yet" detail="Add the first doctor to enable booking." />
          )}
        </section>
      )}
      {admin && tab === 'staff' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Staff access</h2>
              <p>Permissions are enforced on the server.</p>
            </div>
            <button className="button primary" onClick={() => setStaff(true)}>
              <Plus size={16} /> Add staff
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <Status value={u.role} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {admin && tab === 'audit' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent activity</h2>
              <p>Latest 100 recorded actions. Timestamps below are UTC.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time (UTC)</th>
                  <th>Staff</th>
                  <th>Action</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {audits.data?.map((a) => (
                  <tr key={a.seq}>
                    <td>{a.created_at}</td>
                    <td>{a.actor}</td>
                    <td className="mono">{a.action}</td>
                    <td>{a.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {(!admin || tab === 'password') && (
        <section className="panel narrow-panel">
          <h2>Change your password</h2>
          <p className="muted">Changing your password signs out all of your sessions.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const form = new FormData(e.currentTarget);
              try {
                await api('/auth/password', {
                  method: 'POST',
                  body: json({
                    currentPassword: form.get('current'),
                    newPassword: form.get('next'),
                  }),
                });
                await refresh();
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Current password">
              <input required type="password" name="current" autoComplete="current-password" />
            </Field>
            <Field label="New password (12+ characters)">
              <input
                required
                minLength={12}
                maxLength={200}
                type="password"
                name="next"
                autoComplete="new-password"
              />
            </Field>
            <button className="button primary" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>
      )}
      {(newDoctor || doctor) && (
        <Modal
          title={doctor ? 'Edit doctor' : 'Add doctor'}
          onClose={() => {
            setNewDoctor(false);
            setDoctor(null);
          }}
        >
          <DoctorForm
            doctor={doctor || undefined}
            onSaved={() => {
              setNewDoctor(false);
              setDoctor(null);
            }}
          />
        </Modal>
      )}
      {staff && (
        <Modal title="Add staff member" onClose={() => setStaff(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const form = new FormData(e.currentTarget);
              try {
                await api('/users', {
                  method: 'POST',
                  body: json({
                    name: form.get('name'),
                    email: form.get('email'),
                    password: form.get('password'),
                    role: form.get('role'),
                  }),
                });
                await cache.invalidateQueries({ queryKey: ['users'] });
                setStaff(false);
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Full name">
              <input required minLength={2} maxLength={120} name="name" />
            </Field>
            <Field label="Email">
              <input required type="email" name="email" />
            </Field>
            <Field label="Initial password (12+ characters)">
              <input
                required
                type="password"
                minLength={12}
                maxLength={200}
                name="password"
                autoComplete="new-password"
              />
            </Field>
            <Field label="Role">
              <select name="role">
                <option value="RECEPTIONIST">Receptionist</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </Field>
            <ErrorNotice error={error} />
            <button className="button primary full" disabled={busy}>
              {busy ? 'Creating…' : 'Create staff account'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
