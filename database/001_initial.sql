BEGIN IMMEDIATE;
CREATE TABLE records (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('task','memory','project','event','message','activity','notification','draft')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE INDEX records_kind_created ON records(kind, created_at DESC);
CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE credentials (name TEXT PRIMARY KEY NOT NULL, protected BLOB NOT NULL);
CREATE TABLE project_grants (id TEXT PRIMARY KEY NOT NULL, path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
PRAGMA user_version=1;
COMMIT;
