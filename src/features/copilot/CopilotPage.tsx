import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowUp, Plus, Search, MessageSquare, CheckCircle2 } from 'lucide-react';
import { api, json, clinicToday } from '../../lib/api';
import { PageHeading, ErrorNotice, Field } from '../../components/ui';
import { useAuth } from '../auth/AuthContext';
import CopilotEvidence from './CopilotEvidence';
import ActionPreview from './ActionPreview';
import type { AIStatus, Conversation } from './types';
export default function CopilotPage() {
  const { user } = useAuth(),
    cache = useQueryClient();
  const config = useQuery({
    queryKey: ['copilot-status'],
    queryFn: () => api<AIStatus>('/copilot/status'),
    staleTime: 0,
  });
  const recent = useQuery({
    queryKey: ['copilot-chats'],
    queryFn: () => api<{ id: string; title: string }[]>('/copilot/conversations'),
  });
  const [conversation, setConversation] = useState<Conversation | null>(null),
    [question, setQuestion] = useState(''),
    [pendingQuestion, setPendingQuestion] = useState(''),
    [lookup, setLookup] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(() =>
      Boolean(sessionStorage.getItem(`caredesk-copilot:${user?.id}`)),
    ),
    [error, setError] = useState<unknown>();
  const end = useRef<HTMLDivElement>(null);
  const storageKey = `caredesk-copilot:${user?.id}`;
  useEffect(() => {
    let active = true;
    const id = sessionStorage.getItem(storageKey);
    if (id)
      api<Conversation>(`/copilot/conversations/${id}`)
        .then((c) => {
          if (active) setConversation(c);
        })
        .catch(() => {
          sessionStorage.removeItem(storageKey);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    else setLoading(false);
    return () => {
      active = false;
    };
  }, [storageKey]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [conversation?.events.length, busy]);
  function remember(c: Conversation) {
    setConversation(c);
    sessionStorage.setItem(storageKey, c.id);
    void cache.invalidateQueries({ queryKey: ['copilot-chats'] });
  }
  async function ensureConversation(title: string) {
    if (conversation) return conversation;
    const c = await api<Conversation>('/copilot/conversations', {
      method: 'POST',
      body: json({ title: title.slice(0, 70) }),
    });
    remember(c);
    return c;
  }
  async function recover(err: unknown) {
    setError(err);
    if (conversation) {
      try {
        remember(await api<Conversation>(`/copilot/conversations/${conversation.id}`));
      } catch {
        /* Keep the draft and the original failure visible. */
      }
    }
  }
  async function ask(text: string) {
    if (busy || loading || text.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setPendingQuestion(text);
    try {
      const c = await ensureConversation(text);
      const result = await api<{ conversation: Conversation }>('/copilot', {
        method: 'POST',
        body: json({ question: text, conversationId: c.id, expectedRevision: c.revision }),
      });
      remember(result.conversation);
      setQuestion('');
    } catch (err) {
      await recover(err);
    } finally {
      setBusy(false);
      setPendingQuestion('');
    }
  }
  async function search(kind: 'patient' | 'doctor') {
    if (busy || lookup.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const c = await ensureConversation(`Find ${kind}: ${lookup}`);
      remember(
        await api<Conversation>(`/copilot/conversations/${c.id}/lookup`, {
          method: 'POST',
          body: json({ kind, query: lookup, expectedRevision: c.revision }),
        }),
      );
    } catch (err) {
      await recover(err);
    } finally {
      setBusy(false);
    }
  }
  async function select(kind: 'patient' | 'doctor', entityId: string) {
    if (!conversation || busy) return;
    setBusy(true);
    setError(null);
    try {
      remember(
        await api<Conversation>(`/copilot/conversations/${conversation.id}/selection`, {
          method: 'POST',
          body: json({ kind, entityId, expectedRevision: conversation.revision }),
        }),
      );
    } catch (err) {
      await recover(err);
    } finally {
      setBusy(false);
    }
  }
  async function action(id: string, confirm: boolean, shared = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ conversation: Conversation }>(
        `/copilot/actions/${id}/${confirm ? 'confirm' : 'cancel'}`,
        { method: 'POST', body: json(confirm ? { acknowledgeSharedContact: shared } : {}) },
      );
      remember(result.conversation);
      await cache.invalidateQueries();
    } catch (err) {
      await recover(err);
    } finally {
      setBusy(false);
    }
  }
  async function load(id: string) {
    if (busy) return;
    setLoading(true);
    setError(null);
    try {
      remember(await api<Conversation>(`/copilot/conversations/${id}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }
  const disabled = busy || loading;
  return (
    <>
      <PageHeading
        eyebrow="FROM QUESTIONS TO COMPLETED WORK"
        title="Your clinic copilot"
        description="Find the right record, plan the next step, and confirm the work."
        action={
          <button
            className="button subtle"
            disabled={disabled}
            onClick={() => {
              setConversation(null);
              sessionStorage.removeItem(storageKey);
              setQuestion('');
              setError(null);
            }}
          >
            <Plus size={16} />
            New conversation
          </button>
        }
      />
      <div className="copilot-workspace">
        <aside className="copilot-sidebar panel">
          <div className="copilot-sidebar-heading">
            <MessageSquare size={19} />
            <strong>Conversations</strong>
          </div>
          {recent.data?.map((c) => (
            <button
              key={c.id}
              className={c.id === conversation?.id ? 'active' : ''}
              disabled={disabled}
              onClick={() => void load(c.id)}
            >
              {c.title}
            </button>
          ))}
          {!recent.data?.length && (
            <p className="muted">Your recent conversations will appear here.</p>
          )}
          <div className="copilot-capabilities">
            <h3>What I can help with</h3>
            <ul>
              <li>Find patients and visit history</li>
              <li>Check doctor fees and capacity</li>
              <li>Prepare patient registration</li>
              <li>Prepare appointment bookings</li>
              <li>Compare collection reports</li>
            </ul>
            <small>
              Registration and booking need your explicit confirmation. Payments and medical advice
              stay outside this copilot.
            </small>
          </div>
        </aside>
        <section className="panel copilot-chat">
          <div className="copilot-chat-heading">
            <span className="copilot-symbol">
              <Sparkles size={21} />
            </span>
            <div>
              <strong>CareDesk Copilot</strong>
              <small>
                {config.data?.configured
                  ? `Live AI configured · ${config.data.provider} · ${config.data.model}`
                  : 'Local tools / demo · configure a model for natural-language planning'}
              </small>
            </div>
          </div>
          <ErrorNotice error={config.error || recent.error} />
          <div className="copilot-privacy">
            Use fictional patient records for free-tier AI learning. Questions, recent conversation
            and requested tool results may be sent to the provider. No diagnosis or automatic money
            movement.
          </div>
          <div className="copilot-directory">
            <Field label="Quick record lookup (runs locally on your backend)">
              <input
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                disabled={disabled}
                placeholder="Patient name, phone, MRN or doctor name"
              />
            </Field>
            <div>
              <button
                className="button subtle small-button"
                disabled={disabled || lookup.trim().length < 2}
                onClick={() => void search('patient')}
              >
                <Search size={14} />
                Find patient
              </button>
              <button
                className="button subtle small-button"
                disabled={disabled || lookup.trim().length < 2}
                onClick={() => void search('doctor')}
              >
                Find doctor
              </button>
            </div>
          </div>
          <div className="copilot-messages" aria-live="polite">
            {loading ? (
              <p className="muted">Loading conversation…</p>
            ) : (
              !conversation?.events.length && (
                <div className="copilot-intro">
                  <h2>Let’s move the front desk forward.</h2>
                  <p>
                    Tell me the task. I’ll look up the details, ask for missing information, and
                    show a preview before saving.
                  </p>
                  <div className="suggestions">
                    {[
                      `Show collection report for ${clinicToday()}`,
                      'Find patient Abdul Karim and show his appointments',
                      'Find Dr. Ayesha Rahman and check tomorrow’s capacity',
                    ].map((s) => (
                      <button disabled={disabled} key={s} onClick={() => void ask(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
            {conversation?.events.map((event) => (
              <div
                key={event.id}
                className={
                  event.role === 'user'
                    ? 'question-bubble'
                    : event.role === 'system'
                      ? 'copilot-system-event'
                      : 'answer-card'
                }
              >
                {event.role === 'assistant' && (
                  <div className="answer-label">
                    <Sparkles size={16} />
                    <strong>
                      {event.mode === 'LIVE_AI'
                        ? `Live AI · ${event.provider}`
                        : event.mode === 'LOCAL_TOOLS'
                          ? 'Verified directory lookup'
                          : 'Local demo · rule-based, not an LLM'}
                    </strong>
                  </div>
                )}
                {event.role === 'system' && <CheckCircle2 size={16} />}
                <p className="answer-text">{event.content}</p>
                {event.result?.link && (
                  <Link className="button subtle small-button" to={event.result.link}>
                    Open saved record
                  </Link>
                )}
                {event.toolCalls && conversation && (
                  <CopilotEvidence
                    tools={event.toolCalls}
                    conversation={conversation}
                    busy={disabled}
                    onSelect={(kind, id) => void select(kind, id)}
                  />
                )}
                <div className="action-preview-list">
                  {event.actions?.map((a) => (
                    <ActionPreview
                      key={a.id}
                      action={a}
                      busy={disabled}
                      onConfirm={(id, shared) => void action(id, true, shared)}
                      onCancel={(id) => void action(id, false)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {pendingQuestion && <div className="question-bubble">{pendingQuestion}</div>}
            {busy && (
              <div className="copilot-working" role="status">
                Working through your request…
              </div>
            )}
            <div ref={end} />
          </div>
          <ErrorNotice error={error} />
          {conversation?.selectedPatientId && (
            <div className="copilot-selection-bar">
              <span>
                Patient selected{conversation.selectedDoctorId ? ' · Doctor selected' : ''}
              </span>
              <button
                className="text-link"
                disabled={disabled}
                onClick={() =>
                  void ask(
                    'Continue my previous request using the patient and doctor selected in this conversation. Ask only for any missing details.',
                  )
                }
              >
                Continue previous request
              </button>
            </div>
          )}
          <form
            className="copilot-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <label className="sr-only" htmlFor="copilot-question">
              Ask the copilot
            </label>
            <textarea
              id="copilot-question"
              required
              minLength={3}
              maxLength={1200}
              value={question}
              disabled={disabled}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Find a patient, check a balance, or prepare an appointment…"
              rows={2}
            />
            <button
              className="button primary"
              aria-label="Send question"
              disabled={disabled || question.trim().length < 3}
            >
              <ArrowUp size={20} />
            </button>
          </form>
          <small className="muted copilot-bottom-note">
            Review the selected patient, doctor, date and fee before Confirm. New questions
            supersede earlier pending previews.
          </small>
        </section>
      </div>
    </>
  );
}
