import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
const source = process.env.DB_PATH || './data/clinic.sqlite';
mkdirSync('backups', { recursive: true });
const destination = `backups/clinic-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
const db = new DatabaseSync(source, { readOnly: true });
await backup(db, destination);
db.close();
console.log(`Backup created: ${destination}`);
