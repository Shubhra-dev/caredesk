# Update 0.2.0 — Task-oriented Copilot

পুরোনো app চললে Ctrl+C দিয়ে বন্ধ করো। নতুন ZIP **আলাদা folder**-এ Extract All করো। পুরোনো project-এর ওপর সরাসরি extract করবে না।

নতুন extracted `clinic-operations` folder-এ PowerShell খোলো। চালাও:

```powershell
node scripts/install-update.mjs "C:\Users\hp\OneDrive\Desktop\Career Switch Projects\clinic-operations"
```

Updater folder structure বজায় রেখে frontend/backend/config একসঙ্গে copy করে। Destination-এর আগের source/config `.update-backups/`-এ রাখে। `.env`, `data/`, `backups/`, `node_modules/` বদলায় না। Existing database-এ নতুন Copilot tables automatically যোগ হয়; database delete করবে না। Source/config backup-এ conversation database থাকে না; database backup আলাদা `npm run backup` দিয়ে নাও।

এবার **পুরোনো/current project folder**-এ ফিরে চালাও:

```powershell
npm ci
npm run check
npm run dev
```

Browser hard refresh: Ctrl+Shift+R। আগের Gemini key/model configuration থাকবে। `.env.example` দিয়ে existing `.env` overwrite করবে না। Node 24 লাগবে।

Admin login → Copilot। fictional seeded records দিয়ে চেষ্টা করো:

1. “Abdul Karim নামে patient খুঁজে দাও।” Multiple match হলে সঠিক card select করো।
2. “Dr. Ayesha Rahman-এর কাছে আগামীকাল NEW visit-এর booking preview করো।” Missing doctor/patient info চাইলে উত্তর দাও।
3. Preview-তে patient, date, doctor, visit type ও fee দেখো। **Confirm** চাপলে appointment এবং invoice তৈরি হবে।
4. “এই রোগীর বকেয়া ও আগের visit দেখাও।” Selected patient context ব্যবহার হবে।
5. New conversation-এ fictional নতুন patient-এর name, phone, sex এবং DOB/estimated age দিয়ে registration preview চাও; Confirm-এর পর booking চালিয়ে যেতে পারবে।

Live model ছাড়া Local Demo এখনও reports/queues পর্যন্ত সীমিত। Registration/booking Copilot Admin-only; reception-এর existing manual forms আগের মতো আছে। Copilot payment collect, clinical advice, delete বা merge করে না।

Cloud provider প্রশ্ন, recent history এবং tool results পায়। Development-এ fictional records ব্যবহার করো। Production-এ patient tools default off; documented approval gate ছাড়া চালু হবে না।

Implementation map ও lesson notes: `COPILOT_FLOW.md`। Test evidence/limitations: `VERIFICATION.md`। Native Windows এবং real provider account দিয়ে acceptance তোমার PC-তে করতে হবে।
