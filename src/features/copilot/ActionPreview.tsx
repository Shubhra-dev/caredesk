import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, UserPlus, CheckCircle2 } from 'lucide-react';
import { money } from '../../lib/api';
import type { Draft } from './types';
export default function ActionPreview({
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  action: Draft;
  busy: boolean;
  onConfirm: (id: string, shared: boolean) => void;
  onCancel: (id: string) => void;
}) {
  const [shared, setShared] = useState(false);
  const p = action.preview,
    booking = action.kind === 'BOOK_APPOINTMENT';
  const expired = Date.now() >= action.expiresAt;
  const pending = action.status === 'PENDING' && !expired;
  const matches = p.matches || [];
  return (
    <section
      className="action-preview"
      aria-label={booking ? 'Appointment preview' : 'Patient registration preview'}
    >
      <div className="action-preview-title">
        {booking ? <CalendarCheck size={21} /> : <UserPlus size={21} />}
        <div>
          <h3>{booking ? 'Review appointment' : 'Review patient registration'}</h3>
          <small>
            {action.status === 'CONFIRMED'
              ? 'Completed by your confirmation'
              : pending
                ? 'Preview only · nothing has been saved'
                : expired
                  ? 'Preview expired'
                  : action.status.toLowerCase()}
          </small>
        </div>
      </div>
      <dl>
        {booking ? (
          <>
            <div>
              <dt>Patient</dt>
              <dd>
                {p.patientName} · {p.mrn}
              </dd>
            </div>
            <div>
              <dt>Doctor</dt>
              <dd>{p.doctorName}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{p.date}</dd>
            </div>
            <div>
              <dt>Visit</dt>
              <dd>{p.visitType === 'NEW' ? 'New consultation' : 'Follow-up · staff verified'}</dd>
            </div>
            <div>
              <dt>Fee</dt>
              <dd>{money(p.fee || 0)}</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Name</dt>
              <dd>{p.fullName}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{p.phone}</dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>
                {p.dateOfBirth ||
                  `${p.estimatedAgeMonths} months (estimated), recorded ${p.ageRecordedOn}`}
              </dd>
            </div>
            {p.address && (
              <div>
                <dt>Address</dt>
                <dd>{p.address}</dd>
              </div>
            )}
          </>
        )}
      </dl>
      {!booking && matches.length > 0 && (
        <div className="duplicate-box">
          <strong>Shared contact / possible duplicate</strong>
          {matches.map((m) => (
            <p key={m.id}>
              {m.name} · {m.mrn}
            </p>
          ))}
          {pending && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
              I reviewed these records. This is a different patient with a shared contact.
            </label>
          )}
        </div>
      )}
      {pending && (
        <div className="action-preview-footer">
          <button
            className="button primary"
            disabled={busy || (!booking && matches.length > 0 && !shared)}
            onClick={() => onConfirm(action.id, shared)}
          >
            {busy ? 'Working…' : booking ? 'Confirm booking' : 'Confirm registration'}
          </button>
          <button className="button subtle" disabled={busy} onClick={() => onCancel(action.id)}>
            Cancel
          </button>
          <small>
            Expires after 15 minutes. Sending a new question replaces earlier pending previews.
          </small>
        </div>
      )}
      {action.status === 'CONFIRMED' && action.result?.link && (
        <Link className="button subtle" to={action.result.link}>
          <CheckCircle2 size={16} />
          Open saved record
        </Link>
      )}
    </section>
  );
}
