# প্রথমে এখান থেকে শুরু করো

## ১. প্রয়োজন

Node.js **24 LTS**। PowerShell-এ `node --version` দিয়ে দেখবে version v24 দিয়ে শুরু হচ্ছে কি না।

## ২. চালাও

ZIP extract করে `clinic-operations` folder-এর ভেতরে terminal খোলো:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

খোলো: http://127.0.0.1:5173

Local demo login:

- Email: `admin@clinic.local`
- Password: `ClinicDemo!2026`

Receptionist: `reception@clinic.local`, একই demo password।

## ৩. আগে product দেখো

Overview → Patients → Register patient → Appointments → Book appointment → Billing → Open invoice → Collect payment → Print.

Copilot-এ collection report/appointment queue জিজ্ঞেস করো। API key ছাড়া এটি স্পষ্টভাবে labelled local rule-based demo; live LLM নয়। Real AI চালানোর নির্দেশ README-তে আছে।

## ৪. তারপর file ধরে শিখব

`docs/WALKTHROUGH.md` খুলবে। প্রথম lesson: `src/main.tsx` → `src/App.tsx` → `src/features/auth/AuthContext.tsx` → login API। এরপর patient registration-এর পুরো request/response flow।

প্রতি feature-এর শেষে “নোট করো” ও ছোট practical modification আছে। শুধু পড়ে topic PASSED ধরা হবে না।

## ৫. যাচাই ও সীমা

```powershell
npm run check
```

এটি local MVP। Browser/pilot checklist: `docs/ACCEPTANCE.md`। কী test হয়েছে/হয়নি: `docs/VERIFICATION.md`। বিক্রির আগে production review: `docs/DEPLOYMENT.md`। Real patient data এখন ব্যবহার করবে না—আগে fictional records দিয়ে যাচাই করো।

## আগে project চালিয়ে থাকলে

`docs/UPDATE_0_2_0.md` অনুসরণ করো। আলাদা folder-এ নতুন ZIP extract করে updater চালাবে; এটি `.env` ও `data/` অক্ষত রেখে source/config update করে। Copilot-এর full flow এবং file map: `docs/COPILOT_FLOW.md`।
