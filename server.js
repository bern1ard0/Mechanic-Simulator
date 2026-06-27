// Mechanic Simulator — local server.
// Serves the web page and a small JSON API. Run with `npm start`, then open
// http://localhost:3000 in your browser. Everything stays on your machine.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { read, write, update, uid } from './lib/db.js';
import { diagnose } from './lib/diagnose.js';
import { checkRealism, buildEditPrompt, PRESETS } from './lib/visualize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');

const app = express();
app.use(express.json({ limit: '15mb' })); // headroom for base64 photos

// --- static files ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// If the frontend sends a new photo as a data URL, save it to disk and return
// a path. Re-saving an existing /uploads path is a no-op.
function persistPhoto(photo, id) {
  if (!photo || !photo.startsWith('data:')) return photo || '';
  const match = photo.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return '';
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const file = `${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, file), Buffer.from(match[2], 'base64'));
  return `/uploads/${file}`;
}

const VEHICLE_FIELDS = [
  'status', 'owner', 'year', 'make', 'model', 'trim',
  'vin', 'mileage', 'color', 'notes',
];

function cleanVehicle(body, existing = {}) {
  const v = { ...existing };
  for (const f of VEHICLE_FIELDS) {
    if (body[f] !== undefined) v[f] = body[f];
  }
  if (!v.status) v.status = 'owned';
  if (!v.owner) v.owner = 'Me';
  return v;
}

// --- vehicles ---
app.get('/api/vehicles', (_req, res) => {
  res.json(read().vehicles);
});

app.post('/api/vehicles', (req, res) => {
  const id = uid();
  const vehicle = cleanVehicle(req.body);
  vehicle.id = id;
  vehicle.createdAt = new Date().toISOString();
  vehicle.photo = persistPhoto(req.body.photo, id);
  update((db) => db.vehicles.push(vehicle));
  res.json(vehicle);
});

app.put('/api/vehicles/:id', (req, res) => {
  const db = read();
  const i = db.vehicles.findIndex((v) => v.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'not found' });
  const vehicle = cleanVehicle(req.body, db.vehicles[i]);
  vehicle.id = db.vehicles[i].id;
  if (req.body.photo !== undefined) vehicle.photo = persistPhoto(req.body.photo, vehicle.id);
  db.vehicles[i] = vehicle;
  write(db);
  res.json(vehicle);
});

app.delete('/api/vehicles/:id', (req, res) => {
  update((db) => {
    db.vehicles = db.vehicles.filter((v) => v.id !== req.params.id);
  });
  res.json({ ok: true });
});

// --- settings (keys) ---
// Never return raw key values to the browser — only whether each is set.
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
      // Empty string clears a key; undefined leaves it untouched.
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
    // Save to that car's history.
    if (vehicle.id) {
      update((d) => {
        d.issues.push({
          id: uid(), vehicleId: vehicle.id, symptom,
          result, createdAt: new Date().toISOString(),
        });
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Diagnosis failed' });
  }
});

app.get('/api/issues/:vehicleId', (req, res) => {
  const issues = read().issues.filter((i) => i.vehicleId === req.params.vehicleId);
  res.json(issues);
});

// --- visualize (realism guardrail + prompt builder) ---
// Building the Higgsfield image call is the next milestone; this endpoint
// already enforces realism and returns the exact prompt that would be sent.
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
    ok: true,
    prompt,
    connected: hasKey,
    note: hasKey
      ? 'Higgsfield key detected. Image generation is wired in the next milestone — the prompt above is exactly what gets sent (image-to-image, your real car preserved).'
      : 'Add a Higgsfield key in Settings to enable image edits. The prompt above is realism-checked and ready to send.',
  });
});

app.listen(PORT, () => {
  console.log(`\n  Mechanic Simulator running →  http://localhost:${PORT}\n`);
});
