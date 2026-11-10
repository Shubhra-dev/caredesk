import { useState } from 'react';
import { Activity, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from './AuthContext';
import { ErrorNotice, Field } from '../../components/ui';
export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Activity />
          </span>
          CareDesk<span className="brand-tag">CLINIC WORKSPACE</span>
        </div>
        <div>
          <p className="eyebrow light">A little less admin. A lot more care.</p>
          <h1>
            Your clinic,
            <br />
            in good hands.
          </h1>
          <p>One calm workspace for patients, appointments, payments and your daily decisions.</p>
          <div className="login-features">
            <span>
              <ShieldCheck size={19} /> Role-based access
            </span>
            <span>
              <Sparkles size={19} /> Operations copilot
            </span>
          </div>
        </div>
        <small>Built for the people behind better care.</small>
      </section>
      <section className="login-panel">
        <div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Keep the front desk moving, one patient at a time.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await login(email, password);
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Email address">
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@clinic.com"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorNotice error={error} />
            <button className="button primary full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="demo-note">
            <strong>Running the local demo?</strong>
            <p>
              Use the demo credentials in README.md. Sample records are fictional. Production
              initialization creates no sample patients.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
