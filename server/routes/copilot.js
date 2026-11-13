import { z } from 'zod';
import { today, transaction } from '../db.js';
import { requireThat } from '../validation.js';
import { adminOnly } from '../auth.js';
import { askCopilot } from '../copilot.js';
import { publicAIStatus } from '../ai/provider.js';
import {
  ensureCopilotSchema,
  ownedConversation,
  publicConversation,
  createConversation,
  beginTurn,
  finishTurn,
  selectEntity,
} from '../copilot/store.js';
import { executeTool } from '../copilot/tools.js';
import { confirmDraft, cancelDraft } from '../copilot/actions.js';

export function registerCopilotRoutes(app, db, copilotOptions) {
  ensureCopilotSchema(db);
  app.get('/api/copilot/status', adminOnly, (req, res) =>
    res.json({
      ...publicAIStatus(copilotOptions),
      patientToolsEnabled:
        process.env.NODE_ENV !== 'production' ||
        process.env.COPILOT_PATIENT_TOOLS_APPROVED === 'true',
    }),
  );
  app.get('/api/copilot/conversations', adminOnly, (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT id,title,revision,updated_at FROM copilot_conversations WHERE user_id=? ORDER BY updated_at DESC,rowid DESC LIMIT 20',
        )
        .all(req.user.id),
    ),
  );
  app.post('/api/copilot/conversations', adminOnly, (req, res) => {
    const { title } = z
      .object({ title: z.string().trim().max(70).default('New conversation') })
      .parse(req.body || {});
    const id = createConversation(db, req.user.id, title);
    res.status(201).json(publicConversation(db, id, req.user.id));
  });
  app.get('/api/copilot/conversations/:id', adminOnly, (req, res) =>
    res.json(publicConversation(db, req.params.id, req.user.id)),
  );
  app.post('/api/copilot/conversations/:id/selection', adminOnly, (req, res) => {
    const data = z
      .object({
        kind: z.enum(['patient', 'doctor']),
        entityId: z.string().min(1),
        expectedRevision: z.number().int().min(0),
      })
      .strict()
      .parse(req.body);
    res.json(
      selectEntity(db, req.params.id, req.user.id, data.kind, data.entityId, data.expectedRevision),
    );
  });
  app.post('/api/copilot/conversations/:id/lookup', adminOnly, (req, res) => {
    const { kind, query, expectedRevision } = z
      .object({
        kind: z.enum(['patient', 'doctor']),
        query: z.string().trim().min(2).max(120),
        expectedRevision: z.number().int().min(0),
      })
      .strict()
      .parse(req.body);
    const row = beginTurn(db, req.params.id, req.user.id, expectedRevision);
    try {
      const name = kind === 'patient' ? 'search_patients' : 'find_doctors';
      const result = executeTool(
        db,
        name,
        { query },
        { conversationId: row.id, userId: req.user.id },
      );
      const answer = {
        mode: 'LOCAL_TOOLS',
        answer: result.items.length
          ? `${result.items.length} ${kind} match(es). ${result.requiresSelection ? 'Choose the correct card before continuing.' : 'One match selected. Continue your request below.'}`
          : `No ${kind} matched. Refine the search${kind === 'patient' ? ' or ask Copilot to prepare a new registration' : ''}.`,
        toolCalls: [{ name, arguments: { query }, result }],
        actions: [],
      };
      res.json(finishTurn(db, row.id, req.user.id, `Find ${kind}: ${query}`, answer));
    } catch (error) {
      db.prepare('UPDATE copilot_conversations SET busy_until=0 WHERE id=?').run(row.id);
      throw error;
    }
  });
  app.post('/api/copilot', adminOnly, async (req, res) => {
    const data = z
      .object({
        question: z.string().trim().min(3).max(1200),
        conversationId: z.string().uuid().nullish(),
        expectedRevision: z.number().int().min(0).default(0),
      })
      .strict()
      .parse(req.body);
    const id = data.conversationId || createConversation(db, req.user.id, data.question);
    const row = beginTurn(db, id, req.user.id, data.expectedRevision);
    try {
      transaction(db, () => {
        const day = today();
        const usage =
          db
            .prepare('SELECT count FROM copilot_usage WHERE user_id=? AND day=?')
            .get(req.user.id, day)?.count || 0;
        requireThat(
          usage < 30,
          429,
          'Daily copilot question limit reached (30). Directories/forms remain available.',
        );
        db.prepare(
          'INSERT INTO copilot_usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1',
        ).run(req.user.id, day);
      });
      const answer = await askCopilot(db, data.question, req.user.id, {
        ...copilotOptions,
        context: { conversationId: id },
        history: JSON.parse(row.history_json),
      });
      const conversation = finishTurn(
        db,
        id,
        req.user.id,
        data.question,
        answer,
        answer.modelMessages,
      );
      res.json({ ...answer, conversation });
    } catch (error) {
      db.prepare('UPDATE copilot_conversations SET busy_until=0 WHERE id=?').run(id);
      throw error;
    }
  });
  app.post('/api/copilot/actions/:id/confirm', adminOnly, (req, res) => {
    const data = z
      .object({ acknowledgeSharedContact: z.boolean().default(false) })
      .strict()
      .parse(req.body || {});
    res.json(confirmDraft(db, req.params.id, req.user.id, data));
  });
  app.post('/api/copilot/actions/:id/cancel', adminOnly, (req, res) => {
    res.json({ conversation: cancelDraft(db, req.params.id, req.user.id) });
  });
}
