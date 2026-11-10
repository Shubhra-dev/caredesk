import { openDatabase } from './db.js';
import { createApp } from './app.js';
const production = process.env.NODE_ENV === 'production';
if (production && !process.env.APP_ORIGIN?.startsWith('https://'))
  throw new Error('Production requires an HTTPS APP_ORIGIN and a TLS reverse proxy.');
const db = openDatabase();
const app = createApp(db);
const port = Number(process.env.PORT || 4100);
const server = app.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(
    `Clinic API ready at http://localhost:${port}${production ? '' : ' (local demo data)'}`,
  ),
);
function stop() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
