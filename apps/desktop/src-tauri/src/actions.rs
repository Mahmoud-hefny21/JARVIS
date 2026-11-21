use crate::{
    authorization::ACTIONS,
    db::{Record, Result},
    NativeState,
};
use serde_json::{json, Value};
use tauri::Manager;

pub fn text(args: &Value, key: &str) -> Result<String> {
    args[key]
        .as_str()
        .map(str::to_owned)
        .ok_or(format!("Missing {key}"))
}
fn snapshot(app: &tauri::AppHandle, action: &str, args: &Value) -> Result<String> {
    if action == "project_copy" {
        let root = crate::grant_path(app, &text(args, "id")?)?;
        let source = crate::projects::read(&root, &text(args, "source")?)?;
        crate::projects::copy_destination(&root, &text(args, "destination")?)?;
        return Ok(
            json!({"sourceHash":crate::projects::content_hash(&source),"root":root}).to_string(),
        );
    }
    let state = app.state::<NativeState>();
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    let (sql, key) = match action {
        "record_put" => (
            "SELECT payload FROM records WHERE id=?1",
            args["record"]["id"].as_str().unwrap_or(""),
        ),
        "record_delete" | "google_event_save" => (
            "SELECT payload FROM records WHERE id=?1",
            args["id"].as_str().unwrap_or(""),
        ),
        "settings_save" => ("SELECT value FROM settings WHERE key=?1", "preferences"),
        "project_revoke" | "open_project" | "project_write" => (
            "SELECT path FROM project_grants WHERE id=?1",
            args["id"].as_str().unwrap_or(""),
        ),
        _ => return Ok(String::new()),
    };
    use rusqlite::OptionalExtension;
    db.conn
        .query_row(sql, [key], |r| r.get::<_, String>(0))
        .optional()
        .map(|v| v.unwrap_or_default())
        .map_err(|_| "Cannot inspect action resource".into())
}
fn validate(action: &str, args: &Value) -> Result<String> {
    let keys: &[&str] = match action {
        "automation_save" => &["rule"],
        "automation_delete" => &["id"],
        "record_put" => &["record", "expectedUpdatedAt"],
        "record_delete" => &["id", "expectedUpdatedAt"],
        "settings_save" => &["settings"],
        "system_action" => &["action"],
        "app_window_control" => &["application", "operation", "monitorKey"],
        "installed_app_open" => &["appId", "name"],
        "open_website" => &["url"],
        "browser_page_read" => &[],
        "browser_page_scroll" => &["direction"],
        "browser_link_activate" => &["label"],
        "browser_control" => &["kind", "label", "value"],
        "skill_save" => &["skill"],
        "project_revoke" | "open_project" | "google_event_save" => &["id"],
        "credential_set" => &["name", "value"],
        "gmail_send" => &["to", "subject", "body"],
        "project_write" => &["id", "path", "expectedHash", "content"],
        "project_copy" => &["id", "source", "destination"],
        "google_disconnect" | "backup_create" | "codex_disconnect" | "speech_install" => &[],
        _ => return Err("Unsupported action".into()),
    };
    let object = args.as_object().ok_or("Invalid action arguments")?;
    if object.keys().any(|k| !keys.contains(&k.as_str())) {
        return Err("Unknown action argument".into());
    }
    if action == "browser_page_scroll"
        && ![Some("up"), Some("down")].contains(&args["direction"].as_str())
    {
        return Err("Invalid browser scroll direction".into());
    }
    if action == "browser_link_activate"
        && (text(args, "label")?.trim().is_empty()
            || text(args, "label")?.chars().count() > 160
            || text(args, "label")?.chars().any(char::is_control))
    {
        return Err("Invalid exact browser link label".into());
    }
    if action == "browser_control" {
        let kind = text(args, "kind")?;
        let label = text(args, "label")?;
        if !["button", "fill"].contains(&kind.as_str())
            || label.trim().is_empty()
            || label.chars().count() > 120
            || label.chars().any(char::is_control)
        {
            return Err("Invalid exact browser control".into());
        }
        if kind == "button" && !args["value"].is_null() {
            return Err("Button activation does not accept a value".into());
        }
        if kind == "fill"
            && args["value"].as_str().is_none_or(|value| {
                value.chars().count() > 2000 || value.chars().any(char::is_control)
            })
        {
            return Err("Browser field value is invalid or too long".into());
        }
    }
    if action == "open_website" {
        let value = text(args, "url")?;
        let url = url::Url::parse(&value).map_err(|_| "Invalid website URL")?;
        if value.len() > 2048
            || !["http", "https"].contains(&url.scheme())
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("Use an HTTP(S) website without embedded credentials".into());
        }
    }
    if action == "automation_save" {
        serde_json::from_value::<crate::automation::Rule>(args["rule"].clone())
            .map_err(|_| "Invalid automation")?
            .validate()?;
    }
    if action == "record_put" {
        serde_json::from_value::<Record>(args["record"].clone())
            .map_err(|_| "Invalid record")?
            .validate()?;
    }
    if action == "skill_save" {
        serde_json::from_value::<crate::db::VerifiedSkill>(args["skill"].clone())
            .map_err(|_| "Invalid verified skill note")?
            .validate()?;
    }
    if action == "settings_save" {
        crate::integrations::validate_settings(&args["settings"])?;
    }
    if action == "app_window_control" {
        let application = text(args, "application")?;
        let operation = text(args, "operation")?;
        if !["chrome", "vscode"].contains(&application.as_str())
            || !["open", "focus", "move", "minimize", "restore"].contains(&operation.as_str())
            || (!args["monitorKey"].is_null()
                && args["monitorKey"].as_str().is_none_or(|s| s.len() > 32))
        {
            return Err("Unsupported application window action".into());
        }
    }
    if action == "installed_app_open"
        && (text(args, "appId")?.len() > 512
            || text(args, "name")?.trim().is_empty()
            || text(args, "name")?.chars().count() > 120)
    {
        return Err("Invalid Windows app selection".into());
    }
    if action == "credential_set" {
        let name = text(args, "name")?;
        if !["ai", "google_client"].contains(&name.as_str()) || text(args, "value")?.len() > 16_000
        {
            return Err("Invalid credential".into());
        }
        return Ok(format!("Store or replace the {name} credential in Windows-protected storage. Its value is hidden. Approval expires in 3 minutes and is single-use."));
    }
    if action == "project_write"
        && (text(args, "content")?.len() > 24_000 || text(args, "expectedHash")?.len() != 64)
    {
        return Err("Edit exceeds review limits".into());
    }
    if action == "speech_install" {
        return Ok("Download optional offline speech: whisper.cpp b5454 Windows x64 CPU runtime (8,928,640 bytes) and multilingual base-q5_1 model (59,707,625 bytes), about 65.5 MiB total. Sources: github.com/ggml-org/whisper.cpp and huggingface.co/ggerganov/whisper.cpp. Fixed SHA-256 checks are required before installation. Files stay in this Windows app profile. No microphone recording, personal-data upload, API key or paid service is involved. Model loads only for recognition. Proceed?".into());
    }
    if args.to_string().len() > 40_000 {
        return Err("Plan is too large to review safely".into());
    }
    Ok(crate::action_policy::description(action, args))
}
fn resources(app: &tauri::AppHandle, action: &str, args: &Value) -> Result<()> {
    if action == "installed_app_open"
        && !crate::windows::installed_apps()?
            .iter()
            .any(|item| item["appId"] == args["appId"] && item["name"] == args["name"])
    {
        return Err("The selected app changed or is no longer installed".into());
    }
    if ["open_project", "project_write", "project_copy"].contains(&action) {
        crate::grant_path(app, &text(args, "id")?)?;
    }
    if action == "record_put" && args["record"]["kind"] != "notification" {
        // Notification projectId links its source task, not a project grant.
        if let Some(id) = args["record"]["projectId"]
            .as_str()
            .filter(|id| !id.is_empty())
        {
            crate::grant_path(app, id)?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn user_task_begin(
    window: tauri::WebviewWindow,
    scopes: Vec<crate::authorization::Scope>,
) -> Result<Value> {
    let url = window
        .url()
        .map_err(|_| "Trusted local window unavailable")?;
    let local = (url.host_str() == Some("tauri.localhost")
        && ["http", "https"].contains(&url.scheme()))
        || (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (cfg!(debug_assertions)
            && url.host_str() == Some("127.0.0.1")
            && url.port() == Some(1420));
    // Spoken requests come from the native microphone, so they count as the user's own input even when
    // another app (or another monitor) has focus; typed requests still need the focused window.
    if window.label() != "main" || !local || !(window.is_focused().unwrap_or(false) || crate::offline_speech::heard_recently()) {
        return Err("Direct tasks require the focused trusted Windows user interface".into());
    }
    let state = window.state::<NativeState>();
    let id = state
        .approvals
        .lock()
        .map_err(|_| "Approval broker unavailable")?
        .begin_task(scopes)?;
    Ok(json!({"id":id,"expiresInSeconds":180,"maximumSteps":32}))
}
#[tauri::command]
pub fn user_task_cancel(state: tauri::State<NativeState>, id: String) -> Result<()> {
    state
        .approvals
        .lock()
        .map_err(|_| "Approval broker unavailable")?
        .cancel_task(&id);
    Ok(())
}
#[tauri::command]
pub fn action_prepare(
    app: tauri::AppHandle,
    action: String,
    args: Value,
    task_id: Option<String>,
) -> Result<Value> {
    if !ACTIONS.contains(&action.as_str()) {
        return Err("Action is not allowlisted".into());
    }
    let mut summary = validate(&action, &args)?;
    resources(&app, &action, &args)?;
    if action == "project_write" {
        let old = crate::projects::read(
            &crate::grant_path(&app, &text(&args, "id")?)?,
            &text(&args, "path")?,
        )?;
        if crate::projects::content_hash(&old) != text(&args, "expectedHash")? {
            return Err("Source changed; reload before reviewing".into());
        }
        if old.len() > 24_000 {
            return Err("Source exceeds edit review limit".into());
        }
        summary = format!(
            "{summary}\n\nCurrent content:\n{old}\n\nProposed replacement:\n{}",
            text(&args, "content")?
        );
    }
    let before = snapshot(&app, &action, &args)?;
    if action == "record_delete" {
        let record: Record =
            serde_json::from_str(&before).map_err(|_| "The selected record no longer exists")?;
        summary.push_str(&format!("\n\nSelected {}: {}", record.kind, record.title));
    }
    if action == "google_event_save" {
        let event: Record = serde_json::from_str(&before)
            .map_err(|_| "The selected appointment no longer exists")?;
        summary.push_str(&format!(
            "\n\nAppointment: {}\nStarts: {}\nEnds: {}\n\n{}",
            event.title, event.due_at, event.end_at, event.body
        ));
    }
    if ["record_put", "record_delete"].contains(&action.as_str()) && !before.is_empty() {
        let old: Record = serde_json::from_str(&before).map_err(|_| "Invalid existing record")?;
        if args["expectedUpdatedAt"].as_str() != Some(old.updated_at.as_str()) {
            return Err("Record changed; reload before reviewing this action".into());
        }
    }
    let direct = task_id
        .as_ref()
        .zip(crate::action_policy::routine(&action, &args, &before));
    let state = app.state::<NativeState>();
    let mut broker = state
        .approvals
        .lock()
        .map_err(|_| "Approval broker unavailable")?;
    if let Some((task, resource)) = &direct {
        broker.authorize(task, &action, resource)?;
    }
    let id = broker.prepare(action, args, before, summary.clone())?;
    if let Some((task, _)) = direct {
        broker.bind(&id, task.clone())?;
    }
    Ok(
        json!({"id":id,"summary":summary,"expiresInSeconds":180,"requiresConfirmation":task_id.is_none()||broker.get(&id)?.task.is_none()}),
    )
}
#[tauri::command]
pub fn action_cancel(state: tauri::State<NativeState>, id: String) -> Result<()> {
    state
        .approvals
        .lock()
        .map_err(|_| "Approval broker unavailable")?
        .cancel(&id);
    Ok(())
}
fn audit(app: &tauri::AppHandle, action: &str, status: &str, run_id: &str, authorization: &str) {
    let state = app.state::<NativeState>();
    if let Ok(db) = state.db.lock() {
        let mut rows = db
            .get_value("actionHistory")
            .ok()
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default();
        if let Some(row) = rows.iter_mut().find(|r| r["id"] == run_id) {
            row["status"] = json!(status);
            row["at"] = json!(chrono::Utc::now().to_rfc3339());
        } else {
            rows.push(json!({"id":run_id,"action":action,"status":status,"authorization":authorization,"at":chrono::Utc::now().to_rfc3339()}));
        }
        if rows.len() > 200 {
            rows.drain(..rows.len() - 200);
        }
        let _ = db.set_value("actionHistory", &json!(rows));
    };
}
#[tauri::command]
pub fn action_history(state: tauri::State<NativeState>) -> Result<Value> {
    state
        .db
        .lock()
        .map_err(|_| "Database unavailable")?
        .get_value("actionHistory")
}
pub fn recover(app: &tauri::AppHandle) -> Result<()> {
    let state = app.state::<NativeState>();
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    let mut rows = db
        .get_value("actionHistory")?
        .as_array()
        .cloned()
        .unwrap_or_default();
    for row in &mut rows {
        if row["status"] == "started" {
            row["status"] = json!("interrupted; inspect resources before retrying");
        }
    }
    db.set_value("actionHistory", &json!(rows))
}
struct ExecutionGuard<'a>(&'a std::sync::atomic::AtomicBool);
impl Drop for ExecutionGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}
#[tauri::command]
pub async fn action_execute(app: tauri::AppHandle, id: String) -> Result<Value> {
    let state = app.state::<NativeState>();
    state
        .executing
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .map_err(|_| "Another approval is open; finish or cancel it first")?;
    let _guard = ExecutionGuard(&state.executing);
    let pending = state
        .approvals
        .lock()
        .map_err(|_| "Approval broker unavailable")?
        .get(&id)?;
    let handle = app.clone();
    let summary = pending.summary.clone();
    let authorization = if pending.task.is_some() {
        "direct-user"
    } else {
        "confirmation-required"
    };
    let accepted = if pending.task.is_some() {
        true
    } else {
        crate::background(move || {
            Ok(crate::confirmed(
                &handle,
                "JARVIS — approve exact action",
                &summary,
            ))
        })
        .await?
    };
    if !accepted {
        state
            .approvals
            .lock()
            .map_err(|_| "Approval broker unavailable")?
            .cancel(&id);
        audit(&app, &pending.action, "cancelled", &id, authorization);
        return Err("Action cancelled; no change applied".into());
    }
    let pending = state
        .approvals
        .lock()
        .map_err(|_| "Approval broker unavailable")?
        .consume(&id)?;
    let current = match snapshot(&app, &pending.action, &pending.args) {
        Ok(value) => value,
        Err(error) => {
            audit(&app, &pending.action, "failed", &id, authorization);
            return Err(error);
        }
    };
    if current != pending.snapshot {
        audit(&app, &pending.action, "conflict", &id, authorization);
        return Err("Resource changed after review; prepare a fresh plan".into());
    }
    if let Err(error) = resources(&app, &pending.action, &pending.args) {
        audit(&app, &pending.action, "failed", &id, authorization);
        return Err(error);
    }
    audit(&app, &pending.action, "started", &id, authorization);
    let result = dispatch(
        app.clone(),
        &pending.action,
        pending.args,
        &pending.snapshot,
    )
    .await;
    audit(
        &app,
        &pending.action,
        if result.is_ok() {
            "completed"
        } else {
            "failed"
        },
        &id,
        authorization,
    );
    result
}
async fn dispatch(app: tauri::AppHandle, action: &str, a: Value, before: &str) -> Result<Value> {
    match action {
        "record_put" | "record_delete" => {
            let state = app.state::<NativeState>();
            let db = state.db.lock().map_err(|_| "Database unavailable")?;
            let id = if action == "record_put" {
                a["record"]["id"].as_str().ok_or("Missing record ID")?
            } else {
                a["id"].as_str().ok_or("Missing record ID")?
            };
            use rusqlite::OptionalExtension;
            let now: Option<String> = db
                .conn
                .query_row("SELECT payload FROM records WHERE id=?1", [id], |r| {
                    r.get(0)
                })
                .optional()
                .map_err(|_| "Cannot inspect record")?;
            if now.unwrap_or_default() != before {
                return Err("Record changed; reload before retrying".into());
            }
            if !before.is_empty() {
                db.backup(7)?;
            }
            if action == "record_put" {
                db.put(
                    &serde_json::from_value::<Record>(a["record"].clone())
                        .map_err(|_| "Invalid record")?,
                )?;
            } else {
                db.conn
                    .execute("DELETE FROM records WHERE id=?1", [id])
                    .map_err(|_| "Cannot delete record")?;
            }
        }
        "settings_save" => crate::settings_save(app.clone(), a["settings"].clone()).await?,
        "system_action" => crate::system_action(app.clone(), text(&a, "action")?).await?,
        "app_window_control" => {
            crate::app_window_control(
                app.clone(),
                text(&a, "application")?,
                text(&a, "operation")?,
                a["monitorKey"].as_str().map(str::to_owned),
            )
            .await?
        }
        "installed_app_open" => {
            crate::background({
                let app_id = text(&a, "appId")?;
                let name = text(&a, "name")?;
                move || crate::windows::open_installed_app(&app_id, &name)
            })
            .await?
        }
        "open_website" => crate::open_website(text(&a, "url")?).await?,
        "browser_page_read" => {
            return Ok(json!(
                crate::background(crate::understanding::browser_read).await?
            ))
        }
        "browser_page_scroll" => {
            let direction = text(&a, "direction")?.to_owned();
            return Ok(
                crate::background(move || crate::understanding::browser_scroll(&direction)).await?,
            );
        }
        "browser_link_activate" => {
            let label = text(&a, "label")?.trim().to_owned();
            return Ok(crate::background(move || {
                crate::understanding::browser_activate_link(&label)
            })
            .await?);
        }
        "browser_control" => {
            let request = a.clone();
            return Ok(
                crate::background(move || crate::understanding::browser_control(&request)).await?,
            );
        }
        "skill_save" => {
            let skill = serde_json::from_value::<crate::db::VerifiedSkill>(a["skill"].clone())
                .map_err(|_| "Invalid verified skill note")?;
            let state = app.state::<NativeState>();
            let db = state.db.lock().map_err(|_| "Database unavailable")?;
            db.save_verified_skill(&skill)?;
        }
        "project_revoke" => crate::project_revoke(app.state(), text(&a, "id")?)?,
        "open_project" => crate::open_project(app.clone(), text(&a, "id")?).await?,
        "credential_set" => {
            crate::credential_set(app.clone(), text(&a, "name")?, text(&a, "value")?).await?
        }
        "google_disconnect" => crate::google_disconnect(app.state())?,
        "gmail_send" => {
            crate::gmail_send(
                app.clone(),
                text(&a, "to")?,
                text(&a, "subject")?,
                text(&a, "body")?,
            )
            .await?
        }
        "google_event_save" => crate::google_event_save(app.clone(), text(&a, "id")?).await?,
        "automation_save" => {
            let state = app.state::<NativeState>();
            let db = state.db.lock().map_err(|_| "Database unavailable")?;
            crate::automation::save(
                &db,
                serde_json::from_value(a["rule"].clone()).map_err(|_| "Invalid automation")?,
            )?;
        }
        "automation_delete" => {
            let state = app.state::<NativeState>();
            let db = state.db.lock().map_err(|_| "Database unavailable")?;
            crate::automation::delete(&db, &text(&a, "id")?)?;
        }
        "project_write" => {
            let root = crate::grant_path(&app, &text(&a, "id")?)?;
            let backups = app
                .state::<NativeState>()
                .db
                .lock()
                .map_err(|_| "Database unavailable")?
                .dir
                .join("edit-backups");
            let path = text(&a, "path")?;
            let expected = text(&a, "expectedHash")?;
            let content = text(&a, "content")?;
            return crate::background(move || {
                crate::projects::write_reviewed(&root, &path, &expected, &content, &backups)
            })
            .await;
        }
        "project_copy" => {
            let root = crate::grant_path(&app, &text(&a, "id")?)?;
            let source = text(&a, "source")?;
            let destination = text(&a, "destination")?;
            let snapshot: Value =
                serde_json::from_str(before).map_err(|_| "Copy plan unavailable")?;
            let hash = text(&snapshot, "sourceHash")?;
            return crate::background(move || {
                crate::projects::copy_new(&root, &source, &destination, &hash)
            })
            .await;
        }
        "speech_install" => {
            let handle = app.clone();
            crate::background(move || crate::offline_speech::install(&handle)).await?;
        }
        "codex_disconnect" => {
            let handle = app.clone();
            crate::background(move || crate::intelligence::disconnect(&handle)).await?;
        }
        "backup_create" => return Ok(json!(crate::backup_create(app).await?)),
        _ => return Err("Action is unavailable".into()),
    }
    Ok(Value::Null)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browser_page_read_accepts_no_untrusted_arguments() {
        assert!(validate("browser_page_read", &json!({})).is_ok());
        assert!(validate(
            "browser_page_read",
            &json!({"url":"https://example.com","script":"alert(1)"})
        )
        .is_err());
    }
    #[test]
    fn browser_page_scroll_only_accepts_an_exact_direction() {
        assert!(validate("browser_page_scroll", &json!({"direction":"up"})).is_ok());
        assert!(validate("browser_page_scroll", &json!({"direction":"down"})).is_ok());
        assert!(validate("browser_page_scroll", &json!({"direction":"home"})).is_err());
        assert!(validate(
            "browser_page_scroll",
            &json!({"direction":"down","url":"https://example.com"})
        )
        .is_err());
    }
    #[test]
    fn browser_link_activation_accepts_only_a_bounded_visible_label() {
        assert!(validate("browser_link_activate", &json!({"label":"Privacy Policy"})).is_ok());
        assert!(validate("browser_link_activate", &json!({"label":"  "})).is_err());
        assert!(validate(
            "browser_link_activate",
            &json!({"label":"Help","url":"https://example.com"})
        )
        .is_err());
        assert!(validate("browser_link_activate", &json!({"label":"bad\nlabel"})).is_err());
        assert!(validate("browser_link_activate", &json!({"label":"x".repeat(161)})).is_err());
    }
    #[test]
    fn browser_control_accepts_only_accessible_buttons_or_bounded_fields() {
        assert!(validate(
            "browser_control",
            &json!({"kind":"button","label":"Continue"})
        )
        .is_ok());
        assert!(validate(
            "browser_control",
            &json!({"kind":"button","label":"Continue","value":"extra"})
        )
        .is_err());
        assert!(validate(
            "browser_control",
            &json!({"kind":"fill","label":"Search","value":"hello"})
        )
        .is_ok());
        assert!(validate(
            "browser_control",
            &json!({"kind":"fill","label":"Password","value":"secret"})
        )
        .is_ok());
        assert!(validate(
            "browser_control",
            &json!({"kind":"submit","label":"Submit"})
        )
        .is_err());
        assert!(validate(
            "browser_control",
            &json!({"kind":"fill","label":"Search","value":"bad\nvalue"})
        )
        .is_err());
        assert!(validate(
            "browser_control",
            &json!({"kind":"fill","label":"Search","value":"x".repeat(2001)})
        )
        .is_err());
        assert!(validate(
            "browser_control",
            &json!({"kind":"button","label":"Continue","url":"https://example.com"})
        )
        .is_err());
    }
    #[test]
    fn verified_skill_action_requires_bounded_user_attested_note() {
        let now = chrono::Utc::now().to_rfc3339();
        let skill = crate::db::VerifiedSkill {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Official doc check".into(),
            trigger: "When researching API support".into(),
            steps: vec!["Search official docs".into()],
            sources: vec!["https://example.org/docs".into()],
            verification: "User confirmed the cited API page".into(),
            verified_at: now.clone(),
            created_at: now.clone(),
            updated_at: now,
        };
        assert!(validate("skill_save", &json!({"skill":skill})).is_ok());
        assert!(validate("skill_save", &json!({"skill":{},"extra":true})).is_err());
    }
    #[test]
    fn plans_reject_extra_scope_and_redact_credentials() {
        assert!(validate(
            "installed_app_open",
            &json!({"appId":"Calculator!App","name":"Calculator","path":"C:\\Windows\\calc.exe"})
        )
        .is_err());
        assert!(validate("installed_app_open", &json!({"appId":"x","name":"  "})).is_err());
        assert!(validate(
            "system_action",
            &json!({"action":"chrome","shell":"delete"})
        )
        .is_err());
        assert!(validate(
            "credential_set",
            &json!({"name":"other","value":"synthetic"})
        )
        .is_err());
        let summary = validate(
            "credential_set",
            &json!({"name":"ai","value":"synthetic-secret-do-not-display"}),
        )
        .unwrap();
        assert!(!summary.contains("synthetic-secret"));
        assert!(validate(
            "project_write",
            &json!({"id":"x","path":"a.rs","content":"x","expectedHash":"bad"})
        )
        .is_err());
    }
}
#[tauri::command]
pub fn record_log(state: tauri::State<NativeState>, record: Record) -> Result<()> {
    // App-owned operational logging cannot overwrite a personal record or execute an action.
    if !["message", "activity", "notification"].contains(&record.kind.as_str()) {
        return Err("Personal data changes require approval".into());
    }
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    let exists: bool = db
        .conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM records WHERE id=?1)",
            [&record.id],
            |r| r.get(0),
        )
        .map_err(|_| "Cannot inspect log")?;
    if exists {
        return Err("Logs are append-only; editing requires approval".into());
    }
    db.put(&record)
}
