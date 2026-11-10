# Update 0.1.1 — forms + free-tier Gemini integration

## Form bug found

Shared Modal used native dialog.close() in an effect cleanup and unconditionally called the parent's onClose handler for every native close event. React StrictMode runs an extra setup/cleanup cycle in development. A queued close event from that cleanup can arrive after showModal() reopens the same element, dismissing the new form.

The regression test failed on the old implementation and passes on the fix. The handler now ignores a close event while the dialog is currently open, and Escape is handled deliberately. StrictMode is retained. All patient/booking/payment/doctor/staff dialogs use this shared component.

This reproduces a concrete shared-dialog defect. It does not prove that every symptom on a different local PC has the same cause. Native-browser visual/focus testing is still pending; if typing fails outside dialogs (for example login), collect browser Console errors and failed Network requests without credentials.

## Apply without losing records

1. Stop dev server with Ctrl+C.
2. Keep a backup of your project and database.
3. Extract the updated ZIP and overwrite the source/config/docs in the existing clinic-operations folder. **Do not delete data/ or your existing .env.** Neither is included in this ZIP.
4. Run npm ci.
5. Add the Gemini settings below to your existing .env. Do not replace the whole .env if it already has customized database settings.
6. Restart npm run dev. Hard-reload the browser with Ctrl+Shift+R and sign in if necessary.
7. Register a fictional patient, book an appointment and record a fictional payment. Check the form remains open while typing.

## Free-tier real AI setup

Create a key in Google AI Studio: https://aistudio.google.com/api-keys

Use a project with free-tier access and leave billing disabled for zero-spend learning. Eligibility, model access and quotas depend on your project and may change. Free quota is not unlimited. Merely selecting a model in this app does not enforce your Google project's billing tier.

Add to .env:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=YOUR_GOOGLE_AI_STUDIO_KEY
GEMINI_MODEL=gemini-3.5-flash-lite
```

The default model was listed with free-tier input/output on the official pricing page checked on 2026-11-08. If it is unavailable, choose a currently accessible free-tier function-calling model for your account and change GEMINI_MODEL. Do not use an older model blindly; model access can differ for new projects.

```powershell
npm run ai:check
npm run dev
```

ai:check only lists model visibility; it does NOT send a generation prompt and does not prove free-tier quota. The Copilot page displays the configured provider/model. A successful answer labelled Live AI confirms a real generation response. A missing key stays explicitly in Local Demo. Quota/key/model errors are shown without exposing secrets. No automatic paid-provider fallback exists.

Question example: “আজকের collection report দাও” or “Show appointment queue for YYYY-MM-DD”. The model can interpret natural language, but tools remain limited to read-only reports and queues. This update does not add patient creation, appointment creation or arbitrary write actions through AI.

## Privacy

Use fictional clinic records for unpaid API experimentation. Google unpaid-service terms allow submitted content/output to be used for product improvement; do not submit real patient, medical or other sensitive/confidential information. Questions are transmitted externally, even though queue tool outputs omit patient identifiers. Do not paste API keys into chat, GitHub or frontend VITE_* variables.

## Verification

- Build: passed.
- Backend: 20 tests passed, including simulated Gemini tool calling and explicit quota failure without fallback.
- Frontend: 9 tests passed, including stale-dialog close regression and the full flow under StrictMode in DOM emulation.
- No real Google credential was provided, so a live Gemini request could not be run here.
- Native browser execution remains unavailable in this environment; verify on your PC.

## References checked

- https://react.dev/reference/react/StrictMode
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/close_event
- https://ai.google.dev/gemini-api/docs/openai
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/terms
