import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Plus,
  CalendarDays,
  Users,
  Wallet,
  Clock3,
  Sparkles,
  Check,
} from 'lucide-react';
import { api, money, displayDate } from '../../lib/api';
import type { Dashboard } from '../../lib/types';
import { PageHeading, ErrorNotice, Loading, Empty, Status } from '../../components/ui';
import { useAuth } from '../auth/AuthContext';
export default function DashboardPage() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });
  const data = query.data;
  return (
    <>
      <PageHeading
        eyebrow="YOUR DAILY PULSE"
        title="A good day to care."
        description="A clear view of your clinic, so you can focus on people."
        action={
          <Link className="button primary" to="/appointments?new=1">
            <Plus size={17} /> Book appointment
          </Link>
        }
      />
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="welcome-banner">
              <div>
                <span className="live-label">
                  <i /> WORKSPACE OVERVIEW
                </span>
                <h2>
                  Everything in its place.
                  <br />
                  Every patient accounted for.
                </h2>
                <p>Here’s how your clinic is moving today, {displayDate(data.date)}.</p>
                <Link to="/patients">
                  Open patient directory <ArrowRight size={16} />
                </Link>
              </div>
              <div className="banner-art" aria-hidden="true">
                <div className="art-orbit" />
                <div className="art-card">
                  <span className="art-check">
                    <Check size={25} />
                  </span>
                  <strong>Ready for the day</strong>
                  <span>{data.appointmentCount} appointments scheduled</span>
                  <div className="art-lines">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div className="art-dot one" />
                <div className="art-dot two" />
              </div>
            </div>
            <div className="stats-grid">
              {[
                {
                  label: 'Appointments today',
                  value: String(data.appointmentCount),
                  note: 'Across all active doctors',
                  icon: CalendarDays,
                  tone: 'green',
                },
                {
                  label: 'Registered patients',
                  value: String(data.patientCount),
                  note: 'Your growing patient directory',
                  icon: Users,
                  tone: 'blue',
                },
                ...(data.report
                  ? [
                      {
                        label: 'Net collection today',
                        value: money(data.report.net),
                        note: 'Payments less reversals today',
                        icon: Wallet,
                        tone: 'sand',
                      },
                      {
                        label: 'Outstanding for today',
                        value: money(data.report.due),
                        note: 'Balance on today’s active visits',
                        icon: Clock3,
                        tone: 'rose',
                      },
                    ]
                  : [
                      {
                        label: 'Active doctors',
                        value: String(data.doctorCount),
                        note: 'Available in the directory',
                        icon: Users,
                        tone: 'sand',
                      },
                    ]),
              ].map((s) => (
                <div className="stat-card" key={s.label}>
                  <div className="stat-top">
                    <span>{s.label}</span>
                    <span className={`stat-icon ${s.tone}`}>
                      <s.icon size={19} />
                    </span>
                  </div>
                  <strong>{s.value}</strong>
                  <small>{s.note}</small>
                </div>
              ))}
            </div>
            <div className="dashboard-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Today’s appointments</h2>
                    <p>The next steps in your patient journey.</p>
                  </div>
                  <Link className="text-link" to="/appointments">
                    View all <ArrowRight size={15} />
                  </Link>
                </div>
                {data.appointments.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Patient</th>
                          <th>Doctor</th>
                          <th>Token</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.appointments.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <div className="person-cell">
                                <span className="avatar small">
                                  {a.full_name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .slice(0, 2)
                                    .join('')}
                                </span>
                                <div>
                                  <strong>{a.full_name}</strong>
                                  <small>{a.mrn}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span>{a.doctor_name}</span>
                              <small className="block muted">{a.specialty}</small>
                            </td>
                            <td>
                              <span className="token">#{String(a.token).padStart(2, '0')}</span>
                            </td>
                            <td>
                              <Status value={a.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="A quiet day ahead"
                    detail="Book an appointment to start the queue."
                  />
                )}
              </section>
              <div className="dashboard-side">
                <section className="panel quick-panel">
                  <h2>Make the next move</h2>
                  <p className="muted">Shortcuts for the front desk.</p>
                  <Link to="/patients?new=1">
                    <span className="stat-icon green">
                      <Users size={18} />
                    </span>
                    <span>
                      <strong>Register a patient</strong>
                      <small>Start with the essentials</small>
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                  <Link to="/billing">
                    <span className="stat-icon sand">
                      <Wallet size={18} />
                    </span>
                    <span>
                      <strong>Collect a payment</strong>
                      <small>Record it. Receipt it.</small>
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                </section>
                {user?.role === 'ADMIN' && (
                  <section className="copilot-card">
                    <Sparkles size={23} />
                    <span className="eyebrow">A LITTLE EXTRA CLARITY</span>
                    <h2>Meet your operations copilot.</h2>
                    <p>
                      Ask about collections or the queue. Get answers grounded in your clinic’s
                      records.
                    </p>
                    <Link to="/copilot">
                      Explore Copilot <ArrowRight size={16} />
                    </Link>
                  </section>
                )}
              </div>
            </div>
          </>
        )
      )}
    </>
  );
}
