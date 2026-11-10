# CareDesk — Clinic Operations MVP (0.1.1)

একটি ছোট outpatient clinic-এর জন্য working, single-clinic learning MVP। React + TypeScript frontend, Express backend, persistent SQLite database এবং bounded operations copilot আছে। এটি production-certified medical software নয়; real patient data ব্যবহারের আগে pilot ও deployment review দরকার।

Existing installation? Read **docs/UPDATE_0_1_1.md** first; preserve your .env and data directory.

## Windows-এ চালানো

**Node.js 24 LTS** install করো। Node 20/22 দিয়ে এই version চালাবে না: backend built-in `node:sqlite` ব্যবহার করে।

ZIP extract করে project directory-তে PowerShell খোলো:

```powershell
node --version
npm ci
Copy-Item .env.example .env
npm run dev
```

Browser: **http://127.0.0.1:5173**। Terminal খোলা রাখবে; `Ctrl+C` দিয়ে stop করবে। একই command frontend এবং API চালায়। Port 5173 বা 4100 ব্যস্ত হলে আগে সেই app বন্ধ করো। Dependency installation-এর জন্য internet দরকার, পরে local demo external service ছাড়াই চলে।

### Local demo accounts

| Role          | Email                    | Password          |
| ------------- | ------------------------ | ----------------- |
| Administrator | `admin@clinic.local`     | `ClinicDemo!2026` |
| Receptionist  | `reception@clinic.local` | `ClinicDemo!2026` |

প্রথম non-production startup-এ fictional patients, doctors এবং আজকের appointments তৈরি হয়। Database `data/clinic.sqlite`-এ persist করে। পরের দিনে পুরোনো appointments তাদের আসল date-এই থাকবে। Sample data reset করতে server বন্ধ করে `data` directory সরিয়ে restart করতে হয়—এতে সব local records হারাবে। Backup ছাড়া real records-এ এটি করবে না।

## কী কাজ করে

- HTTP-only session cookie; CSRF token; Admin/Receptionist permissions enforced in backend.
- Patient registration/edit/search/pagination; server-generated MRN; DOB অথবা date-stamped estimated age; বাংলা phone digits normalization.
- Shared phone allowed; potential duplicate lookup and manual acknowledgement. No automatic merge or identity inference.
- One queue per doctor per day. Daily capacity, unique tokens, duplicate active-visit protection, allowed status transitions.
- Appointment এবং fee-snapshot invoice একই transaction-এ তৈরি হয়.
- Partial/full payments, retry-safe payment keys, overpayment rejection, administrator reversal and audit trail.
- Printable invoice/payment history; daily collections, reversals, visit dues.
- Doctor fees/capacity/availability; staff creation; password change and session invalidation.
- Read-only Admin Copilot: verified collection report and identifier-free queue summary.
- SQLite online backup command; setup, file walkthrough, testing and deployment notes.

## Commands

```powershell
npm run check
npm run test:ui
npm run format:check
npm run build
npm start
npm run backup
```

`npm run check`: frontend typecheck/build + backend tests + frontend component tests. `npm start`: serves the built frontend and API at **http://127.0.0.1:4100**. In local mode, no Vite process is needed after build. Backups go to `backups/` and must be stored securely elsewhere too.

## AI: honest modes

**No configured key:** `LOCAL_DEMO` is a small rule-based router, not an LLM or autonomous agent. It calls the same verified backend tools. Try “Show collection report for YYYY-MM-DD” or “Show appointment queue for YYYY-MM-DD”.

**Live AI (free-tier learning):** use a Google AI Studio free-tier project/key. Set `AI_PROVIDER=gemini`, `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-3.5-flash-lite` in `.env`, then restart. Verify your own project quota/model availability; keep billing disabled for zero-spend practice. No paid-provider fallback is attempted. See `docs/UPDATE_0_1_1.md`. Existing OpenAI support remains optional via `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL` (not a free API promise). Keys stay server-side.

Live flow: question → model selects allowed tool → server validates arguments → server reads authorized data → tool result → model answer. Maximum four model turns, at most three tool calls per turn, request timeouts, and a basic per-process daily request cap. The cap resets on restart; this is not a durable billing budget.

No diagnosis, prescription, writes, raw SQL or arbitrary tool execution. Queue tools omit patient names/phones/MRNs; aggregate reports contain no patient identifiers. **Your question is sent to the external provider in live mode: do not enter patient or medical information.** Production requires a provider/data-handling review. Live prose can be inaccurate; inspect the displayed tool output. Staff-created names such as doctor names remain in queue summaries.

OpenAI and Gemini adapter orchestration are tested with simulated providers. No real credentialed provider generation call has been verified here. `npm run ai:check` checks model visibility for your Gemini key without generation.

## Scope decisions / limitations

- SQLite is intentional for a zero-setup local, single-clinic MVP. The earlier MySQL/Prisma plan is deferred; this package uses parameterized SQL services and no ORM. A MySQL move requires explicit schema/migration/transaction tests, not a connection-string change.
- One doctor/day is one session; no time slots, roster/calendar exceptions or multiple shifts.
- Follow-up eligibility is verified by staff; follow-up fees are configured per doctor.
- Unpaid booking/check-in is permitted. No configurable mandatory prepayment policy yet.
- Payment methods are manually recorded; there is no payment gateway, MFS verification, SMS or actual money transfer. A reversal records an accounting event; staff must arrange the real refund separately.
- No discounts/taxes, advance balances, invoices outside appointments, export, file uploads, patient portal, clinical notes, pharmacy, admission, clinical AI or full accounting ledger.
- No patient hard-delete/merge; no staff deactivation/reset workflow or two-factor authentication yet.
- Demo clinic name is currently a UI constant; customize it in Layout and receipt before a customer pilot.
- Browser-wide visual/E2E review could not run in the authoring environment (Chromium socket restriction). Follow `docs/ACCEPTANCE.md` on your PC before a pilot.

## Learning route

Read `docs/WALKTHROUGH.md`. Trace PatientForm → api helper → patient route → schema → transaction/database → query invalidation → rerender. Then appointments, payments, auth, and finally Copilot. Every feature has a concrete explanation and practice task. AI assistance did not establish your understanding automatically.

## Before selling

Follow `docs/DEPLOYMENT.md`, run the acceptance checklist with a real receptionist, validate receipts/reversal reconciliation with the clinic owner, verify backup restoration, and get data-handling agreements reviewed. This is a demonstrable foundation for a pilot, not a claim of regulatory compliance or guaranteed sales.
