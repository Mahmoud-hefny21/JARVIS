-- Derived index only. Original records and preferences are preserved.
BEGIN IMMEDIATE;
CREATE VIRTUAL TABLE memory_search USING fts5(id UNINDEXED,title,body,tokenize='unicode61 remove_diacritics 2');
INSERT INTO memory_search SELECT id,json_extract(payload,'$.title'),json_extract(payload,'$.body') FROM records WHERE kind='memory';
CREATE TRIGGER memory_search_insert AFTER INSERT ON records WHEN new.kind='memory' BEGIN
 INSERT INTO memory_search VALUES(new.id,json_extract(new.payload,'$.title'),json_extract(new.payload,'$.body'));
END;
CREATE TRIGGER memory_search_delete AFTER DELETE ON records WHEN old.kind='memory' BEGIN
 DELETE FROM memory_search WHERE id=old.id;
END;
CREATE TRIGGER memory_search_update AFTER UPDATE ON records WHEN new.kind='memory' BEGIN
 DELETE FROM memory_search WHERE id=old.id;
 INSERT INTO memory_search VALUES(new.id,json_extract(new.payload,'$.title'),json_extract(new.payload,'$.body'));
END;
PRAGMA user_version=2;
COMMIT;
