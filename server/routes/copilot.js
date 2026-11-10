import { z } from 'zod';
import { today } from '../db.js';
import { requireThat } from '../validation.js';
import { adminOnly } from '../auth.js';
import { askCopilot } from '../copilot.js';
import { publicAIStatus } from '../ai/provider.js';

export function registerCopilotRoutes(app, db, copilotOptions) {
  const aiUse = new Map();
  app.get('/api/copilot/status', adminOnly, (req, res) => res.json(publicAIStatus(copilotOptions)));
  app.post('/api/copilot', adminOnly, async (req, res) => {
    const { question } = z.object({ question: z.string().trim().min(3).max(800) }).parse(req.body);
    const key = `${req.user.id}:${today()}`;
    const usage = aiUse.get(key) || 0;
    requireThat(usage < 30, 429, 'Daily copilot request limit reached (30).');
    aiUse.set(key, usage + 1);
    res.json(await askCopilot(db, question, req.user.id, copilotOptions));
  });
}
