export const SCHEMA_VERSION = 1;

export const SCHEMA_V1 = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  parent_run_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  command TEXT,
  cwd TEXT,
  git_sha TEXT,
  node_version TEXT,
  platform TEXT,
  config_json TEXT,
  env_json TEXT,
  seed INTEGER,
  metrics_json TEXT
);

CREATE TABLE events (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  span_id TEXT,
  parent_span_id TEXT,
  ts REAL NOT NULL,
  duration_ms REAL,
  callsite TEXT,
  request_hash TEXT,
  response_hash TEXT,
  payload BLOB,
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE fixtures (
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  fixture_key TEXT NOT NULL,
  occurrence INTEGER NOT NULL,
  callsite TEXT,
  request_json TEXT,
  response_blob BLOB,
  meta_json TEXT,
  PRIMARY KEY (run_id, kind, fixture_key, occurrence)
);

CREATE TABLE blobs (
  hash TEXT PRIMARY KEY,
  content BLOB NOT NULL,
  encoding TEXT NOT NULL
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  base_run_id TEXT NOT NULL,
  variant_run_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  format TEXT NOT NULL,
  content TEXT NOT NULL,
  summary_json TEXT
);

CREATE INDEX idx_events_run_seq ON events(run_id, seq);
CREATE INDEX idx_fixtures_lookup ON fixtures(run_id, kind, fixture_key);
CREATE INDEX idx_runs_created_at ON runs(created_at);
`;

export const REQUIRED_TABLES = ["meta", "runs", "events", "fixtures", "blobs", "reports"] as const;

export const MIGRATIONS: Readonly<Record<number, string>> = {};
