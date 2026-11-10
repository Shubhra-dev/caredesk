# Deployment boundaries

## Local MVP versus production

The delivered package is a working local MVP, not a public SaaS deployment. It is single-clinic with file-based SQLite. No public deployment, domain purchase, paid AI call or contact with clinics was performed.

## Starting a fresh production instance

- Use Node.js 24 LTS. Keep package-lock.json and npm ci.
- Build with dev dependencies: npm ci; npm run check. The runtime still needs express/zod/etc; do not upload only dist.
- Set NODE_ENV=production, APP_ORIGIN=https://your-domain, a protected persistent DB_PATH and INITIAL_ADMIN_PASSWORD (12+ random characters) BEFORE first start.
- A fresh production DB creates only admin@clinic.local, no sample receptionist/doctors/patients. Create real staff/doctors after login. Demo credentials must never be used on a public instance.
- Do not promote a demo-seeded database into production: the startup initializer does not clean existing data/users.
- Keep backend bound to 127.0.0.1. Put an HTTPS reverse proxy in front, forwarding all paths to the Express port. Both assets and /api use one origin. No wildcard CORS is needed.
- Configure proxy/IP handling and login rate limiting for your actual proxy layout. Current in-process limiter sees backend peer IP; without configuration, a reverse proxy can make all users share a limit. Multiple processes/restarts need shared durable limits and session operations.
- Change clinic identity in sidebar/receipts. Current product branding is fixed UI text.
- Set secure file permissions; encrypted disk/backups; least-privilege OS account; log rotation and monitoring; off-machine backups and tested restore process.
- No secrets in VITE_* variables. OpenAI key belongs on server only.

## Important gaps before customer use

- Run the browser checklist (authoring Chromium was blocked). Add real browser E2E to CI.
- Review auth/account recovery, staff deactivation, permission scope, session policy, password reset and stronger abuse controls.
- No full business-ledger/accounting or payment gateway reconciliation. Manually verified payments only. Define reversal/refund workflow with the owner.
- No durable usage/cost budget for AI. Current basic cap is in-memory and per-process. Add usage accounting, provider budget limits, monitoring and a kill switch before live customer usage.
- Do not send patient/medical prompts externally without an approved data-handling arrangement. Even if tool outputs omit patient identifiers, the free-text user question is still transmitted. Consider a stricter structured-query-only design for production.
- AI prompt/tool protections are not a formal security audit. Evaluate prompt injection and output accuracy with a maintained test set.
- SQLite concurrent writes are serialized and suit this small pilot. Use a reviewed migration to MySQL/PostgreSQL for other deployment/concurrency needs. Migrations, decimal/integer money constraints, locking, idempotency and token allocation must be re-tested.
- Schema setup is version 1 with CREATE IF NOT EXISTS. Future schema changes require actual versioned migrations; do not silently edit old CREATE statements on an existing database.
- Audit is a useful application history, not tamper-proof external logging.
- No claims of legal, health-data, tax receipt, accessibility or regulatory certification are made. Review local requirements with appropriate specialists before commercial deployment.

## Restoring a backup

Stop the application before replacing an active database. Restore to a new path, verify using the checklist, then switch DB_PATH. Do not mix an old .sqlite file with unrelated -wal/-shm files. Backups created through npm run backup are standalone consistent snapshots. Retain original files until restoration is verified.
