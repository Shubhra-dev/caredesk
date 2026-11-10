import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ArrowUp, ShieldCheck, Database, CheckCircle2 } from 'lucide-react';
import { api, json, clinicToday } from '../../lib/api';
import { PageHeading, ErrorNotice } from '../../components/ui';
type Answer = {
  mode: 'LOCAL_DEMO' | 'LIVE_AI';
  provider?: string;
  model?: string;
  answer: string;
  toolCalls: { name: string; arguments: unknown; result: unknown }[];
};
type AIStatus = { provider: string; model: string; configured: boolean; mode: string };
export default function CopilotPage() {
  const config = useQuery({
    queryKey: ['copilot-status'],
    queryFn: () => api<AIStatus>('/copilot/status'),
    staleTime: 0,
  });
  const [question, setQuestion] = useState(''),
    [asked, setAsked] = useState(''),
    [answer, setAnswer] = useState<Answer | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  async function ask(text: string) {
    if (busy || text.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setAsked(text);
    try {
      setAnswer(await api<Answer>('/copilot', { method: 'POST', body: json({ question: text }) }));
      setQuestion('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="GROUNDED IN YOUR WORKSPACE"
        title="A little clarity, on demand."
        description="An operations copilot with a small, deliberate set of tools."
      />
      <div className="copilot-layout">
        <section className="panel copilot-main">
          <ErrorNotice error={config.error} />
          {config.data && (
            <div className="notice" role="status">
              {config.data.configured
                ? `Live provider configured: ${config.data.provider} · ${config.data.model}. Key presence does not verify account quota; the next answer confirms a successful call.`
                : 'Local demo only: no live AI key is configured. Add GEMINI_API_KEY to the server .env and restart to use a real model.'}
            </div>
          )}
          <div className="copilot-intro">
            <span className="copilot-symbol">
              <Sparkles size={28} />
            </span>
            <h2>What would you like to understand?</h2>
            <p>
              Explore daily collections and appointment queues with verified data from your clinic.
            </p>
            <div className="suggestions">
              {[
                `Show collection report for ${clinicToday()}`,
                `Show appointment queue for ${clinicToday()}`,
                'What can this copilot help with?',
              ].map((s) => (
                <button key={s} disabled={busy} onClick={() => void ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          {asked && <div className="question-bubble">{asked}</div>}
          {busy && (
            <div className="answer-card" role="status">
              Checking the clinic tools…
            </div>
          )}
          <ErrorNotice error={error} />
          {answer && (
            <div className="answer-card">
              <div className="answer-label">
                <Sparkles size={16} />
                <strong>
                  {answer.mode === 'LIVE_AI'
                    ? `Live AI · ${answer.provider || 'provider'} · ${answer.model || ''}`
                    : 'Local demo · rule-based, not an LLM'}
                </strong>
              </div>
              <p className="answer-text">{answer.answer}</p>
              {answer.toolCalls.map((t, i) => (
                <details key={i}>
                  <summary>
                    <CheckCircle2 size={14} /> Verified tool: {t.name}
                  </summary>
                  <pre>{JSON.stringify({ arguments: t.arguments, result: t.result }, null, 2)}</pre>
                </details>
              ))}
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
              maxLength={800}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about collections or the queue…"
              rows={2}
            />
            <button
              className="button primary"
              aria-label="Send question"
              disabled={busy || question.trim().length < 3}
            >
              <ArrowUp size={20} />
            </button>
          </form>
          <small className="muted">
            Free-tier learning: use fictional records only. Questions are sent to the selected
            provider; do not include patient or medical information.
          </small>
        </section>
        <aside>
          <section className="panel scope-panel">
            <ShieldCheck size={25} />
            <h3>Helpful, with boundaries.</h3>
            <p>
              Read-only. Administrator access. No diagnosis, prescriptions, record changes or direct
              SQL.
            </p>
            <Database size={22} />
            <h3>Two verified tools</h3>
            <ul>
              <li>Daily collection report</li>
              <li>Appointment queue summary</li>
            </ul>
            <p>
              Queue tools omit patient identifiers. Amounts come from the backend, not model
              arithmetic.
            </p>
            <h3>Live AI is optional</h3>
            <p>
              Use a Google AI Studio free-tier key. Set AI_PROVIDER=gemini, GEMINI_API_KEY and
              GEMINI_MODEL in the server .env, then restart. Free quota is limited; no paid fallback
              is used.
            </p>
            <p>Live answers can be wrong. Check the tool output before making a decision.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
