-- Whitelist applications with manual team review (replaces the SIWE raffle entries; old tables stay unused).
ALTER TABLE runs ADD COLUMN signals TEXT;
CREATE INDEX runs_ip ON runs(ip_hash);
CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
  address TEXT NOT NULL UNIQUE,
  x_handle TEXT NOT NULL UNIQUE,
  post_url TEXT NOT NULL,
  post_id TEXT NOT NULL UNIQUE,
  x_status TEXT NOT NULL CHECK (x_status IN ('verified','unchecked','failed')),
  x_detail TEXT,
  created_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT,
  reviewed_at INTEGER,
  chain TEXT,
  chain_checked_at INTEGER
);
CREATE INDEX applications_status ON applications(status, created_at);
CREATE INDEX applications_ip ON applications(ip_hash);
