import { z } from 'zod';
import { transaction, audit, passwordHash } from '../db.js';
import { HttpError, requireThat } from '../validation.js';
import { sessionMiddleware, checkPassword, createSession, cookieName, userView } from '../auth.js';

export function registerAuthRoutes(app, db, { production }) {
  const loginAttempts = new Map();
  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip,
      now = Date.now();
    for (const [key, value] of loginAttempts) if (value.until < now) loginAttempts.delete(key);
    const limiter = loginAttempts.get(ip) || { count: 0, until: now + 15 * 60000 };
    if (limiter.count >= 10)
      throw new HttpError(429, 'Too many login attempts. Try again in 15 minutes.');
    const { email, password } = z
      .object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })
      .parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase());
    if (!user || !checkPassword(password, user.password_hash)) {
      limiter.count++;
      loginAttempts.set(ip, limiter);
      throw new HttpError(401, 'Email or password is incorrect.');
    }
    loginAttempts.delete(ip);
    const session = createSession(db, user.id);
    res.cookie(cookieName, session.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: production,
      maxAge: 8 * 3600000,
      path: '/',
    });
    audit(db, user.id, 'LOGIN', user.id);
    res.json({ user: userView(user), csrf: session.csrf });
  });
  app.use('/api', sessionMiddleware(db));
  app.get('/api/auth/me', (req, res) =>
    res.json({ user: userView(req.user), csrf: req.user.csrf }),
  );
  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE hash=?').run(req.sessionHash);
    res.clearCookie(cookieName, {
      httpOnly: true,
      sameSite: 'strict',
      secure: production,
      path: '/',
    });
    res.json({ ok: true });
  });
  app.post('/api/auth/password', (req, res) => {
    const data = z
      .object({ currentPassword: z.string().max(200), newPassword: z.string().min(12).max(200) })
      .parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    requireThat(
      checkPassword(data.currentPassword, user.password_hash),
      400,
      'Current password is incorrect.',
    );
    transaction(db, () => {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(
        passwordHash(data.newPassword),
        user.id,
      );
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      audit(db, user.id, 'PASSWORD_CHANGED', user.id);
    });
    res.clearCookie(cookieName, { path: '/' });
    res.json({ ok: true });
  });
}
