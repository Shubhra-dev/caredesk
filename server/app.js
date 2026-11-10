import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { HttpError } from './validation.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPatientsRoutes } from './routes/patients.js';
import { registerDoctorsRoutes } from './routes/doctors.js';
import { registerAppointmentsRoutes } from './routes/appointments.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerWorkspaceRoutes } from './routes/workspace.js';
import { registerCopilotRoutes } from './routes/copilot.js';

export function createApp(
  db,
  {
    production = process.env.NODE_ENV === 'production',
    origin = process.env.APP_ORIGIN || 'http://localhost:5173',
    copilotOptions,
  } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': production ? [] : null,
        },
      },
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const source = req.get('origin');
      const allowed = new Set([
        origin,
        ...(!production
          ? [
              'http://localhost:5173',
              'http://127.0.0.1:5173',
              'http://localhost:4100',
              'http://127.0.0.1:4100',
            ]
          : []),
      ]);
      if (source && !allowed.has(source))
        return next(new HttpError(403, 'Untrusted request origin.'));
    }
    next();
  });
  app.get('/api/health', (_, res) => res.json({ ok: true, service: 'clinic-operations' }));
  registerAuthRoutes(app, db, { production });
  registerPatientsRoutes(app, db);
  registerDoctorsRoutes(app, db);
  registerAppointmentsRoutes(app, db);
  registerBillingRoutes(app, db);
  registerWorkspaceRoutes(app, db);
  registerCopilotRoutes(app, db, copilotOptions);
  app.use('/api', (_, res) => res.status(404).json({ message: 'API route not found.' }));
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (_, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ZodError)
      return res
        .status(400)
        .json({ message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({
      message:
        status >= 500 && !error.status
          ? 'Unexpected server error. Please try again.'
          : error.message,
    });
  });
  return app;
}
