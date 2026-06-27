// Tiny JSON-file database. Perfect for a single-user personal app:
// no server to install, no native modules, easy to back up (it's one file).
// Everything lives in data/db.json, which is gitignored so it never leaves
// your machine.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = { vehicles: [], issues: [], edits: [], settings: {} };

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

export function read() {
  ensure();
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { ...DEFAULT_DB, ...raw };
  } catch {
    return { ...DEFAULT_DB };
  }
}

export function write(db) {
  ensure();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  return db;
}

// Read, mutate, and persist in one shot.
export function update(mutator) {
  const db = read();
  mutator(db);
  return write(db);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
