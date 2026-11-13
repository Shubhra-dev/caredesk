# CareDesk repository rules

## Stack and commands

- Node.js 24 LTS; React/TypeScript/Vite frontend; JavaScript ES modules/Express backend; SQLite via node:sqlite.
- npm with committed package-lock.json; use npm ci for reproducible installs.
- npm run dev; npm run check; npm run format:check; npm run backup.
- Feature directories under src/features. Reusable UI in src/components; HTTP/currency helpers in src/lib.

## Working agreement

User explicitly chose: implement the working MVP first, then explain feature by feature. Provide Bengali explanations, technical identifiers in English, notes after each lesson, and short feature-level understanding checks. Do not ask for a design choice at every small step. Do not mark a learning topic PASSED solely because generated code works.

Inspect before editing; preserve minimal relevant diffs. Trace screen → request → route → validation → service → transaction → response → cache. Explain changes and why they work.

## Invariants

- Never trust frontend permissions, fees, MRNs or user IDs. Backend owns them.
- Money is integer paisa; never introduce float-based arithmetic.
- Booking plus invoice are atomic; token/capacity checks stay in a write transaction.
- Patient request keys and payment request keys must preserve retry idempotency.
- Shared phone numbers are valid. Never make phone unique or auto-merge patients.
- Do not delete payment/audit history. Reversals are administrator-only.
- Never add unrestricted SQL, financial writes or medical recommendations to Copilot. Registration and booking tools may ONLY stage owner-bound expiring previews; only a separate human Confirm endpoint may commit them. Validate every tool call and recheck permissions/capacity/fees at confirmation.
- Never commit .env, API keys, runtime databases, backups or real patient data.
- Add meaningful regression coverage for changed auth/financial/state-transition behavior; run npm run check.
- Do not claim browser or live-provider tests ran unless they actually did.
