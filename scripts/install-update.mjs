import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supplied = process.argv[2];
if (!supplied)
  throw new Error(
    'Pass the full existing project path: node scripts/install-update.mjs "C:\\path\\clinic-operations"',
  );
const target = realpathSync(resolve(supplied));
if (realpathSync(source) === target)
  throw new Error('Extract the update separately; source and destination must differ.');
const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
if (manifest.name !== 'clinic-operations')
  throw new Error('Destination is not the clinic-operations project.');
const folders = ['src', 'server', 'scripts', 'docs', 'tests', 'public'];
const files = [
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.ts',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'README.md',
  'START_HERE.md',
  'AGENTS.md',
  '.env.example',
  '.gitignore',
];
const entries = [...folders, ...files].filter((name) => existsSync(join(source, name)));
for (const name of entries) {
  if (
    existsSync(join(target, name)) &&
    statSync(join(source, name)).isDirectory() !== statSync(join(target, name)).isDirectory()
  )
    throw new Error(`Destination has a file/directory conflict: ${name}. No files were copied.`);
}
const backup = join(target, '.update-backups', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(backup, { recursive: true });
for (const name of entries) {
  if (existsSync(join(target, name)))
    cpSync(join(target, name), join(backup, name), { recursive: true });
}
for (const name of entries)
  cpSync(join(source, name), join(target, name), { recursive: true, force: true });
console.log(
  `Updated: ${target}\nSource backup: ${backup}\n.env, data, node_modules and backups were preserved.\nIn the destination project run: npm ci, then npm run check, then npm run dev.`,
);
