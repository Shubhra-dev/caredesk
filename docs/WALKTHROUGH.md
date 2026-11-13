# File-by-file learning guide

## 1. Startup: how does the app run?

| File            | Responsibility                                                  |
| --------------- | --------------------------------------------------------------- |
| package.json    | Commands, fixed direct dependency versions and Node requirement |
| scripts/dev.mjs | Starts API and Vite; stops both on exit                         |
| vite.config.ts  | React transformation and same-origin /api proxy                 |
| src/main.tsx    | React root, router, query cache and auth provider               |
| src/App.tsx     | Session-aware page routing and role-aware routes                |
| server/index.js | Opens persistent database and starts HTTP server                |
| server/app.js   | Middleware and HTTP routes                                      |

**নোট করো:** browser /api-তে request পাঠায়। Development-এ Vite সেটি Express-এ proxy করে। Built app-এ Express একই origin থেকে frontend serve করে। ফলে cross-origin cookies/CORS-এর অপ্রয়োজনীয় complexity নেই।

Practice: browser Network tab-এ `/api/auth/me` খুঁজে দেখো; frontend reload হলেও session কেন থাকে ব্যাখ্যা করো।

## 2. Patient registration: the first complete flow

1. `src/features/patients/PatientForm.tsx`: controlled string inputs, DOB/estimated branches, local draft, duplicate query and submission key.
2. `src/lib/types.ts`: typed request and response shapes; types disappear at runtime.
3. `src/lib/api.ts`: JSON request, same-origin credentials, CSRF header and HTTP error handling.
4. `server/routes/patients.js`: POST /api/patients parses untrusted body and idempotency header.
5. `server/validation.js`: Zod validation, calendar dates, phone normalization, mutually exclusive age inputs.
6. `server/db.js`: transaction, UUID/MRN creation, constraints and audit.
7. Back to PatientForm: successful response invalidates TanStack Query cache; directory refetches.
8. `src/features/patients/PatientsPage.tsx`: search/page in URL, debounced query key, profile/history.

Backend is the source of truth. There is intentionally no second copy of the earlier handwritten patientValidation.ts: the completed MVP uses Zod on the server plus lightweight form conversion/native constraints. This avoids divergent business rules. The earlier examples remain learning exercises, not files to paste into this version.

**নোট করো:** TypeScript ≠ runtime validation. Blank age ≠ zero age. Shared phone ≠ same patient. Idempotent retry ≠ duplicate-person detection. Query keys include search/page so caches do not collide.

Practice: enter an invalid phone, inspect 400 response, follow the error to ErrorNotice. Then use +880 and check normalized phone in response. Change one rule in server/validation.js and update its test.

## 3. Booking and queue

Read AppointmentsPage → server/routes/appointments.js → appointmentSchema → createAppointment in server/services.js.

The write transaction checks doctor availability, capacity and existing active booking; allocates next token; creates appointment plus invoice; records audit. A doctor fee update cannot rewrite an existing invoice because total is a snapshot. Tokens are per doctor/day. Queue statuses are a state machine, not arbitrary text.

**নোট করো:** UI disabling alone cannot prevent duplicate booking. Constraints and a transaction protect consistency. SQLite serializes these writes; another database needs its own locking/constraint strategy.

Practice: reduce one doctor's capacity to 1, attempt two bookings, inspect 409. Try BOOKED → COMPLETED directly from an API client; explain why denied.

## 4. Payments and receipts

Read BillingPage/PaymentForm → toPaisa → paymentSchema → recordPayment → invoiceQuery/dailyReport.

Money uses integer paisa. A request UUID stops retry duplication. A matching key with changed details conflicts. Partial payments are allowed, overpayments are not. Reversal updates an existing payment with actor/reason/time and keeps history; it is not a gateway refund. Print styles hide navigation.

**নোট করো:** 300.50 BDT = 30050 paisa. Collection date and visit date describe different reports. A cancelled invoice is not proof of refund. Use real reconciliation before trusting a pilot's totals.

Practice: pay 300 of an 800 invoice; retry the same request; verify paid stays 300. Reverse and inspect both report and audit.

## 5. Authentication and authorization

Read AuthContext → auth endpoints → server/auth.js → sessionMiddleware/adminOnly.

Passwords use salted scrypt; raw session token exists in an HTTP-only cookie, its SHA-256 hash in SQLite. Session has an eight-hour expiry and CSRF value. Mutations require session+CSRF; foreign browser origins are rejected. Admin-only APIs remain denied even when called without the UI. Password change invalidates sessions.

**নোট করো:** authentication checks identity; authorization checks ability. Browser JavaScript does not read the session cookie. Cookie expiry/server expiry are both relevant. In production secure cookies require HTTPS.

Practice: login as receptionist and directly request /api/reports/daily. Explain 403 versus 401.

## 6. Operations Copilot

Read CopilotPage → server/routes/copilot.js → server/copilot.js → server/ai/provider.js → executeTool → existing report/query services. Provider selection supports Gemini free-tier learning and optional OpenAI.

Local mode is deterministic and clearly labelled. Live mode sends recent conversation, tool schemas and context to the model. The model proposes tools; backend code validates and executes them. Reports/lookup/history are reads; prepare tools save an expiring draft only. The separate authenticated Confirm route creates the patient or appointment/invoice inside a transaction. See `COPILOT_FLOW.md` for the module-by-module path.

**নোট করো:** model proposal, persisted draft এবং committed record তিনটি আলাদা state। Prompt authorization নয়। A confirmation retry must be idempotent. Shared conversation history is never accepted from arbitrary client JSON; the backend loads the owner's history. External provider receives question/history/tool results.

Practice: ask for a fictional booking. Before Confirm, check that appointment count is unchanged. Cancel and explain what changed in the database. Then request a new preview and confirm. Explain why the model cannot directly call Confirm.

## 7. Verification and handover

- server/tests/clinic.test.js: auth, validation, booking, financial and permission integration tests.
- server/tests/copilot.test.js: simulated provider/tool orchestration, forbidden tool rejection, bounded loop.
- src/**/\*.test.tsx and src/**/*.test.ts: form behavior and currency conversion.
- docs/ACCEPTANCE.md: actual browser checklist, which must still run on the user's PC.
- docs/DEPLOYMENT.md: operational limits and production preparation.

Write your own reflection after each feature: assumption → evidence → root cause → fix → why it works → one interview explanation. Understanding is assessed after you modify/debug it, not after reading the notes.

## 0.1.1 debugging note

Modal effect cleanup can queue a native close event. StrictMode then reopens the dialog; ignoring a close event while dialog.open is true prevents the stale event from dismissing the new form. Read src/components/Modal.test.tsx. The test used to fail and now passes. Do not remove StrictMode to hide a lifecycle bug.
