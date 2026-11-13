# Copilot: প্রশ্ন থেকে কাজ পর্যন্ত

Gemini তোমার database-এ connection পায় না। Backend Gemini-কে allowed function definitions দেয়। Model function name ও JSON arguments প্রস্তাব করে; তোমার server validate করে SQL/services চালায়। Model-কে ফেরত দেওয়া tool result থেকেই সে উত্তর লেখে।

## File ধরে flow

| File                                       | দায়িত্ব                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/features/copilot/CopilotPage.tsx`     | Chat, saved conversation, selection, quick lookup, API calls ও loading/error state                      |
| `src/features/copilot/CopilotEvidence.tsx` | Patient/doctor match cards, visit history, verified tool evidence                                       |
| `src/features/copilot/ActionPreview.tsx`   | Registration/booking review, acknowledgement, Confirm/Cancel                                            |
| `src/features/copilot/types.ts`            | Frontend conversation/action/tool data types                                                            |
| `server/routes/copilot.js`                 | Session/Admin/CSRF checks, conversation endpoints, daily cap, action routes                             |
| `server/copilot.js`                        | System instructions, history, bounded model/tool loop, answer ও preview collection                      |
| `server/ai/provider.js`                    | Gemini/OpenAI HTTP payload/response adapters; API key server-side                                       |
| `server/copilot/tools.js`                  | Nine allowed tools, argument validation, observed IDs/selection checks, read queries, draft preparation |
| `server/copilot/store.js`                  | Conversation ownership, revision/turn lock, history, observed entities, draft lifecycle                 |
| `server/copilot/actions.js`                | Confirm/Cancel, expiry/revalidation, transaction ও retry-safe result                                    |
| `server/services.js`                       | Existing appointment/invoice service, capacity/token/duplicate rules                                    |
| `server/db.js`                             | SQLite connection, transactions, patient insertion ও audit helpers                                      |

Paths above are relative to the project root, not files to flatten into one folder.

## Booking-এর concrete example

User: “Abdul Karim-কে Dr Ayesha-এর কাছে আগামীকাল NEW visit-এ বুক করো।”

1. UI conversation ID/revision ও question পাঠায়। Backend own conversation load করে, busy/revision checks ও usage cap করে। User-provided arbitrary conversation history বিশ্বাস করে না।
2. Gemini `search_patients` / `find_doctors` বেছে নিতে পারে। Backend নিজের query চালিয়ে bounded results দেয়। Quick lookup form একই lookup backend দিয়ে সরাসরি চলে; এখানে LLM দরকার হয় না।
3. একটি unique match হলে select হয়। একাধিক match হলে মানুষ card select করে; model guessed/unobserved ID দিয়ে booking করতে পারে না।
4. `prepare_booking` date, doctor, patient, visit type, fee/capacity/duplicate যাচাই করে expiring draft save করে। **এখনও appointment/invoice নেই।**
5. UI preview দেখায়। Model কখনও “saved” বললেও pending action-এর UI answer server স্পষ্টভাবে preview হিসেবে দেখায়।
6. Confirm button আলাদা authenticated API call করে। Backend current fee, identity, date, capacity ও duplicate পুনরায় check করে। Existing service দিয়ে appointment + invoice + confirmation audit এক transaction-এ save হয়।
7. Confirm retry হলে stored result ফেরত আসে; দ্বিতীয় appointment হয় না। UI receipt link দেখায়, relevant queries refresh করে। Cancel হলে draft cancelled হয়, appointment তৈরি হয় না।

Model সরাসরি Confirm tool পায় না। Chat-এ “yes” লিখলেই database write হবে না—preview-এর button চাপতে হবে। নতুন question/selection পুরোনো pending preview supersede করে; 15 মিনিট পরে preview expire হয়।

## Data ও memory

Conversation owner আলাদা। SQLite-এ events এবং শেষ ছয় complete model turns থাকে; UI সর্বোচ্চ 60 events ধরে। Browser sessionStorage শুধু current conversation ID রাখে। Patient/doctor selection ও confirmed action context follow-up-এ ব্যবহার হয়। Reload করলে conversation ফিরে আসে। এটি unlimited memory নয়।

Tools: `daily_report`, `appointment_summary`, `report_range`, `search_patients`, `find_doctors`, `doctor_availability`, `patient_history`, `prepare_registration`, `prepare_booking`। Report range সর্বোচ্চ 31 দিন; patient history সর্বশেষ 30 visits ও মোট outstanding দেয়। Registration-এ আগে duplicate lookup প্রয়োজন; shared phone-এ manual acknowledgement লাগে। কোনো automatic merge হয় না।

Live cloud call-এ question + recent model history + backend-returned tool results যায়। Patient tools চললে identifiable records-ও যেতে পারে। Free-tier practice-এ fictional records ব্যবহার করো। Production patient tools default disabled; `COPILOT_PATIENT_TOOLS_APPROVED=true` একটি deployment gate মাত্র, legal consent/compliance proof নয়।

## নোট করো

- LLM সিদ্ধান্ত প্রস্তাব করে; backend authority ধরে রাখে। Tool schema এবং runtime validation দুটোই দরকার।
- Draft তৈরি করা ও business record commit করা আলাদা ঘটনা। Confirmation-এর আগের checks যথেষ্ট নয়; data বদলে যেতে পারে।
- Transaction আংশিক save আটকায়; idempotency duplicate retry আটকায়। দুটি আলাদা সমস্যা।
- Conversation revision stale UI আটকায়; ownership অন্য user-এর conversation আটকায়।
- API key থাকলেই database access হয় না। তোমার `executeTool` implementation-ই data boundary।

Understanding check: preview-এর পরে doctor fee বদলালে Confirm কেন fail করা উচিত? Browser থেকে arbitrary patient ID পাঠালে কোথায় আটকাবে? এগুলোর উত্তর এবং tests trace করার পর topic assess করব।
