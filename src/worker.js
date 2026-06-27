// Mechanic Simulator — Cloudflare Worker.
//
// Bindings (see wrangler.toml):
//   env.DB      D1 database   (vehicles, issues, settings)
//   env.BUCKET  R2 bucket     (car photos)
//   env.ASSETS  static assets (the web page in public/)
//
// Login is handled by Cloudflare Access in front of this Worker, so there is no
// password logic here — any request that reaches us is already authenticated.
import { Hono } from 'hono';
import { diagnose } from './diagnose.js';
import { checkRealism, buildEditPrompt, PRESETS } from './visualize.js';

const app = new Hono();

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => new Date().toISOString();

// ---------- helpers ----------
function rowToVehicle(row) {
  let photos = [];
  try { photos = JSON.parse(row.photos || '[]'); } catch { photos = []; }
  return { ...row, photos };
}

async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of results || []) s[r.key] = r.value;
  return s;
}

function dataUrlToParts(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) return null;
  const contentType = m[1];
  const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1];
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return { contentType, ext, bytes };
}

// Save data-URL images to R2; return their /uploads/<key> paths.
async function savePhotos(env, dataUrls = [], vehicleId) {
  const out = [];
  for (const photo of dataUrls) {
    if (typeof photo === 'string' && photo.startsWith('/uploads/')) { out.push(photo); continue; }
    const parts = dataUrlToParts(photo);
    if (!parts) continue;
    const key = `${vehicleId}/${uid()}.${parts.ext}`;
    await env.BUCKET.put(key, parts.bytes, { httpMetadata: { contentType: parts.contentType } });
    out.push(`/uploads/${key}`);
  }
  return out;
}

async function deletePhoto(env, photoPath) {
  if (!photoPath || !photoPath.startsWith('/uploads/')) return;
  await env.BUCKET.delete(photoPath.replace(/^\/uploads\//, ''));
}

const VEHICLE_FIELDS = ['status', 'owner', 'year', 'make', 'model', 'trim', 'vin', 'mileage', 'color', 'notes'];

// ---------- photos (served from R2) ----------
app.get('/uploads/*', async (c) => {
  const key = c.req.path.replace(/^\/uploads\//, '');
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'private, max-age=3600');
  return new Response(obj.body, { headers });
});

// ---------- vehicles ----------
app.get('/api/vehicles', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM vehicles ORDER BY created_at').all();
  return c.json((results || []).map(rowToVehicle));
});

app.post('/api/vehicles', async (c) => {
  const body = await c.req.json();
  const id = uid();
  const photos = await savePhotos(c.env, body.photos || (body.photo ? [body.photo] : []), id);
  const v = {
    id,
    status: body.status || 'owned',
    owner: body.owner || 'Me',
    created_at: now(),
    photos: JSON.stringify(photos),
  };
  for (const f of VEHICLE_FIELDS) if (f !== 'status' && f !== 'owner') v[f] = body[f] || null;
  await c.env.DB.prepare(
    `INSERT INTO vehicles (id,status,owner,year,make,model,trim,vin,mileage,color,notes,photos,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(v.id, v.status, v.owner, v.year, v.make, v.model, v.trim, v.vin, v.mileage, v.color, v.notes, v.photos, v.created_at).run();
  return c.json(rowToVehicle(v));
});

app.put('/api/vehicles/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const existing = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id=?').bind(id).first();
  if (!existing) return c.json({ error: 'not found' }, 404);
  const v = { ...existing };
  v.status = body.status || existing.status || 'owned';
  v.owner = body.owner || 'Me';
  for (const f of VEHICLE_FIELDS) if (f !== 'status' && f !== 'owner' && body[f] !== undefined) v[f] = body[f];
  await c.env.DB.prepare(
    `UPDATE vehicles SET status=?,owner=?,year=?,make=?,model=?,trim=?,vin=?,mileage=?,color=?,notes=? WHERE id=?`
  ).bind(v.status, v.owner, v.year, v.make, v.model, v.trim, v.vin, v.mileage, v.color, v.notes, id).run();
  return c.json(rowToVehicle(v));
});

app.delete('/api/vehicles/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT photos FROM vehicles WHERE id=?').bind(id).first();
  if (row) {
    let photos = [];
    try { photos = JSON.parse(row.photos || '[]'); } catch { /* ignore */ }
    await Promise.all(photos.map((p) => deletePhoto(c.env, p)));
  }
  await c.env.DB.prepare('DELETE FROM vehicles WHERE id=?').bind(id).run();
  return c.json({ ok: true });
});

// ---------- photos: add / remove ----------
app.post('/api/vehicles/:id/photos', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const row = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id=?').bind(id).first();
  if (!row) return c.json({ error: 'not found' }, 404);
  const current = JSON.parse(row.photos || '[]');
  const added = await savePhotos(c.env, body.photos || [], id);
  const photos = [...current, ...added];
  await c.env.DB.prepare('UPDATE vehicles SET photos=? WHERE id=?').bind(JSON.stringify(photos), id).run();
  return c.json(rowToVehicle({ ...row, photos: JSON.stringify(photos) }));
});

app.delete('/api/vehicles/:id/photos', async (c) => {
  const id = c.req.param('id');
  const { photo } = await c.req.json();
  const row = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id=?').bind(id).first();
  if (!row) return c.json({ error: 'not found' }, 404);
  const photos = JSON.parse(row.photos || '[]').filter((p) => p !== photo);
  await deletePhoto(c.env, photo);
  await c.env.DB.prepare('UPDATE vehicles SET photos=? WHERE id=?').bind(JSON.stringify(photos), id).run();
  return c.json(rowToVehicle({ ...row, photos: JSON.stringify(photos) }));
});

// ---------- settings ----------
app.get('/api/settings', async (c) => {
  const s = await getSettings(c.env);
  return c.json({
    ANTHROPIC_API_KEY: Boolean(s.ANTHROPIC_API_KEY),
    YOUTUBE_API_KEY: Boolean(s.YOUTUBE_API_KEY),
    HIGGSFIELD_API_KEY: Boolean(s.HIGGSFIELD_API_KEY),
    ANTHROPIC_MODEL: s.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  });
});

app.post('/api/settings', async (c) => {
  const body = await c.req.json();
  for (const key of ['ANTHROPIC_API_KEY', 'YOUTUBE_API_KEY', 'HIGGSFIELD_API_KEY', 'ANTHROPIC_MODEL']) {
    const val = body[key];
    if (val === undefined) continue;
    if (val === '') await c.env.DB.prepare('DELETE FROM settings WHERE key=?').bind(key).run();
    else await c.env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=?').bind(key, val, val).run();
  }
  return c.json({ ok: true });
});

// ---------- diagnose ----------
app.post('/api/diagnose', async (c) => {
  try {
    const { vehicleId, symptom } = await c.req.json();
    if (!symptom || !symptom.trim()) return c.json({ error: 'Describe the problem first.' }, 400);
    const row = vehicleId ? await c.env.DB.prepare('SELECT * FROM vehicles WHERE id=?').bind(vehicleId).first() : null;
    const vehicle = row ? rowToVehicle(row) : {};
    const settings = await getSettings(c.env);
    const result = await diagnose({ vehicle, symptom, settings });
    if (vehicle.id) {
      await c.env.DB.prepare('INSERT INTO issues (id,vehicle_id,symptom,result,created_at) VALUES (?,?,?,?,?)')
        .bind(uid(), vehicle.id, symptom, JSON.stringify(result), now()).run();
    }
    return c.json(result);
  } catch (err) {
    return c.json({ error: err.message || 'Diagnosis failed' }, 500);
  }
});

app.get('/api/issues/:vehicleId', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM issues WHERE vehicle_id=? ORDER BY created_at DESC')
    .bind(c.req.param('vehicleId')).all();
  return c.json((results || []).map((r) => ({ ...r, result: JSON.parse(r.result || '{}') })));
});

// ---------- visualize ----------
app.get('/api/visualize/presets', (c) => c.json(PRESETS));

app.post('/api/visualize', async (c) => {
  const { vehicleId, presets = [], freeText = '' } = await c.req.json();
  const check = checkRealism(freeText);
  if (!check.ok) return c.json({ error: check.reason }, 400);
  const row = vehicleId ? await c.env.DB.prepare('SELECT * FROM vehicles WHERE id=?').bind(vehicleId).first() : null;
  const vehicle = row ? rowToVehicle(row) : {};
  const settings = await getSettings(c.env);
  const prompt = buildEditPrompt({ vehicle, presets, freeText });
  const hasKey = Boolean(settings.HIGGSFIELD_API_KEY);
  return c.json({
    ok: true, prompt, connected: hasKey,
    note: hasKey
      ? 'Higgsfield key detected. Image generation lands in the next milestone — this is exactly the prompt that gets sent (image-to-image, your real car preserved).'
      : 'Add a Higgsfield key in Settings to enable image edits. The prompt above is realism-checked and ready to send.',
  });
});

// Anything else → static assets (the web page).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
