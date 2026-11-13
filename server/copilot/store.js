import { randomUUID } from 'node:crypto';
import { audit, transaction } from '../db.js';
import { requireThat } from '../validation.js';

export function ensureCopilotSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS copilot_conversations(
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0, history_json TEXT NOT NULL DEFAULT '[]', events_json TEXT NOT NULL DEFAULT '[]',
    selected_patient_id TEXT, selected_doctor_id TEXT, busy_until INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS copilot_entities(conversation_id TEXT NOT NULL REFERENCES copilot_conversations(id),kind TEXT NOT NULL,entity_id TEXT NOT NULL,PRIMARY KEY(conversation_id,kind,entity_id));
    CREATE TABLE IF NOT EXISTS copilot_drafts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),conversation_id TEXT NOT NULL REFERENCES copilot_conversations(id),kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',payload_json TEXT NOT NULL,preview_json TEXT NOT NULL,result_json TEXT,expires_at INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS copilot_usage(user_id TEXT NOT NULL REFERENCES users(id),day TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(user_id,day));
    INSERT OR IGNORE INTO schema_version VALUES(2);`);
}
export function ownedConversation(db, id, userId) {
  const row = db
    .prepare('SELECT * FROM copilot_conversations WHERE id=? AND user_id=?')
    .get(id, userId);
  requireThat(row, 404, 'Conversation not found.');
  return row;
}
export function getDraft(db, id, userId) {
  const d = db.prepare('SELECT * FROM copilot_drafts WHERE id=? AND user_id=?').get(id, userId);
  requireThat(d, 404, 'Action not found.');
  return {
    id: d.id,
    conversationId: d.conversation_id,
    kind: d.kind,
    status: d.status === 'PENDING' && d.expires_at < Date.now() ? 'EXPIRED' : d.status,
    preview: JSON.parse(d.preview_json),
    expiresAt: d.expires_at,
    result: d.result_json ? JSON.parse(d.result_json) : null,
  };
}
export function publicConversation(db, id, userId) {
  const row = ownedConversation(db, id, userId);
  const events = JSON.parse(row.events_json).map((e) => ({
    ...e,
    actions: (e.actions || []).map((a) => getDraft(db, a.id, userId)),
  }));
  return {
    id: row.id,
    title: row.title,
    revision: row.revision,
    selectedPatientId: row.selected_patient_id,
    selectedDoctorId: row.selected_doctor_id,
    events,
  };
}
export function createConversation(db, userId, title) {
  const id = randomUUID();
  db.prepare('INSERT INTO copilot_conversations(id,user_id,title) VALUES(?,?,?)').run(
    id,
    userId,
    title.slice(0, 70),
  );
  return id;
}
export function beginTurn(db, id, userId, expectedRevision) {
  return transaction(db, () => {
    const row = ownedConversation(db, id, userId);
    requireThat(
      row.revision === expectedRevision,
      409,
      'Conversation changed in another tab. Refresh the conversation and try again.',
    );
    requireThat(
      row.busy_until < Date.now(),
      409,
      'This conversation is processing another question. Please wait.',
    );
    db.prepare('UPDATE copilot_conversations SET busy_until=? WHERE id=?').run(
      Date.now() + 150000,
      id,
    );
    // A new request invalidates earlier unsigned previews. Ask for a fresh preview to act on a changed intent.
    db.prepare(
      "UPDATE copilot_drafts SET status='SUPERSEDED' WHERE conversation_id=? AND status='PENDING'",
    ).run(id);
    return row;
  });
}
export function finishTurn(db, id, userId, question, answer, modelMessages) {
  const row = ownedConversation(db, id, userId),
    events = JSON.parse(row.events_json),
    history = JSON.parse(row.history_json);
  events.push(
    { id: randomUUID(), role: 'user', content: question },
    { id: randomUUID(), role: 'assistant', content: answer.answer, ...answer },
  );
  history.push(
    modelMessages?.length
      ? modelMessages
      : [
          { role: 'user', content: question },
          { role: 'assistant', content: answer.answer },
        ],
  );
  db.prepare(
    "UPDATE copilot_conversations SET events_json=?,history_json=?,revision=revision+1,busy_until=0,updated_at=datetime('now') WHERE id=?",
  ).run(JSON.stringify(events.slice(-60)), JSON.stringify(history.slice(-6)), id);
  return publicConversation(db, id, userId);
}
export function appendSystemEvent(db, id, userId, content, result) {
  const row = ownedConversation(db, id, userId),
    events = JSON.parse(row.events_json);
  events.push({ id: randomUUID(), role: 'system', content, result });
  db.prepare(
    "UPDATE copilot_conversations SET events_json=?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
  ).run(JSON.stringify(events.slice(-60)), id);
}
export function observe(db, conversationId, kind, rows) {
  for (const row of rows)
    db.prepare('INSERT OR IGNORE INTO copilot_entities VALUES(?,?,?)').run(
      conversationId,
      kind,
      row.id,
    );
}
export function selectEntity(db, id, userId, kind, entityId, revision) {
  return transaction(db, () => {
    const row = ownedConversation(db, id, userId);
    requireThat(row.revision === revision, 409, 'Conversation changed. Refresh before selecting.');
    requireThat(row.busy_until < Date.now(), 409, 'Wait until the answer completes.');
    requireThat(['patient', 'doctor'].includes(kind), 400, 'Invalid selection type.');
    requireThat(
      db
        .prepare(
          'SELECT 1 FROM copilot_entities WHERE conversation_id=? AND kind=? AND entity_id=?',
        )
        .get(id, kind, entityId),
      400,
      'Select an item returned in this conversation.',
    );
    const field = kind === 'patient' ? 'selected_patient_id' : 'selected_doctor_id';
    db.prepare(`UPDATE copilot_conversations SET ${field}=? WHERE id=?`).run(entityId, id);
    db.prepare(
      "UPDATE copilot_drafts SET status='SUPERSEDED' WHERE conversation_id=? AND status='PENDING'",
    ).run(id);
    appendSystemEvent(
      db,
      id,
      userId,
      `${kind === 'patient' ? 'Patient' : 'Doctor'} selected. Continue your request when ready.`,
      { kind, entityId },
    );
    return publicConversation(db, id, userId);
  });
}
export function stageDraft(db, context, kind, payload, preview) {
  requireThat(context?.conversationId, 400, 'A conversation is required to prepare an action.');
  ownedConversation(db, context.conversationId, context.userId);
  db.prepare(
    "UPDATE copilot_drafts SET status='SUPERSEDED' WHERE conversation_id=? AND status='PENDING'",
  ).run(context.conversationId);
  const id = randomUUID();
  db.prepare(
    'INSERT INTO copilot_drafts(id,user_id,conversation_id,kind,payload_json,preview_json,expires_at) VALUES(?,?,?,?,?,?,?)',
  ).run(
    id,
    context.userId,
    context.conversationId,
    kind,
    JSON.stringify(payload),
    JSON.stringify(preview),
    Date.now() + 15 * 60000,
  );
  audit(db, context.userId, 'COPILOT_DRAFT_PREPARED', id, kind);
  return getDraft(db, id, context.userId);
}
