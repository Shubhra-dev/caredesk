import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { HttpError } from './validation.js';
export const cookieName = 'clinic_session';
const hash = (value) => createHash('sha256').update(value).digest('hex');
export function checkPassword(password, stored) {
  const [salt, key] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(key, 'hex'));
}
export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex'),
    csrf = randomBytes(24).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(
    hash(token),
    userId,
    csrf,
    Date.now() + 8 * 3600000,
  );
  return { token, csrf };
}
export function sessionMiddleware(db) {
  return (req, res, next) => {
    const token = req.cookies[cookieName];
    const session =
      token &&
      db
        .prepare(
          'SELECT u.id,u.name,u.email,u.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?',
        )
        .get(hash(token), Date.now());
    if (!session) return next(new HttpError(401, 'Please sign in.'));
    req.user = session;
    req.sessionHash = hash(token);
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('x-csrf-token') !== session.csrf
    )
      return next(new HttpError(403, 'Invalid security token. Reload and try again.'));
    next();
  };
}
export const adminOnly = (req, res, next) =>
  req.user.role === 'ADMIN' ? next() : next(new HttpError(403, 'Administrator access required.'));
export const userView = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
