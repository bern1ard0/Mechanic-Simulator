// Mechanic Simulator — server.
// Serves the password-protected web app and a small JSON API.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { read, write, update, uid, DATA_DIR } from './lib/db.js';
import { diagnose } from './lib/diagnose.js';
import { checkRealism, buildEditPrompt, PRESETS } from './lib/visualize.js';
import {
  requireAuth, isConfigured, isAuthed, setPassword, checkPassword,
  setSessionCookie, clearSessionCookie,
} from './lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const app = express();
app.set('trust proxy', 1); // behind a host's https proxy
app.use(express.json({ limit: '25mb' })); // headroom for photos

// --- auth: this gate runs before everything except the login page/assets ---
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || !password.trim()) return res.status(400).json({ error: 'Enter a password.' });
  if (!isConfigured()) {
    // First-ever visit: this becomes the password.
    setPassword(password.trim());
    setSessionCookie(res, req);
    return res.json({ ok: true, created: true });
  }
  if (!checkPassword(password.trim())) return res.status(401).json({ error: 'Wrong password.' });
  setSessionCookie(res, req);
  res.json({ ok: true });
});

app.get('/api/auth-status', (req, res) => {
  res.json({ configured: isConfigured(), authed: isAuthed(req) });
});

app.post('/api/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.use(requireAuth);

// --- static files (gated, except the public ones whitelisted in auth.js) ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Save an array of data-URL images to disk; return their /uploads paths.
function savePhotos(dataUrls = [], vehicleId) {
  if (!Array.isArray(dataUrls) || !dataUrls.length) return [];
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const out = [];
  for (const photo of dataUrls) {
    if (typeof photo !== 'string') continue;
    if (photo.startsWith('/uploads/')) { out.push(photo); continue; } // already saved
    const m = photo.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!m) continue;
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const file = `${vehicleId}-${uid()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, file), Buffer.from(m[2], 'base64'));
    out.push(`/uploads/${file}`);
  }
  return out;
}

function deletePhotoFile(photoPath) {
  if (!photoPath || !photoPath.startsWith('/uploads/')) return;
  const file = path.join(UPLOADS_DIR, path.basename(photoPath));
  if (fs.existsSync(file)) { try { fs.unlinkSync(file); } catch { /* ignore */ } }
}

const VEHICLE_FIELDS = ['status', 'owner', 'year', 'make', 'model', 'trim', 'vin', 'mileage', 'color', 'notes'];

function cleanVehicle(body, existing = {}) {
  const v = { ...existing };
  for (const f of VEHICLE_FIELDS) if (body[f] !== undefined) v[f] = body[f];
  if (!v.status) v.status = 'owned';
  if (!v.owner) v.owner = 'Me';
  if (!Array.isArray(v.photos)) v.photos = [];
  return v;
}

// --- vehicles ---
app.get('/api/vehicles', (_req, res) => res.json(read().vehicles));

app.post('/api/vehicles', (req, res) => {
  const id = uid();
  const vehicle = cleanVehicle(req.body);
  vehicle.id = id;
  vehicle.createdAt = new Date().toISOString();
  vehicle.photos = savePhotos(req.body.photos || (req.body.photo ? [req.body.photo] : []), id);
  update((db) => db.vehicles.push(vehicle));
  res.json(vehicle);
});

app.put('/api/vehicles/:id', (req, res) => {
  const db = read();
  const i = db.vehicles.findIndex((v) => v.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'not found' });
  const vehicle = cleanVehicle(req.body, db.vehicles[i]);
  vehicle.id = db.vehicles[i].id;
  db.vehicles[i] = vehicle;
  write(db);
  res.json(vehicle);
});

app.delete('/api/vehicles/:id', (req, res) => {
  update((db) => {
    const v = db.vehicles.find((x) => x.id === req.params.id);
    (v?.photos || []).forEach(deletePhotoFile);
    db.vehicles = db.vehicles.filter((x) => x.id !== req.params.id);
  });
  res.json({ ok: true });
});

// --- photos: add one or more, or remove one ---
app.post('/api/vehicles/:id/photos', (req, res) => {
  const db = read();
  const v = db.vehicles.find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'not found' });
  const added = savePhotos(req.body.photos || [], v.id);
  v.photos = [...(v.photos || []), ...added];
  write(db);
  res.json(v);
});

app.delete('/api/vehicles/:id/photos', (req, res) => {
  const { photo } = req.body || {};
  const db = read();
  const v = db.vehicles.find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'not found' });
  v.photos = (v.photos || []).filter((p) => p !== photo);
  deletePhotoFile(photo);
  write(db);
  res.json(v);
});

// --- settings (keys) — never return raw values ---
app.get('/api/settings', (_req, res) => {
  const s = read().settings || {};
  res.json({
    ANTHROPIC_API_KEY: Boolean(s.ANTHROPIC_API_KEY),
    YOUTUBE_API_KEY: Boolean(s.YOUTUBE_API_KEY),
    HIGGSFIELD_API_KEY: Boolean(s.HIGGSFIELD_API_KEY),
    ANTHROPIC_MODEL: s.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  });
});

app.post('/api/settings', (req, res) => {
  update((db) => {
    db.settings = db.settings || {};
    for (const key of ['ANTHROPIC_API_KEY', 'YOUTUBE_API_KEY', 'HIGGSFIELD_API_KEY', 'ANTHROPIC_MODEL']) {
      const val = req.body[key];
      if (val === undefined) continue;
      if (val === '') delete db.settings[key];
      else db.settings[key] = val;
    }
  });
  res.json({ ok: true });
});

// --- diagnose ---
app.post('/api/diagnose', async (req, res) => {
  try {
    const { vehicleId, symptom } = req.body;
    if (!symptom || !symptom.trim()) return res.status(400).json({ error: 'Describe the problem first.' });
    const db = read();
    const vehicle = db.vehicles.find((v) => v.id === vehicleId) || {};
    const result = await diagnose({ vehicle, symptom, settings: db.settings || {} });
    if (vehicle.id) {
      update((d) => d.issues.push({ id: uid(), vehicleId: vehicle.id, symptom, result, createdAt: new Date().toISOString() }));
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Diagnosis failed' });
  }
});

app.get('/api/issues/:vehicleId', (req, res) =>
  res.json(read().issues.filter((i) => i.vehicleId === req.params.vehicleId)));

// --- visualize (realism guardrail + prompt builder) ---
app.get('/api/visualize/presets', (_req, res) => res.json(PRESETS));

app.post('/api/visualize', (req, res) => {
  const { vehicleId, presets = [], freeText = '' } = req.body;
  const check = checkRealism(freeText);
  if (!check.ok) return res.status(400).json({ error: check.reason });
  const db = read();
  const vehicle = db.vehicles.find((v) => v.id === vehicleId) || {};
  const prompt = buildEditPrompt({ vehicle, presets, freeText });
  const hasKey = Boolean((db.settings || {}).HIGGSFIELD_API_KEY);
  res.json({
    ok: true, prompt, connected: hasKey,
    note: hasKey
      ? 'Higgsfield key detected. Image generation lands in the next milestone — this is exactly the prompt that gets sent (image-to-image, your real car preserved).'
      : 'Add a Higgsfield key in Settings to enable image edits. The prompt above is realism-checked and ready to send.',
  });
});

app.listen(PORT, () => console.log(`\n  Mechanic Simulator running →  http://localhost:${PORT}\n`));
