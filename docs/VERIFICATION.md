# Verification record — 8 November 2026

## Completed in the authoring environment

- Node.js 24.22.1.
- TypeScript strict compile and Vite production build.
- 20 Node backend tests, including HTTP routes, real SQLite transactions, permissions, idempotency, financial reversals, normalized searches and mocked-provider orchestration.
- 9 Vitest frontend tests, including component interactions, currency conversion, and a full React UI → real HTTP API → SQLite workflow in DOM emulation.
- Prettier formatting check.
- npm audit: 0 known vulnerabilities in the resolved dependency set at check time. This is a point-in-time package advisory result, not a security certification.
- Online SQLite backup created, opened as a separate database and PRAGMA integrity_check returned ok.

## Not verified

- Native Chromium visual, focus, mobile-layout and print checks: process startup failed because this environment disallows the needed socket operation. DOM emulation does not replace browser E2E or visual QA.
- Live credentialed Gemini/OpenAI request: no real API key/model account was supplied. Tool orchestration was tested with a simulated provider; local demo uses real internal services.
- Native Windows execution: scripts avoid shell-specific task chaining for the dev runner, but actual Windows install/browser acceptance must run on the user's PC.
- Public HTTPS deployment, customer pilot, medical-data/legal compliance, external security audit or production load testing.

See ACCEPTANCE.md before claiming a customer-ready release. The checks establish a local MVP foundation and do not guarantee commercial readiness.

## 0.1.1 regression update

A queued native dialog close event under StrictMode was reproduced as a failing regression test before the fix. The corrected Modal ignores stale close events after reopening. Full workflow now runs under StrictMode in DOM emulation; native browser validation is still pending. Gemini adapter tool flow and no-fallback quota errors are simulated-provider tests, not a live API claim.
