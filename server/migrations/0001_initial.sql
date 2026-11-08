CREATE TABLE telemetry (
  at INTEGER PRIMARY KEY,
  valid_until INTEGER NOT NULL,
  rpm_milli INTEGER,
  installation_id TEXT,
  height TEXT
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  sim_version TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1)),
  ip_hash TEXT NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id),
  score INTEGER NOT NULL,
  distance REAL NOT NULL,
  end_tick INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  eligible INTEGER NOT NULL CHECK (eligible IN (0,1)),
  token_hash TEXT NOT NULL UNIQUE,
  token_expires INTEGER NOT NULL
);
CREATE INDEX runs_score ON runs(score);
CREATE TABLE nonces (
  nonce TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL
);
CREATE INDEX nonces_expiry ON nonces(expires_at);
CREATE TABLE entries (
  address TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
  nonce TEXT NOT NULL UNIQUE REFERENCES nonces(nonce),
  created_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
