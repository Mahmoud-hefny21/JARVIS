-- Removes only the rebuildable derived index; no user records are removed.
BEGIN IMMEDIATE;
DROP TRIGGER memory_search_insert;
DROP TRIGGER memory_search_delete;
DROP TRIGGER memory_search_update;
DROP TABLE memory_search;
PRAGMA user_version=1;
COMMIT;
