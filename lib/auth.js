// Password protection for the whole site.
//
// One password (it's your personal app). On the very first visit you set it;
// after that you log in with it. The password is never stored in plain text —
// only a salted scrypt hash. Login hands back a signed, HttpOnly cookie so you
// stay logged in on your phone without re-typing it every time.
//
// No external dependencies — just Node's built-in crypto.
import crypto from 'crypto';
import { read, update } from './db.js';

const COOKIE = 'ms_session';
const WEEK = 7 * 24 * 60 * 60 * 1000;

// --- secret used to sign session cookies (persisted so logins survive restarts) ---
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  let s = read().settings?.sessionSecret;
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    update((db) => {
      db.settings = db.settings || {};
      db.settings.sessionSecret = s;
    });
  }
  return s;
}

// --- password storage (env var wins; otherwise a hash we store on first setup) ---
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

export function isConfigured() {
  return Boolean(process.env.AUTH_PASSWORD || read().settings?.authPasswordHash);
}

export function setPassword(password) {
  if (process.env.AUTH_PASSWORD) return; // env-managed; nothing to store
  update((db) => {
    db.settings = db.settings || {};
    db.settings.authPasswordHash = hashPassword(password);
  });
}

export function checkPassword(password) {
  if (process.env.AUTH_PASSWORD) return password === process.env.AUTH_PASSWORD;
  const stored = read().settings?.authPasswordHash;
  return stored ? verifyPassword(password, stored) : false;
}

// --- signed cookie tokens ---
function sign(value) {
  const mac = crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex');
  return `${value}.${mac}`;
}
function makeToken() {
  const exp = String(Date.now() + WEEK);
  return Buffer.from(sign(exp)).toString('base64url');
}
function tokenValid(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const [exp, mac] = decoded.split('.');
    if (!exp || !mac) return false;
    const expected = crypto.createHmac('sha256', sessionSecret()).update(exp).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
    return Number(exp) > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i > -1) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

export function isAuthed(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  return token ? tokenValid(token) : false;
}

export function setSessionCookie(res, req) {
  // Secure flag when we're actually served over https (e.g. behind a host's proxy).
  const https = req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${makeToken()}; HttpOnly; Path=/; Max-Age=${WEEK / 1000}; SameSite=Lax${https ? '; Secure' : ''}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

// Paths reachable without logging in.
const PUBLIC = new Set(['/login.html', '/login.js', '/styles.css', '/api/login', '/api/auth-status']);

export function requireAuth(req, res, next) {
  if (PUBLIC.has(req.path)) return next();
  if (isAuthed(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not logged in' });
  return res.redirect('/login.html');
}
