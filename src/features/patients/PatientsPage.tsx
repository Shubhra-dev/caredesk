import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, ArrowUpRight } from 'lucide-react';
import { api, money, clinicToday } from '../../lib/api';
import type { Patient, Appointment } from '../../lib/types';
import {
  PageHeading,
  Modal,
  ErrorNotice,
  Loading,
  Empty,
  Status,
  useDebounced,
} from '../../components/ui';
import PatientForm from './PatientForm';
function ageLabel(p: Patient) {
  if (!p.dob)
    return `${Math.floor((p.estimated_months || 0) / 12)}y ${(p.estimated_months || 0) % 12}m estimated`;
  const now = clinicToday();
  let years = Number(now.slice(0, 4)) - Number(p.dob.slice(0, 4));
  if (now.slice(5) < p.dob.slice(5)) years--;
  return `${years} years`;
}
function PatientDetail({ patient, onEdit }: { patient: Patient; onEdit: () => void }) {
  const q = useQuery({
    queryKey: ['patient', patient.id],
    queryFn: () =>
      api<{ patient: Patient; appointments: Appointment[] }>(`/patients/${patient.id}`),
  });
  return (
    <>
      <div className="profile-summary">
        <span className="avatar large">{patient.full_name[0]}</span>
        <div>
          <h3>{patient.full_name}</h3>
          <span className="mono">{patient.mrn}</span>
          <p>
            {patient.phone} · {ageLabel(patient)}
          </p>
          <p>{patient.address || 'No address recorded'}</p>
        </div>
        <button className="button subtle" onClick={onEdit}>
          <Pencil size={15} />
          Edit
        </button>
      </div>
      <ErrorNotice error={q.error} />
      <h3>Visit history</h3>
      {q.isPending ? (
        <Loading />
      ) : q.data?.appointments.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Doctor</th>
                <th>Status</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {q.data.appointments.map((a) => (
                <tr key={a.id}>
                  <td>{a.visit_date}</td>
                  <td>{a.doctor_name}</td>
                  <td>
                    <Status value={a.status} />
                  </td>
                  <td>
                    <Link to={`/receipts/${a.invoice_id}`}>{money(a.total - a.paid)}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No visits yet" detail="Book their first appointment from the queue." />
      )}
      <Link className="button primary" to={`/appointments?new=1&patient=${patient.id}`}>
        Book appointment <ArrowUpRight size={16} />
      </Link>
    </>
  );
}
export default function PatientsPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const debounced = useDebounced(search);
  const [selected, setSelected] = useState<Patient | null>(null),
    [editing, setEditing] = useState<Patient | null>(null);
  const creating = params.get('new') === '1';
  const query = useQuery({
    queryKey: ['patients', debounced, page],
    queryFn: () =>
      api<{ items: Patient[]; total: number; pageSize: number }>(
        `/patients?search=${encodeURIComponent(debounced)}&page=${page}`,
      ),
  });
  function closeForm() {
    setEditing(null);
    setParams((p) => {
      p.delete('new');
      return p;
    });
  }
  return (
    <>
      <PageHeading
        eyebrow="PEOPLE, NOT JUST RECORDS"
        title="Patient directory"
        description="Find familiar faces. Welcome new ones. Keep their details together."
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
            <Plus size={17} /> Register patient
          </button>
        }
      />
      <section className="panel">
        <div className="toolbar">
          <div className="search-input">
            <Search size={18} />
            <input
              aria-label="Search patients"
              placeholder="Search name, phone or patient number…"
              value={search}
              onChange={(e) =>
                setParams(
                  (p) => {
                    p.set('search', e.target.value);
                    p.set('page', '1');
                    return p;
                  },
                  { replace: true },
                )
              }
            />
          </div>
          <span className="muted">{query.data?.total || 0} patients</span>
        </div>
        <ErrorNotice error={query.error} />
        {query.isPending ? (
          <Loading />
        ) : query.data?.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Patient number</th>
                    <th>Contact</th>
                    <th>Age</th>
                    <th>Registered</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <button className="person-cell row-button" onClick={() => setSelected(p)}>
                          <span className="avatar small">
                            {p.full_name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')}
                          </span>
                          <span>
                            <strong>{p.full_name}</strong>
                            <small>{p.address || 'Address not recorded'}</small>
                          </span>
                        </button>
                      </td>
                      <td className="mono">{p.mrn}</td>
                      <td>{p.phone}</td>
                      <td>{ageLabel(p)}</td>
                      <td>{p.created_at.slice(0, 10)}</td>
                      <td>
                        <button className="text-link" onClick={() => setSelected(p)}>
                          View <ArrowUpRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Page {page} of {Math.max(1, Math.ceil(query.data.total / 10))}
              </span>
              <div>
                <button
                  className="button subtle small-button"
                  disabled={page === 1}
                  onClick={() =>
                    setParams((p) => {
                      p.set('page', String(page - 1));
                      return p;
                    })
                  }
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <button
                  className="button subtle small-button"
                  disabled={page * 10 >= query.data.total}
                  onClick={() =>
                    setParams((p) => {
                      p.set('page', String(page + 1));
                      return p;
                    })
                  }
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            title="No patients found"
            detail="Try a different search or register a new patient."
          />
        )}
      </section>
      {(creating || editing) && (
        <Modal title={editing ? 'Edit patient' : 'Register a patient'} onClose={closeForm}>
          <PatientForm
            patient={editing || undefined}
            onSaved={closeForm}
            onExisting={(p) => {
              closeForm();
              setSelected(p);
            }}
          />
        </Modal>
      )}
      {selected && !editing && (
        <Modal title="Patient profile" onClose={() => setSelected(null)}>
          <PatientDetail
            patient={selected}
            onEdit={() => {
              setEditing(selected);
              setSelected(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
