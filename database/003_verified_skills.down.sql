-- This rollback permanently deletes saved skill notes. Export/backup first if they contain wanted data.
BEGIN IMMEDIATE;
DROP TABLE verified_skills;
PRAGMA user_version=2;
COMMIT;
