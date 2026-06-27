-- Cloudflare D1 schema for Mechanic Simulator.
CREATE TABLE IF NOT EXISTS vehicles (
  id         TEXT PRIMARY KEY,
  status     TEXT DEFAULT 'owned',
  owner      TEXT DEFAULT 'Me',
  year       TEXT,
  make       TEXT,
  model      TEXT,
  trim       TEXT,
  vin        TEXT,
  mileage    TEXT,
  color      TEXT,
  notes      TEXT,
  photos     TEXT DEFAULT '[]',   -- JSON array of /uploads/... paths
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS issues (
  id         TEXT PRIMARY KEY,
  vehicle_id TEXT,
  symptom    TEXT,
  result     TEXT,                -- JSON
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
