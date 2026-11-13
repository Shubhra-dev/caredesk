# Verification record — 10 November 2026

## 0.2.0 checks

- Node 24; TypeScript strict compile and Vite production build passed.
- 31 backend tests: auth/CSRF/roles, real SQLite transactions, payment/reversal correctness, provider orchestration, owner-bound drafts, revision locking, ambiguous selection, unobserved-ID rejection, fee/capacity rechecks, expiry/cancellation/supersession, idempotent and concurrent confirmation, production action gate and bounded reporting.
- 10 frontend tests: form regression and full React → real HTTP API → SQLite flows under DOM emulation. Copilot test covers lookup, preview without booking, Confirm, selected-patient follow-up, and conversation restore. Provider responses are simulated.
- Prettier formatting check passed.
- Update installer exercised against a temporary existing project: nested source copied; existing .env/database bytes preserved; previous source backed up.

## Not verified here

- Real credentialed Gemini/OpenAI generation; no user API key supplied. Model visibility/answer behavior/quota must be checked on the user's account.
- Native Chromium visual/focus/mobile/print checks: browser process startup is restricted in this environment. DOM emulation does not replace browser QA.
- Native Windows installation/updater execution. Cross-platform updater logic was tested on Linux; Windows acceptance remains required.
- Public deployment, production load, independent security/privacy review or customer pilot.

Earlier release checks included an online SQLite backup integrity test and dependency audit. They are historical checks, not new 0.2.0 security certification. Follow ACCEPTANCE.md and DEPLOYMENT.md before a customer pilot.
