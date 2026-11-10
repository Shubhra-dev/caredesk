import { z } from 'zod';
import { today, transaction, audit } from '../db.js';
import { paymentSchema, dateSchema, requireThat } from '../validation.js';
import { adminOnly } from '../auth.js';
import { recordPayment, invoiceQuery } from '../services.js';

export function registerBillingRoutes(app, db) {
  app.get('/api/invoices', (req, res) => {
    const date = dateSchema.parse(req.query.date || today());
    res.json(db.prepare(`${invoiceQuery} WHERE a.visit_date=? ORDER BY i.seq DESC`).all(date));
  });
  app.get('/api/invoices/:id', (req, res) => {
    const invoice = db.prepare(`${invoiceQuery} WHERE i.id=?`).get(req.params.id);
    requireThat(invoice, 404, 'Invoice not found.');
    res.json({
      invoice,
      payments: db
        .prepare(
          'SELECT p.*,u.name recorded_by FROM payments p JOIN users u ON u.id=p.created_by WHERE p.invoice_id=? ORDER BY p.seq',
        )
        .all(invoice.id),
    });
  });
  app.post('/api/invoices/:id/payments', (req, res) =>
    res
      .status(201)
      .json(recordPayment(db, req.params.id, paymentSchema.parse(req.body), req.user.id)),
  );
  app.post('/api/payments/:id/reverse', adminOnly, (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(5).max(300) }).parse(req.body);
    transaction(db, () => {
      const p = db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id);
      requireThat(p, 404, 'Payment not found.');
      requireThat(!p.reversed_at, 409, 'Payment already reversed.');
      db.prepare(
        'UPDATE payments SET reversed_at=?,reversal_reason=?,reversed_by=? WHERE id=?',
      ).run(`${today()}T${new Date().toISOString().slice(11)}`, reason, req.user.id, p.id);
      audit(db, req.user.id, 'PAYMENT_REVERSED', p.id, reason);
    });
    res.json({ ok: true });
  });
}
