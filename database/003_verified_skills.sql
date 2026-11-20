-- Locally saved, user-verified workflow notes. These are not executable macros.
BEGIN IMMEDIATE;
CREATE TABLE verified_skills (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 100),
  trigger_text TEXT NOT NULL CHECK(length(trigger_text) BETWEEN 3 AND 300),
  procedure_json TEXT NOT NULL CHECK(json_valid(procedure_json)),
  sources_json TEXT NOT NULL CHECK(json_valid(sources_json)),
  verification TEXT NOT NULL CHECK(length(verification) BETWEEN 3 AND 500),
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX verified_skills_updated ON verified_skills(updated_at DESC);
PRAGMA user_version=3;
COMMIT;
