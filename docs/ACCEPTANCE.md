# Browser and pilot acceptance checklist

These checks are manual and NOT claimed as completed in the authoring environment. Use fictional data first. Run npm run check before starting.

## Local browser

- Login as administrator; dashboard loads from API with today's clinic date.
- Register a DOB patient. MRN is generated. Reload: record persists.
- Register a newborn with estimated age 0 and record date; no blank-to-zero mistake.
- Enter invalid calendar date/phone and a future DOB; verify errors and no saved row.
- Search a name, phone, MRN; reload/share URL; confirm page/search remain.
- Shared phone: warning shows relevant existing records; Use existing opens profile; explicitly confirmed different person can register.
- Edit patient; query list/history refreshes without a full reload.
- Book a new consultation. Token and invoice appear. Book same patient/doctor/date again: denied.
- Change doctor fee after booking: old invoice keeps old total.
- Fill doctor capacity then book again: denied.
- Queue transitions: BOOKED → CHECKED_IN → IN_CONSULTATION → COMPLETED.
- Unpaid cancellation works; paid cancellation is denied until reversal.
- Pay 300 then 500 on an 800 BDT invoice. Balance becomes 500 then 0.
- Retry payment with the SAME request key: one payment only. Reuse key with different amount: conflict.
- Enter more than balance: denied. Card/MFS without reference: denied.
- Print receipt on A4: navigation hidden, amounts and payment history readable.
- Reverse payment as Admin: reason required, net collection and invoice balance adjust, history retained.
- Daily report: payment date and reversal date match expected reconciliation.
- Login as Receptionist: patient/booking/payment permitted; reports/copilot/staff changes/reversal denied via direct APIs too.
- Change password and verify old sessions fail.
- Test wrong login repeatedly; limiter responds 429.
- Reload a deep route, e.g. /patients, with built npm start server.
- At 390px width, open/close mobile menu, forms, dropdowns, table horizontal scrolling and dialogs.
- Keyboard: tab through form, dialog focus contained, Escape closes, focus returns to opener.
- No browser console errors; no patient details in URL search terms/screenshots shared outside clinic.

## Copilot

- No key/model: visibly LOCAL DEMO, not misrepresented as AI.
- Collection/queue query: displayed tool output matches report page.
- Fictional patient lookup: ambiguous names show selection cards; choose a person and continue.
- Booking preview creates no appointment; Cancel creates none. Confirm creates exactly one appointment/invoice and displays its link.
- Refresh restores conversation. Follow-up “এই রোগীর বকেয়া কত?” uses selected patient.
- New question supersedes old preview; expired/changed-fee/full-capacity confirmations fail clearly.
- New-patient preview validates required fields; shared phone requires explicit acknowledgement.
- Unsupported actions return limitations.
- Live mode: valid account model, real key, provider timeout/auth/rate-limit tested.
- Never use real patient text in prompts during testing.
- Requests for deletion/diagnosis/payment execution do not trigger writes.
- Review output-grounding, date understanding, wrong-date questions, bilingual questions and injection attempts.

## Backup restore drill

1. Run npm run backup while the clinic is idle (SQLite backup API supports a consistent snapshot).
2. Stop app. Keep original database safe; do not overwrite it during the test.
3. Point DB_PATH in .env to a COPY of the backup; start app.
4. Confirm patient count, appointment/payment samples and staff login.
5. Stop app, restore original DB_PATH, restart. Store backups encrypted/off-machine with access controls.

## Customer pilot gate

A receptionist and owner complete real workflow review using synthetic records; receipts/reconciliation accepted; staff roles/passwords arranged; HTTPS and restore drill verified; privacy/provider review finished; unresolved issues documented. Only then consider authorized real-data pilot use.
