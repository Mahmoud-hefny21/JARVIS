use crate::{
    db::{Record, Result},
    NativeState,
};
use chrono::{Local, Timelike, Utc};
use serde_json::{json, Value};
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
fn make_record(kind: &str, title: &str, body: &str) -> Record {
    let now = Utc::now().to_rfc3339();
    Record {
        id: uuid::Uuid::new_v4().to_string(),
        kind: kind.into(),
        title: title.chars().take(240).collect(),
        body: body.chars().take(32000).collect(),
        created_at: now.clone(),
        updated_at: now,
        done: false,
        priority: "medium".into(),
        due_at: String::new(),
        recurrence: "none".into(),
        project_id: String::new(),
        role: String::new(),
        end_at: String::new(),
        all_day: false,
        notified_at: String::new(),
    }
}
pub(crate) fn is_quiet(prefs: &Value, hour: u32) -> bool {
    if prefs["dnd"] == true {
        return true;
    }
    let start = prefs["quietStart"].as_u64().unwrap_or(22) as u32;
    let end = prefs["quietEnd"].as_u64().unwrap_or(7) as u32;
    start != end
        && if start < end {
            hour >= start && hour < end
        } else {
            hour >= start || hour < end
        }
}
pub fn tick(app: &tauri::AppHandle) -> Result<()> {
    let state = app.state::<NativeState>();
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    let prefs = db.get_value("preferences")?;
    let now = Utc::now();
    let mut changed = false;
    let mut notifications = Vec::new();
    if prefs["backupEnabled"] != false {
        let last = db.get_value("lastBackup")?;
        let recent = last["at"]
            .as_str()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .is_some_and(|d| now.signed_duration_since(d).num_hours() < 24);
        let attempt = db.get_value("lastBackupAttempt")?;
        let recently_attempted = attempt
            .as_str()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .is_some_and(|d| now.signed_duration_since(d).num_minutes() < 60);
        if !recent && !recently_attempted {
            db.set_value("lastBackupAttempt", &json!(now.to_rfc3339()))?;
            match db.backup(prefs["backupKeep"].as_u64().unwrap_or(7) as usize) {
                Ok(_) => {}
                Err(error) => {
                    db.set_value("backupError", &json!(error))?;
                }
            }
        }
    }
    if !is_quiet(&prefs, Local::now().hour()) {
        let mut stmt=db.conn.prepare("SELECT payload FROM records WHERE kind IN ('task','event') AND json_extract(payload,'$.done')=0 AND json_extract(payload,'$.dueAt')<>'' AND json_extract(payload,'$.notifiedAt')=''").map_err(|e|e.to_string())?;
        let due: Vec<Record> = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok().and_then(|s| serde_json::from_str::<Record>(&s).ok()))
            .filter(|r| chrono::DateTime::parse_from_rfc3339(&r.due_at).is_ok_and(|d| d <= now))
            .collect();
        drop(stmt);
        for mut record in due {
            let mut notification = make_record(
                "notification",
                &record.title,
                &format!("Reminder due {}", record.due_at),
            );
            notification.project_id = record.id.clone();
            record.notified_at = now.to_rfc3339();
            record.updated_at = record.notified_at.clone();
            db.conn
                .execute_batch("BEGIN IMMEDIATE")
                .map_err(|e| e.to_string())?;
            let write = db.put(&record).and_then(|_| db.put(&notification));
            if let Err(error) = write {
                db.conn.execute_batch("ROLLBACK").ok();
                return Err(error);
            }
            db.conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            notifications.push(("JARVIS reminder".to_owned(), record.title));
            changed = true;
        }
        let day = Local::now().date_naive().to_string();
        if prefs["briefingEnabled"] == true
            && Local::now().hour() >= prefs["briefingHour"].as_u64().unwrap_or(8) as u32
            && db.get_value("lastBriefingDay")? != json!(day)
        {
            let records = db.list()?;
            let tasks: Vec<_> = records
                .iter()
                .filter(|r| r.kind == "task" && !r.done)
                .collect();
            let events: Vec<_> = records
                .iter()
                .filter(|r| {
                    r.kind == "event"
                        && chrono::DateTime::parse_from_rfc3339(&r.due_at).is_ok_and(|d| {
                            d.with_timezone(&Local).date_naive() == Local::now().date_naive()
                        })
                })
                .collect();
            let weather = db.get_value("weatherCache")?;
            let body=format!("Good morning, sir.\n\n{} pending tasks and {} appointments today.\n\n{}\n\n{}\n\n{}",tasks.len(),events.len(),tasks.iter().take(10).map(|r|format!("• {}",r.title)).collect::<Vec<_>>().join("\n"),events.iter().map(|r|format!("• {} — {}",r.due_at,r.title)).collect::<Vec<_>>().join("\n"),if weather.is_object(){format!("Cached weather: {}°C, {}. Updated {}.",weather["temperature"],weather["description"].as_str().unwrap_or("unknown"),weather["at"].as_str().unwrap_or("unknown"))}else{"Weather is not available.".into()});
            let mut message = make_record("message", "JARVIS", &body);
            message.role = "assistant".into();
            let notification = make_record(
                "notification",
                "Your daily briefing is ready",
                "Open AI Chat to read your local daily briefing.",
            );
            db.conn
                .execute_batch("BEGIN IMMEDIATE")
                .map_err(|e| e.to_string())?;
            let write = db
                .put(&message)
                .and_then(|_| db.put(&notification))
                .and_then(|_| db.set_value("lastBriefingDay", &json!(day)));
            if let Err(error) = write {
                db.conn.execute_batch("ROLLBACK").ok();
                return Err(error);
            }
            db.conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            notifications.push((
                "Good morning, sir.".into(),
                "Your daily briefing is ready.".into(),
            ));
            changed = true;
        }
    }
    drop(db);
    crate::automation::tick(app);
    for (title, body) in notifications {
        let _ = app.notification().builder().title(title).body(body).show();
    }
    if changed {
        let _ = app.emit("records-changed", ());
    }
    Ok(())
}
pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(15));
        if let Err(error) = tick(&app) {
            if let Some(state) = app.try_state::<NativeState>() {
                if let Ok(db) = state.db.lock() {
                    let _ = db.set_value("schedulerError", &json!(error));
                }
            }
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quiet_hours_cross_midnight() {
        let p = json!({"quietStart":22,"quietEnd":7});
        assert!(is_quiet(&p, 23));
        assert!(is_quiet(&p, 5));
        assert!(!is_quiet(&p, 12));
        assert!(!is_quiet(&json!({"quietStart":7,"quietEnd":7}), 8));
    }
}
