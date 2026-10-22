export const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS line_links (
  id              INTEGER PRIMARY KEY,
  event_id        TEXT UNIQUE,
  line_message_id TEXT,
  received_at     TEXT NOT NULL,
  received_date   TEXT NOT NULL,
  group_alias     TEXT NOT NULL,
  url             TEXT NOT NULL,
  canonical_url   TEXT NOT NULL,
  domain          TEXT NOT NULL,
  domain_type     TEXT NOT NULL CHECK (domain_type IN ('official','media','social','unknown')),
  fetchable       INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','used','skipped')),
  reason          TEXT,
  article_id      TEXT,
  UNIQUE (canonical_url, received_date)
);
CREATE INDEX IF NOT EXISTS ix_links_status ON line_links(status, received_at);
CREATE INDEX IF NOT EXISTS ix_links_msg ON line_links(line_message_id);

CREATE TABLE IF NOT EXISTS line_files (
  id               INTEGER PRIMARY KEY,
  event_id         TEXT UNIQUE,
  line_message_id  TEXT,
  received_at      TEXT NOT NULL,
  received_date    TEXT NOT NULL,
  group_alias      TEXT NOT NULL,
  message_type     TEXT NOT NULL CHECK (message_type IN ('file','image','video','audio')),
  file_name        TEXT,
  file_size        INTEGER,
  content_provider TEXT NOT NULL CHECK (content_provider IN ('line','external')),
  source_url       TEXT,
  stored_path      TEXT,
  status           TEXT NOT NULL CHECK (status IN ('saved','metadata_only','failed')),
  reason           TEXT
);
CREATE INDEX IF NOT EXISTS ix_files_date ON line_files(received_date, received_at);
CREATE INDEX IF NOT EXISTS ix_files_msg ON line_files(line_message_id);

CREATE TABLE IF NOT EXISTS run_status (
  task TEXT NOT NULL,
  run_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','complete','partial','failed')),
  counts_json TEXT,
  issues_json TEXT,
  started_at TEXT,
  finished_at TEXT,
  PRIMARY KEY (task, run_date)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS webhook_seen (
  event_id TEXT PRIMARY KEY,
  at TEXT NOT NULL
);
`;
