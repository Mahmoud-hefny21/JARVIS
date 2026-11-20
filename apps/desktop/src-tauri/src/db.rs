use chrono::Utc;
use rusqlite::{params, Connection, DatabaseName};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, String>;
pub struct Database {
    pub conn: Connection,
    pub dir: PathBuf,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerifiedSkill {
    pub id: String,
    pub title: String,
    pub trigger: String,
    pub steps: Vec<String>,
    pub sources: Vec<String>,
    pub verification: String,
    pub verified_at: String,
    pub created_at: String,
    pub updated_at: String,
}
impl VerifiedSkill {
    pub fn validate(&self) -> Result<()> {
        Uuid::parse_str(&self.id).map_err(|_| "Invalid skill ID")?;
        if !(3..=100).contains(&self.title.trim().chars().count())
            || !(3..=300).contains(&self.trigger.trim().chars().count())
            || self.steps.is_empty()
            || self.steps.len() > 12
            || self
                .steps
                .iter()
                .any(|s| s.trim().is_empty() || s.chars().count() > 300)
            || self.sources.len() > 8
            || self.verification.trim().chars().count() < 3
            || self.verification.chars().count() > 500
        {
            return Err("Verified skill is outside the storage limits".into());
        }
        for source in &self.sources {
            let url = url::Url::parse(source).map_err(|_| "Skill source must be an HTTPS URL")?;
            if url.scheme() != "https"
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || source.len() > 2048
            {
                return Err("Skill source must be a credential-free HTTPS URL".into());
            }
        }
        for value in [&self.verified_at, &self.created_at, &self.updated_at] {
            chrono::DateTime::parse_from_rfc3339(value).map_err(|_| "Invalid skill timestamp")?;
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
    pub done: bool,
    pub priority: String,
    pub due_at: String,
    pub recurrence: String,
    pub project_id: String,
    pub role: String,
    pub notified_at: String,
    #[serde(default)]
    pub end_at: String,
    #[serde(default)]
    pub all_day: bool,
}
impl Record {
    pub fn validate(&self) -> Result<()> {
        Uuid::parse_str(&self.id).map_err(|_| "Invalid record ID")?;
        if ![
            "task",
            "memory",
            "project",
            "event",
            "message",
            "activity",
            "notification",
            "draft",
        ]
        .contains(&self.kind.as_str())
        {
            return Err("Invalid record kind".into());
        }
        if self.title.trim().is_empty()
            || self.title.chars().count() > 240
            || self.body.len() > 128000
        {
            return Err("Record exceeds size limits".into());
        }
        if !["low", "medium", "high"].contains(&self.priority.as_str())
            || !["none", "daily", "weekly", "monthly"].contains(&self.recurrence.as_str())
            || !["", "user", "assistant"].contains(&self.role.as_str())
        {
            return Err("Invalid record values".into());
        }
        for value in [&self.created_at, &self.updated_at] {
            chrono::DateTime::parse_from_rfc3339(value).map_err(|_| "Invalid timestamp")?;
        }
        for value in [&self.due_at, &self.notified_at, &self.end_at] {
            if !value.is_empty() {
                chrono::DateTime::parse_from_rfc3339(value).map_err(|_| "Invalid date")?;
            }
        }
        if !self.project_id.is_empty() {
            Uuid::parse_str(&self.project_id).map_err(|_| "Invalid project ID")?;
        }
        Ok(())
    }
}
impl Database {
    pub fn open(dir: &Path) -> Result<Self> {
        fs::create_dir_all(dir).map_err(|_| "Cannot create application data folder")?;
        let conn =
            Connection::open(dir.join("jarvis.db")).map_err(|_| "Cannot open SQLite database")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;",
        )
        .map_err(|e| e.to_string())?;
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if version > 3 {
            return Err(
                "Database was created by a newer app. Upgrade JARVIS before opening it.".into(),
            );
        }
        if version == 0 {
            conn.execute_batch(include_str!("../../../../database/001_initial.sql"))
                .map_err(|e| e.to_string())?;
        }
        let db = Self {
            conn,
            dir: dir.to_owned(),
        };
        if version < 2 {
            if version == 1 {
                db.backup(30)?;
            }
            db.conn
                .execute_batch(include_str!("../../../../database/002_memory_search.sql"))
                .map_err(|_| "Cannot create memory search index")?;
        }
        if version < 3 {
            db.conn
                .execute_batch(include_str!("../../../../database/003_verified_skills.sql"))
                .map_err(|_| "Cannot create local skill memory")?;
        }
        Ok(db)
    }
    pub fn save_verified_skill(&self, skill: &VerifiedSkill) -> Result<()> {
        skill.validate()?;
        let exists: bool = self
            .conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM verified_skills WHERE id=?1)",
                [&skill.id],
                |r| r.get(0),
            )
            .map_err(|_| "Skill memory unavailable")?;
        let count: i64 = self
            .conn
            .query_row("SELECT count(*) FROM verified_skills", [], |r| r.get(0))
            .map_err(|_| "Skill memory unavailable")?;
        if !exists && count >= 50 {
            return Err("Local skill memory is full (50 entries)".into());
        }
        self.conn.execute("INSERT INTO verified_skills(id,title,trigger_text,procedure_json,sources_json,verification,verified_at,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET title=excluded.title,trigger_text=excluded.trigger_text,procedure_json=excluded.procedure_json,sources_json=excluded.sources_json,verification=excluded.verification,verified_at=excluded.verified_at,updated_at=excluded.updated_at", params![skill.id,skill.title.trim(),skill.trigger.trim(),serde_json::to_string(&skill.steps).map_err(|_| "Cannot encode skill")?,serde_json::to_string(&skill.sources).map_err(|_| "Cannot encode skill")?,skill.verification.trim(),skill.verified_at,skill.created_at,skill.updated_at]).map_err(|_| "Cannot save local skill")?;
        Ok(())
    }
    pub fn list_verified_skills(&self) -> Result<Vec<VerifiedSkill>> {
        let mut stmt=self.conn.prepare("SELECT id,title,trigger_text,procedure_json,sources_json,verification,verified_at,created_at,updated_at FROM verified_skills ORDER BY updated_at DESC LIMIT 50").map_err(|_| "Skill memory unavailable")?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, String>(7)?,
                    r.get::<_, String>(8)?,
                ))
            })
            .map_err(|_| "Cannot read local skills")?;
        rows.map(|row| {
            let (
                id,
                title,
                trigger,
                steps,
                sources,
                verification,
                verified_at,
                created_at,
                updated_at,
            ) = row.map_err(|_| "Cannot read local skill")?;
            let skill = VerifiedSkill {
                id,
                title,
                trigger,
                steps: serde_json::from_str(&steps).map_err(|_| "Invalid saved skill")?,
                sources: serde_json::from_str(&sources)
                    .map_err(|_| "Invalid saved skill sources")?,
                verification,
                verified_at,
                created_at,
                updated_at,
            };
            skill.validate()?;
            Ok(skill)
        })
        .collect()
    }
    pub fn list(&self) -> Result<Vec<Record>> {
        let mut query = self
            .conn
            .prepare("SELECT payload FROM records ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = query
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|r| {
            serde_json::from_str(&r.map_err(|e| e.to_string())?)
                .map_err(|_| "Corrupted record".into())
        })
        .collect()
    }
    pub fn page(&self, offset: u32, limit: u32) -> Result<Vec<Record>> {
        if limit == 0 || limit > 500 {
            return Err("Page size must be between 1 and 500".into());
        }
        let mut query = self
            .conn
            .prepare(
                "SELECT payload FROM records ORDER BY created_at DESC,id DESC LIMIT ?1 OFFSET ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = query
            .query_map(params![limit, offset], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|row| {
            serde_json::from_str(&row.map_err(|e| e.to_string())?)
                .map_err(|_| "Invalid stored record".into())
        })
        .collect()
    }
    pub fn put(&self, record: &Record) -> Result<()> {
        record.validate()?;
        let json = serde_json::to_string(record).map_err(|e| e.to_string())?;
        let changed = self.conn.execute("INSERT INTO records(id,kind,created_at,updated_at,payload) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload WHERE records.kind=excluded.kind", params![record.id, record.kind, record.created_at, record.updated_at, json]).map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("An existing record cannot change its kind".into());
        }
        Ok(())
    }
    pub fn search_memory(&self, query: &str) -> Result<Vec<Record>> {
        if query.trim().is_empty() || query.len() > 400 {
            return Err("Search must contain 1?400 bytes".into());
        }
        let terms: Vec<String> = query
            .split_whitespace()
            .take(12)
            .map(|w| format!("\"{}\"*", w.replace('"', "\"\"")))
            .collect();
        let expression = terms.join(" OR ");
        let mut stmt=self.conn.prepare("SELECT records.payload FROM memory_search JOIN records ON records.id=memory_search.id WHERE memory_search MATCH ?1 ORDER BY rank LIMIT 20").map_err(|_| "Memory search unavailable")?;
        let rows = stmt
            .query_map([expression], |r| r.get::<_, String>(0))
            .map_err(|_| "Cannot search memory")?;
        rows.map(|r| {
            serde_json::from_str(&r.map_err(|_| "Cannot read memory")?)
                .map_err(|_| "Invalid memory".into())
        })
        .collect()
    }
    pub fn get_value(&self, key: &str) -> Result<Value> {
        self.conn
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(|e| e.to_string())?
            .map(|v| serde_json::from_str(&v).map_err(|e| e.to_string()))
            .unwrap_or(Ok(Value::Null))
    }
    pub fn set_value(&self, key: &str, value: &Value) -> Result<()> {
        self.conn.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value.to_string()]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn integrity(&self) -> Result<String> {
        self.conn
            .query_row("PRAGMA quick_check", [], |r| r.get(0))
            .map_err(|e| e.to_string())
    }
    pub fn backup(&self, keep: usize) -> Result<String> {
        let folder = self.dir.join("backups");
        fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        let staging = folder.join(format!("{}.tmp", Uuid::new_v4()));
        self.conn
            .backup(DatabaseName::Main, &staging, None)
            .map_err(|e| e.to_string())?;
        let bytes = zeroize::Zeroizing::new(fs::read(&staging).map_err(|e| e.to_string())?);
        let protected = crate::windows::protect(&bytes);
        let _ = fs::remove_file(&staging);
        let protected = protected?;
        let file = folder.join(format!(
            "jarvis-{}.jbackup",
            Utc::now().format("%Y%m%d-%H%M%S-%f")
        ));
        fs::write(&file, protected).map_err(|e| e.to_string())?;
        let mut backups: Vec<_> = fs::read_dir(&folder)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|e| e == "jbackup"))
            .collect();
        backups.sort();
        let remove_count = backups.len().saturating_sub(keep.clamp(1, 30));
        for path in backups.into_iter().take(remove_count) {
            fs::remove_file(path).map_err(|_| "Backup saved, but rotation failed")?;
        }
        self.set_value("lastBackup", &serde_json::json!({"at": Utc::now().to_rfc3339(), "file": file.file_name().unwrap().to_string_lossy()}))?;
        self.set_value("backupError", &Value::Null)?;
        Ok(file.file_name().unwrap().to_string_lossy().into())
    }
    pub fn restore(&mut self, path: &Path) -> Result<()> {
        if fs::metadata(path).map_err(|_| "Backup unavailable")?.len() > 100 * 1024 * 1024 {
            return Err("Backup exceeds 100 MB limit".into());
        }
        let bytes = zeroize::Zeroizing::new(crate::windows::unprotect(
            &fs::read(path).map_err(|_| "Cannot read backup")?,
        )?);
        let staging = self.dir.join(format!("restore-{}.tmp", Uuid::new_v4()));
        fs::write(&staging, &bytes).map_err(|e| e.to_string())?;
        let result = (|| {
            let check =
                Connection::open_with_flags(&staging, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .map_err(|_| "Not a SQLite backup")?;
            let integrity: String = check
                .query_row("PRAGMA integrity_check", [], |r| r.get(0))
                .map_err(|_| "Invalid backup")?;
            let version: i64 = check
                .pragma_query_value(None, "user_version", |r| r.get(0))
                .map_err(|_| "Invalid schema")?;
            if integrity != "ok" || !(1..=3).contains(&version) {
                return Err("Backup validation failed or schema is incompatible".into());
            }
            let preferences: Option<String> = check
                .query_row(
                    "SELECT value FROM settings WHERE key='preferences'",
                    [],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|_| "Backup settings schema is invalid")?;
            if let Some(preferences) = preferences {
                let value: Value =
                    serde_json::from_str(&preferences).map_err(|_| "Invalid backup preferences")?;
                crate::integrations::validate_settings(&value)?;
            }
            for table in ["credentials", "project_grants"] {
                let present: bool = check
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                        [table],
                        |r| r.get(0),
                    )
                    .map_err(|_| "Invalid backup schema")?;
                if !present {
                    return Err("Backup is missing required native tables".into());
                }
            }
            let mut stmt = check
                .prepare("SELECT payload FROM records")
                .map_err(|_| "Backup schema missing")?;
            for row in stmt
                .query_map([], |r| r.get::<_, String>(0))
                .map_err(|_| "Cannot read backup")?
            {
                let record: Record = serde_json::from_str(&row.map_err(|_| "Invalid record")?)
                    .map_err(|_| "Invalid record")?;
                record.validate()?;
            }
            self.backup(30)?; // Preserve the complete pre-restore state before replacement.
            self.conn
                .restore(
                    DatabaseName::Main,
                    &staging,
                    None::<fn(rusqlite::backup::Progress)>,
                )
                .map_err(|e| e.to_string())?;
            if version == 1 {
                self.conn
                    .execute_batch(include_str!("../../../../database/002_memory_search.sql"))
                    .map_err(|_| "Cannot rebuild memory index after restore")?;
            }
            if version < 3 {
                self.conn
                    .execute_batch(include_str!("../../../../database/003_verified_skills.sql"))
                    .map_err(|_| "Cannot initialize local skill memory after restore")?;
            }
            Ok(())
        })();
        let _ = fs::remove_file(&staging);
        result
    }
}
use rusqlite::OptionalExtension;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn memory_migration_rollback_reapply_preserves_rows_and_search_tracks_edits() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../../../database/001_initial.sql"))
            .unwrap();
        let now = Utc::now().to_rfc3339();
        let mut record = Record {
            id: Uuid::new_v4().to_string(),
            kind: "memory".into(),
            title: "بحب TypeScript".into(),
            body: "SQLite offline assistant".into(),
            created_at: now.clone(),
            updated_at: now,
            done: false,
            priority: "medium".into(),
            due_at: "".into(),
            recurrence: "none".into(),
            project_id: "".into(),
            role: "".into(),
            end_at: String::new(),
            all_day: false,
            notified_at: "".into(),
        };
        let db = Database {
            conn,
            dir: PathBuf::new(),
        };
        db.put(&record).unwrap();
        db.conn
            .execute_batch(include_str!("../../../../database/002_memory_search.sql"))
            .unwrap();
        assert_eq!(db.search_memory("بحب").unwrap().len(), 1);
        assert_eq!(db.search_memory("TypeScr").unwrap().len(), 1);
        assert!(db.search_memory("\" OR *").unwrap().is_empty());
        db.conn
            .execute_batch(include_str!(
                "../../../../database/002_memory_search.down.sql"
            ))
            .unwrap();
        assert_eq!(db.list().unwrap().len(), 1);
        db.conn
            .execute_batch(include_str!("../../../../database/002_memory_search.sql"))
            .unwrap();
        record.body = "replacement searchable".into();
        db.put(&record).unwrap();
        assert!(db.search_memory("SQLite").unwrap().is_empty());
        assert_eq!(db.search_memory("replacement").unwrap().len(), 1);
        db.conn
            .execute("DELETE FROM records WHERE id=?1", [record.id])
            .unwrap();
        assert!(db.search_memory("replacement").unwrap().is_empty());
    }
    #[test]
    fn verified_skill_migration_rolls_back_and_reapplies_on_synthetic_database() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../../../database/001_initial.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../../../../database/002_memory_search.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../../../../database/003_verified_skills.sql"))
            .unwrap();
        assert_eq!(
            conn.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            3
        );
        assert!(conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='verified_skills')",[],|r|r.get::<_,bool>(0)).unwrap());
        conn.execute_batch(include_str!(
            "../../../../database/003_verified_skills.down.sql"
        ))
        .unwrap();
        assert_eq!(
            conn.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert!(!conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='verified_skills')",[],|r|r.get::<_,bool>(0)).unwrap());
        conn.execute_batch(include_str!("../../../../database/003_verified_skills.sql"))
            .unwrap();
        assert_eq!(
            conn.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            3
        );
    }
    #[test]
    fn verified_skill_storage_validates_sources_steps_and_round_trips() {
        let dir = std::env::temp_dir().join(format!("jarvis-skill-test-{}", Uuid::new_v4()));
        let db = Database::open(&dir).unwrap();
        let now = Utc::now().to_rfc3339();
        let mut skill = VerifiedSkill {
            id: Uuid::new_v4().to_string(),
            title: "Check official docs".into(),
            trigger: "When asked to verify a library feature".into(),
            steps: vec!["Search primary docs".into(), "Open cited source".into()],
            sources: vec!["https://example.com/docs".into()],
            verification: "Confirmed against the official API reference".into(),
            verified_at: now.clone(),
            created_at: now.clone(),
            updated_at: now,
        };
        skill.validate().unwrap();
        db.save_verified_skill(&skill).unwrap();
        assert_eq!(db.list_verified_skills().unwrap(), vec![skill.clone()]);
        skill.sources = vec!["http://example.com".into()];
        assert!(skill.validate().is_err());
        skill.sources.clear();
        skill.steps = vec!["".into()];
        assert!(skill.validate().is_err());
        drop(db);
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    #[ignore = "Explicit benchmark command only"]
    fn database_benchmark() {
        let root = std::env::temp_dir().join(format!("jarvis-benchmark-{}", Uuid::new_v4()));
        {
            let db = Database::open(&root).unwrap();
            let now = Utc::now().to_rfc3339();
            let start = std::time::Instant::now();
            db.conn.execute_batch("BEGIN IMMEDIATE").unwrap();
            for i in 0..1000 {
                db.put(&Record {
                    id: Uuid::new_v4().to_string(),
                    kind: "memory".into(),
                    title: format!("Synthetic benchmark {i}"),
                    body: "Compact synthetic record".into(),
                    created_at: now.clone(),
                    updated_at: now.clone(),
                    done: false,
                    priority: "medium".into(),
                    due_at: String::new(),
                    recurrence: "none".into(),
                    project_id: String::new(),
                    role: String::new(),
                    end_at: String::new(),
                    all_day: false,
                    notified_at: String::new(),
                })
                .unwrap();
            }
            db.conn.execute_batch("COMMIT").unwrap();
            let write_ms = start.elapsed().as_secs_f64() * 1000.;
            let start = std::time::Instant::now();
            let rows = db.page(0, 500).unwrap();
            assert_eq!(rows.len(), 500);
            let read_ms = start.elapsed().as_secs_f64() * 1000.;
            db.conn
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
                .unwrap();
            println!(
                "DATABASE_BENCHMARK {}",
                serde_json::json!({"profile":"debug","syntheticRecords":1000,"transactionInsert1000Ms":write_ms,"readAndDeserializePage500Ms":read_ms,"databaseFileBytesAfterCheckpoint":std::fs::metadata(root.join("jarvis.db")).unwrap().len()})
            );
        }
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn migration_and_persistence() {
        let root = std::env::temp_dir().join(format!("jarvis-test-{}", Uuid::new_v4()));
        {
            let db = Database::open(&root).unwrap();
            assert_eq!(db.integrity().unwrap(), "ok");
            db.set_value("test", &serde_json::json!({"ok":true}))
                .unwrap();
        }
        {
            let db = Database::open(&root).unwrap();
            assert_eq!(db.get_value("test").unwrap()["ok"], true);
        }
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn backup_restore_validates_and_preserves_data() {
        let root = std::env::temp_dir().join(format!("jarvis-test-{}", Uuid::new_v4()));
        {
            let mut db = Database::open(&root).unwrap();
            db.set_value("test", &serde_json::json!("before")).unwrap();
            let name = db.backup(7).unwrap();
            db.set_value("test", &serde_json::json!("after")).unwrap();
            db.restore(&root.join("backups").join(name)).unwrap();
            assert_eq!(db.get_value("test").unwrap(), "before");
            assert_eq!(db.integrity().unwrap(), "ok");
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
