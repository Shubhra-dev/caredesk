import { Link } from 'react-router-dom';
import { CheckCircle2, UserRound, Stethoscope } from 'lucide-react';
import { money } from '../../lib/api';
import type { ToolCall, Candidate, Conversation } from './types';
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export default function CopilotEvidence({
  tools,
  conversation,
  busy,
  onSelect,
}: {
  tools: ToolCall[];
  conversation: Conversation;
  busy: boolean;
  onSelect: (kind: 'patient' | 'doctor', id: string) => void;
}) {
  return (
    <div className="copilot-evidence">
      {tools.map((t, index) => {
        const result = record(t.result) ? t.result : null;
        const candidates =
          result &&
          ['patients', 'doctors'].includes(String(result.kind)) &&
          Array.isArray(result.items)
            ? (result.items as Candidate[])
            : null;
        return (
          <div key={index}>
            {candidates && (
              <div className="candidate-grid">
                {candidates.map((item) => {
                  const kind = result!.kind === 'patients' ? 'patient' : 'doctor';
                  const selected =
                    (kind === 'patient'
                      ? conversation.selectedPatientId
                      : conversation.selectedDoctorId) === item.id;
                  return (
                    <article
                      className={`candidate-card ${selected ? 'selected' : ''}`}
                      key={item.id}
                    >
                      <div className="candidate-icon">
                        {kind === 'patient' ? <UserRound size={18} /> : <Stethoscope size={18} />}
                      </div>
                      <div>
                        <strong>{item.name}</strong>
                        {kind === 'patient' ? (
                          <>
                            <small>
                              {item.mrn} · Phone ends {item.phoneEnding}
                            </small>
                            <small>
                              {item.dateOfBirth ? `DOB ${item.dateOfBirth}` : 'DOB not recorded'}
                            </small>
                          </>
                        ) : (
                          <>
                            <small>{item.specialty}</small>
                            <small>
                              New {money(item.fee || 0)} · Follow-up {money(item.followup_fee || 0)}
                            </small>
                          </>
                        )}
                      </div>
                      <button
                        className="button subtle small-button"
                        disabled={busy || selected}
                        onClick={() => onSelect(kind, item.id)}
                      >
                        {selected ? 'Selected' : `Select ${kind}`}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
            {result?.kind === 'patient_history' && Array.isArray(result.items) && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Visit</th>
                      <th>Doctor</th>
                      <th>Balance</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(result.items as Record<string, unknown>[]).map((item, i) => (
                      <tr key={i}>
                        <td>
                          {String(item.date)}
                          <small className="block muted">{String(item.status)}</small>
                        </td>
                        <td>{String(item.doctor)}</td>
                        <td>{money(Number(item.due))}</td>
                        <td>
                          <Link className="text-link" to={String(item.link)}>
                            Open invoice
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details>
              <summary>
                <CheckCircle2 size={14} />
                {t.name.replaceAll('_', ' ')}
                {result?.error ? ' · needs attention' : ' · source details'}
              </summary>
              <pre>{JSON.stringify({ arguments: t.arguments, result: t.result }, null, 2)}</pre>
            </details>
          </div>
        );
      })}
    </div>
  );
}
