# CODEX TASK — Copilot 0.2.0

**Context:** CareDesk Clinic Operations; existing real Gemini adapter and read-only report assistant. User authorized implementing a working task copilot first, followed by a file-by-file explanation.

**Repository task:** Add server-owned conversations, constrained patient/doctor lookup, history/dues, availability and registration/booking previews. A separate human Confirm endpoint commits validated actions. Preserve existing payment/auth/registration behavior and user configuration/database on upgrade.

**Learning constraint:** Working generated code does not establish understanding. Teach in Bengali, trace UI → API → tool → database → preview → confirmation, and assess before marking the topic passed. No arbitrary SQL, model-triggered confirmation, payment execution, diagnosis or automatic patient merging.

**Expected output:** Working source ZIP, passing build/backend/frontend checks, repeat-safe confirmation, update script preserving .env/data, exact module map, verification limitations and lesson notes. Read COPILOT_FLOW.md, then explain why prepare_booking and confirmDraft must be separate before the next lesson.
