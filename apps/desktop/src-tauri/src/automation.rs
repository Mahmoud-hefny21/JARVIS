use crate::{
    db::{Database, Result},
    NativeState,
};
use chrono::{Local, Timelike};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{Emitter, Manager};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rule {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub hour: u32,
    pub enabled: bool,
}
impl Rule {
    pub fn validate(&self) -> Result<()> {
        uuid::Uuid::parse_str(&self.id).map_err(|_| "Invalid automation ID")?;
        if self.title.trim().is_empty()
            || self.title.chars().count() > 100
            || self.hour > 23
            || !["status", "security", "briefing"].contains(&self.kind.as_str())
        {
            return Err(
                "Automations support only scheduled read-only status, security or briefing reports"
                    .into(),
            );
        }
        Ok(())
    }
}
pub fn rules(db: &Database) -> Result<Vec<Rule>> {
    let value = db.get_value("automations")?;
    if value.is_null() {
        Ok(Vec::new())
    } else {
        serde_json::from_value(value).map_err(|_| "Invalid saved automations".into())
    }
}
pub fn save(db: &Database, rule: Rule) -> Result<()> {
    rule.validate()?;
    let mut rows = rules(db)?;
    rows.retain(|r| r.id != rule.id);
    if rows.len() >= 8 {
        return Err("Up to 8 lightweight automations are supported".into());
    }
    rows.push(rule);
    db.set_value("automations", &json!(rows))
}
pub fn delete(db: &Database, id: &str) -> Result<()> {
    uuid::Uuid::parse_str(id).map_err(|_| "Invalid automation ID")?;
    let mut rows = rules(db)?;
    rows.retain(|r| r.id != id);
    db.set_value("automations", &json!(rows))
}
pub fn tick(app: &tauri::AppHandle) {
    let state = app.state::<NativeState>();
    if state
        .automation_busy
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        return;
    }
    let selected = (|| -> Result<Option<Rule>> {
        let db = state.db.lock().map_err(|_| "Database unavailable")?;
        let now = Local::now();
        let day = now.date_naive().to_string();
        let mut last = db.get_value("automationRuns")?;
        if !last.is_object() {
            last = json!({});
        }
        let prefs = db.get_value("preferences")?;
        if crate::runtime::is_quiet(&prefs, now.hour()) {
            return Ok(None);
        }
        for rule in rules(&db)? {
            rule.validate()?;
            if rule.enabled && now.hour() >= rule.hour && last[&rule.id] != day {
                last[&rule.id] = json!(day);
                db.set_value("automationRuns", &last)?;
                return Ok(Some(rule));
            }
        }
        Ok(None)
    })();
    let Ok(Some(rule)) = selected else {
        state
            .automation_busy
            .store(false, std::sync::atomic::Ordering::SeqCst);
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        let body = if rule.kind == "security" {
            format!("Read-only Windows protection report: {}. Recommendations: keep supported Windows updates current, review disabled protections in Windows Security, and keep encrypted backups. No setting was changed.",crate::windows::security())
        } else if rule.kind == "status" {
            let mut system = sysinfo::System::new();
            system.refresh_memory();
            format!(
                "RAM used: {} MiB of {} MiB. Battery: {:?}. No Windows setting was changed.",
                system.used_memory() / 1_048_576,
                system.total_memory() / 1_048_576,
                crate::windows::battery().0
            )
        } else {
            let count = app
                .state::<NativeState>()
                .db
                .lock()
                .ok()
                .and_then(|db| db.list().ok())
                .map(|rs| rs.iter().filter(|r| r.kind == "task" && !r.done).count())
                .unwrap_or(0);
            format!("Daily read-only briefing: {count} pending tasks. Open Tasks and Calendar to review your local records.")
        };
        let state = app.state::<NativeState>();
        if let Ok(db) = state.db.lock() {
            if !rules(&db)
                .unwrap_or_default()
                .iter()
                .any(|r| r.id == rule.id && r.enabled)
            {
                state
                    .automation_busy
                    .store(false, std::sync::atomic::Ordering::SeqCst);
                return;
            }
            let now = chrono::Utc::now().to_rfc3339();
            let r = crate::db::Record {
                id: uuid::Uuid::new_v4().to_string(),
                kind: "notification".into(),
                title: rule.title,
                body: body.chars().take(32000).collect(),
                created_at: now.clone(),
                updated_at: now,
                done: false,
                priority: "medium".into(),
                due_at: "".into(),
                recurrence: "none".into(),
                project_id: rule.id,
                role: "".into(),
                end_at: String::new(),
                all_day: false,
                notified_at: "".into(),
            };
            let _ = db.put(&r);
        }
        state
            .automation_busy
            .store(false, std::sync::atomic::Ordering::SeqCst);
        let _ = app.emit("records-changed", ());
    });
}
pub fn diagnostics(db: &Database) -> Result<Value> {
    let grants: i64 = db
        .conn
        .query_row("SELECT count(*) FROM project_grants", [], |r| r.get(0))
        .map_err(|_| "Cannot inspect grants")?;
    let schema: i64 = db
        .conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|_| "Cannot read schema")?;
    let history = db.get_value("actionHistory")?;
    Ok(
        json!({"integrity":db.integrity()?,"schemaVersion":schema,"approvedFolderCount":grants,"schedulerError":db.get_value("schedulerError")?,"backupError":db.get_value("backupError")?,"lastBackup":db.get_value("lastBackup")?["at"],"readOnlyByDefault":true,"pendingApprovalsSurviveRestart":false,"interruptedActions":history.as_array().map(|a|a.iter().filter(|r|r["status"].as_str().is_some_and(|s|s.starts_with("interrupted"))).count()).unwrap_or(0),"automationCount":rules(db)?.len(),"networkNeededForLocalRecords":false}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_read_only_automations_are_accepted() {
        let mut r = Rule {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Synthetic report".into(),
            kind: "status".into(),
            hour: 8,
            enabled: true,
        };
        assert!(r.validate().is_ok());
        for kind in ["shell", "gmail_send", "shutdown", "project_write"] {
            r.kind = kind.into();
            assert!(r.validate().is_err());
        }
        r.kind = "security".into();
        r.hour = 24;
        assert!(r.validate().is_err());
    }
}
