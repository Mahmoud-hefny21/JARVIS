#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod action_policy;
mod actions;
mod authorization;
mod automation;
mod calendar;
mod claude;
mod db;
mod groq;
mod integrations;
mod knowledge;
mod mobile;
mod intelligence;
mod capture;
mod offline_speech;
mod ollama;
mod placement;
mod push;
mod profiles;
mod projects;
mod runtime;
mod understanding;
mod windows;
use chrono::Utc;
use db::{Database, Record, Result};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex};
use sysinfo::{Components, Disks, Networks, System};
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;

struct Monitor {
    system: System,
    disks: Disks,
    networks: Networks,
    components: Components,
    last: std::time::Instant,
    last_slow: std::time::Instant,
    samples: u32,
}
impl Monitor {
    fn new() -> Self {
        Self {
            system: System::new(),
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            components: Components::new_with_refreshed_list(),
            last: std::time::Instant::now(),
            last_slow: std::time::Instant::now(),
            samples: 0,
        }
    }
}
pub struct NativeState {
    db: Mutex<Database>,
    approvals: Mutex<authorization::Broker>,
    executing: std::sync::atomic::AtomicBool,
    automation_busy: std::sync::atomic::AtomicBool,
    monitor: Mutex<Option<Monitor>>,
    speech: windows::Speech,
    ai_process: intelligence::ProcessSlot,
    offline_process: intelligence::ProcessSlot,
    offline_epoch: std::sync::atomic::AtomicU64,
}
fn db_state<'a>(
    state: &'a tauri::State<NativeState>,
) -> Result<std::sync::MutexGuard<'a, Database>> {
    state.db.lock().map_err(|_| "Local database is busy".into())
}
fn confirmed(app: &tauri::AppHandle, title: &str, body: &str) -> bool {
    // Explicit Windows decision codes; Cancel is the default, including Escape/close.
    // Avoid implicit bool/custom-label conversions at this authorization boundary.
    let text: Vec<u16> = body.encode_utf16().chain(Some(0)).collect();
    let caption: Vec<u16> = title.encode_utf16().chain(Some(0)).collect();
    let owner = app
        .get_webview_window("main")
        .and_then(|w| w.hwnd().ok())
        .map(|h| h.0 as _)
        .unwrap_or(std::ptr::null_mut());
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
            owner,
            text.as_ptr(),
            caption.as_ptr(),
            0x0001 | 0x0030 | 0x0100 | 0x10000,
        ) == 1
    }
}
fn grant_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf> {
    uuid::Uuid::parse_str(id).map_err(|_| "Invalid project ID")?;
    let path = app
        .state::<NativeState>()
        .db
        .lock()
        .map_err(|_| "Database unavailable")?
        .conn
        .query_row("SELECT path FROM project_grants WHERE id=?1", [id], |r| {
            r.get::<_, String>(0)
        })
        .map(PathBuf::from)
        .map_err(|_| "This folder has not been authorized".to_string())?;
    understanding::check_project_privacy(&path, &integrations::settings(app)?)?;
    Ok(path)
}
async fn background<T: Send + 'static>(
    job: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|_| "Background operation was interrupted")?
}

#[tauri::command]
fn records_list(
    state: tauri::State<NativeState>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<Vec<Record>> {
    db_state(&state)?.page(offset.unwrap_or(0), limit.unwrap_or(500))
}
#[tauri::command]
fn memory_search(app: tauri::AppHandle, query: String) -> Result<Vec<Record>> {
    let rows = {
        let state = app.state::<NativeState>();
        let db = state.db.lock().map_err(|_| "Database unavailable")?;
        db.search_memory(&query)?
    };
    Ok(rows
        .into_iter()
        .filter(|r| r.project_id.is_empty() || grant_path(&app, &r.project_id).is_ok())
        .collect())
}
#[tauri::command]
fn verified_skills_list(state: tauri::State<NativeState>) -> Result<Vec<crate::db::VerifiedSkill>> {
    db_state(&state)?.list_verified_skills()
}
#[tauri::command]
fn context_records(app: tauri::AppHandle) -> Result<Vec<Record>> {
    let rows = {
        let state = app.state::<NativeState>();
        let db = state.db.lock().map_err(|_| "Database unavailable")?;
        db.page(0, 500)?
    };
    Ok(rows
        .into_iter()
        .filter(|r| {
            if r.kind == "project" {
                grant_path(&app, &r.id).is_ok()
            } else {
                r.project_id.is_empty() || grant_path(&app, &r.project_id).is_ok()
            }
        })
        .collect())
}
#[tauri::command]
fn diagnostics(state: tauri::State<NativeState>) -> Result<Value> {
    automation::diagnostics(&*db_state(&state)?)
}
#[tauri::command]
fn automations_list(state: tauri::State<NativeState>) -> Result<Value> {
    Ok(json!(automation::rules(&*db_state(&state)?)?))
}
#[tauri::command]
fn settings_get(state: tauri::State<NativeState>) -> Result<Value> {
    db_state(&state)?.get_value("preferences")
}
#[tauri::command]
fn monitor_list(app: tauri::AppHandle) -> Result<Value> {
    let window = app
        .get_webview_window("main")
        .ok_or("JARVIS window unavailable")?;
    serde_json::to_value(placement::displays(&window)?)
        .map_err(|_| "Cannot describe displays".into())
}
#[tauri::command]
fn monitor_fullscreen(app: tauri::AppHandle, key: Option<String>) -> Result<()> {
    placement::open(&app, key.as_deref(), Some(true))
}
#[tauri::command]
fn monitor_windowed(app: tauri::AppHandle) -> Result<()> {
    placement::open(&app, None, Some(false))
}
#[tauri::command]
fn window_geometry(app: tauri::AppHandle) -> Result<Value> {
    placement::geometry(&app)
}
#[tauri::command]
async fn installed_apps() -> Result<Value> {
    background(|| windows::installed_apps().map(Value::Array)).await
}
#[tauri::command]
async fn app_window_control(
    app: tauri::AppHandle,
    application: String,
    operation: String,
    monitor_key: Option<String>,
) -> Result<()> {
    if !["chrome", "vscode"].contains(&application.as_str())
        || !["open", "focus", "move", "minimize", "restore"].contains(&operation.as_str())
        || (monitor_key.is_some() && !["open", "move"].contains(&operation.as_str()))
    {
        return Err("Application window request is not allowlisted".into());
    }
    let bounds = if let Some(key) = monitor_key {
        if key.len() > 32
            || (key != "primary"
                && !key
                    .bytes()
                    .all(|b| b.is_ascii_digit() || b == b'-' || b == b','))
        {
            return Err("Invalid display selection".into());
        }
        let window = app
            .get_webview_window("main")
            .ok_or("JARVIS window unavailable")?;
        let mut monitors = window
            .available_monitors()
            .map_err(|_| "Could not enumerate Windows displays")?;
        monitors.sort_by_key(|m| (m.position().x, m.position().y));
        let primary = window
            .primary_monitor()
            .map_err(|_| "Could not identify the primary display")?;
        let selected = if key == "primary" {
            primary
        } else {
            monitors
                .into_iter()
                .find(|m| key == format!("{},{}", m.position().x, m.position().y))
        }
        .ok_or("The requested display is no longer connected")?;
        let work = selected.work_area();
        let p = &work.position;
        let size = &work.size;
        Some((p.x, p.y, size.width, size.height))
    } else {
        None
    };
    background(move || windows::app_window(&application, &operation, bounds)).await
}
#[tauri::command]
async fn settings_save(app: tauri::AppHandle, settings: Value) -> Result<()> {
    background(move || {
        integrations::validate_settings(&settings)?;
        let enabled = settings["autostart"].as_bool().unwrap_or(false);
        let old_settings = integrations::settings(&app)?;
        let previous = old_settings["autostart"].as_bool().unwrap_or(false);
        if enabled && !previous {
            app.autolaunch()
                .enable()
                .map_err(|_| "Could not enable Windows startup")?;
        } else if previous && !enabled {
            app.autolaunch()
                .disable()
                .map_err(|_| "Could not disable Windows startup")?;
        }
        app.state::<NativeState>()
            .db
            .lock()
            .map_err(|_| "Database unavailable")?
            .set_value("preferences", &settings)?;
        if old_settings["monitorKey"] != settings["monitorKey"] {
            placement::select(&app, settings["monitorKey"].as_str().unwrap_or("primary"));
        }
        Ok(())
    })
    .await
}
#[tauri::command]
async fn telemetry(app: tauri::AppHandle) -> Result<Value> {
    background(move||{let state=app.state::<NativeState>();let mut monitor_state=state.monitor.lock().map_err(|_|"Monitor unavailable")?;let m=monitor_state.get_or_insert_with(Monitor::new);m.system.refresh_memory();m.system.refresh_cpu_usage();if m.last_slow.elapsed().as_secs()>=30{m.disks.refresh(true);m.components.refresh(true);m.last_slow=std::time::Instant::now();}m.networks.refresh(true);let elapsed=m.last.elapsed().as_secs_f64().max(0.1);m.last=std::time::Instant::now();m.samples+=1;let(battery,charging)=windows::battery();let disk=m.disks.list().iter().find(|d|d.mount_point().to_string_lossy().to_uppercase().starts_with("C:"));let temperature=m.components.list().iter().find_map(|c|c.temperature());let received=m.networks.iter().map(|(_,n)|n.received()).sum::<u64>() as f64/elapsed;let transmitted=m.networks.iter().map(|(_,n)|n.transmitted()).sum::<u64>() as f64/elapsed;
    Ok(json!({"cpu":if m.samples>1{Some(m.system.global_cpu_usage())}else{None},"ramUsed":m.system.used_memory(),"ramTotal":m.system.total_memory(),"diskUsed":disk.map(|d|d.total_space()-d.available_space()),"diskTotal":disk.map(|d|d.total_space()),"battery":battery,"charging":charging,"temperature":temperature,"received":received,"transmitted":transmitted,"sampledAt":Utc::now().to_rfc3339()}))}).await
}
#[tauri::command]
async fn security_status() -> Result<Value> {
    background(|| Ok(windows::security())).await
}
#[tauri::command]
async fn tools_status() -> Result<Value> {
    background(||{let script=r#"$names=@('code','git','node','python','docker');$labels=@('VS Code','Git','Node.js','Python','Docker');$result=@();for($i=0;$i -lt $names.Count;$i++){$c=Get-Command $names[$i] -ErrorAction SilentlyContinue;$p=Get-Process -Name $names[$i] -ErrorAction SilentlyContinue;$installed=($null -ne $c -and $c.Source -notlike '*WindowsApps*');$result += [pscustomobject]@{name=$labels[$i];installed=[bool]($installed -or $p);running=[bool]$p}};ConvertTo-Json -InputObject $result -Compress"#;let output=windows::ps(script)?;serde_json::from_str(&output).map_err(|_|"Could not read development tool status".into())}).await
}
#[tauri::command]
async fn system_action(_app: tauri::AppHandle, action: String) -> Result<()> {
    background(move || {
        if ![
            "chrome",
            "vscode",
            "windows-security",
            "lock",
            "sleep",
            "restart",
            "shutdown",
        ]
        .contains(&action.as_str())
        {
            return Err("Action is not allowlisted".into());
        }
        // Disruptive operations are confirmed once by the sole registered broker.
        windows::execute(&action)
    })
    .await
}
#[tauri::command]
async fn open_website(url: String) -> Result<()> {
    background(move || windows::open_url(&url)).await
}
#[tauri::command]
async fn project_grant(app: tauri::AppHandle) -> Result<Value> {
    background(move || {
        let folder = app
            .dialog()
            .file()
            .set_title("Authorize read-only project access")
            .blocking_pick_folder();
        let Some(folder) = folder else {
            return Ok(Value::Null);
        };
        let path = folder
            .into_path()
            .map_err(|_| "Not a local folder")?
            .canonicalize()
            .map_err(|_| "Folder unavailable")?;
        if path.parent().is_none() {
            return Err("Authorize a project folder, not an entire drive".into());
        }
        let state = app.state::<NativeState>();
        let db = state.db.lock().map_err(|_| "Database unavailable")?;
        let existing = db
            .conn
            .query_row(
                "SELECT id FROM project_grants WHERE path=?1",
                [path.to_string_lossy().as_ref()],
                |r| r.get::<_, String>(0),
            )
            .ok();
        let id = existing.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        db.conn
            .execute(
                "INSERT OR IGNORE INTO project_grants(id,path,created_at) VALUES(?1,?2,?3)",
                rusqlite::params![id, path.to_string_lossy(), Utc::now().to_rfc3339()],
            )
            .map_err(|_| "Cannot save folder authorization")?;
        Ok(json!({"id":id,"name":path.file_name().unwrap_or_default().to_string_lossy()}))
    })
    .await
}
#[tauri::command]
fn project_revoke(state: tauri::State<NativeState>, id: String) -> Result<()> {
    db_state(&state)?
        .conn
        .execute("DELETE FROM project_grants WHERE id=?1", [id])
        .map_err(|_| "Cannot revoke folder")?;
    Ok(())
}
#[tauri::command]
async fn project_inspect(app: tauri::AppHandle, id: String) -> Result<Value> {
    background(move || projects::inspect(&id, &grant_path(&app, &id)?)).await
}
#[tauri::command]
async fn project_read(app: tauri::AppHandle, id: String, path: String) -> Result<String> {
    background(move || projects::read(&grant_path(&app, &id)?, &path)).await
}
#[tauri::command]
async fn document_read(app: tauri::AppHandle) -> Result<Value> {
    background(move || understanding::document(&app)).await
}
#[tauri::command]
async fn screen_read(app: tauri::AppHandle) -> Result<Value> {
    background(move||{if !confirmed(&app,"Read primary screen locally","Capture the primary display once for offline Windows text recognition? The image remains in memory. You review the extracted text before choosing whether to share it with AI. Passwords and other private text may be visible; close sensitive windows first."){return Err("Screen reading cancelled".into());}understanding::ocr("screen",None)}).await
}
#[tauri::command]
async fn project_file(app: tauri::AppHandle, id: String, path: String) -> Result<Value> {
    background(move || {
        let content = projects::read(&grant_path(&app, &id)?, &path)?;
        Ok(json!({"hash":projects::content_hash(&content),"content":content}))
    })
    .await
}
#[tauri::command]
async fn project_search(app: tauri::AppHandle, id: String, query: String) -> Result<Value> {
    background(move || projects::search(&grant_path(&app, &id)?, &query)).await
}
#[tauri::command]
async fn offline_speech_status(app: tauri::AppHandle) -> Result<Value> {
    background(move || offline_speech::status(&app)).await
}
#[tauri::command]
async fn speech_microphone(app: tauri::AppHandle, follow_up: Option<bool>) -> Result<String> {
    background(move || offline_speech::microphone(&app, follow_up == Some(true))).await
}
#[tauri::command]
async fn speech_status() -> Result<Value> {
    background(||{let source=r#"Add-Type -AssemblyName System.Speech;$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;$r=@([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()|ForEach-Object {$_.Culture.Name});$v=@($s.GetInstalledVoices()|ForEach-Object {[pscustomobject]@{name=$_.VoiceInfo.Name;language=$_.VoiceInfo.Culture.Name}});$s.Dispose();[pscustomobject]@{recognizers=$r;voices=$v}|ConvertTo-Json -Compress"#;serde_json::from_str(&windows::ps(source)?).map_err(|_|"Cannot read installed speech engines".into())}).await
}
#[tauri::command]
async fn open_project(app: tauri::AppHandle, id: String) -> Result<()> {
    background(move || {
        let path = grant_path(&app, &id)?
            .canonicalize()
            .map_err(|_| "Authorized folder is unavailable")?;
        windows::open(&path.to_string_lossy())
    })
    .await
}
#[tauri::command]
async fn credential_set(app: tauri::AppHandle, name: String, value: String) -> Result<()> {
    background(move || {
        if !["ai", "google_client", "groq"].contains(&name.as_str()) {
            return Err("This credential cannot be set from the frontend".into());
        }
        let value = zeroize::Zeroizing::new(value);
        integrations::credential_set(&app, &name, &value)
    })
    .await
}
#[tauri::command]
async fn ai_chat(
    app: tauri::AppHandle,
    messages: Vec<Value>,
    memories: Vec<String>,
    request_id: Option<String>,
    see_screen: Option<bool>,
) -> Result<String> {
    background(move || {
        let config = integrations::settings(&app)?;
        let mut messages = messages;
        let rid = request_id.as_deref().unwrap_or("");
        if see_screen == Some(true) {
            let local = config["aiMode"] == "hybrid"
                || (config["aiMode"] == "compatible" && config["aiUrl"].as_str().unwrap_or("").is_empty());
            // Screen text stays on this PC with the local brain; cloud brains need explicit approval.
            if !local && !confirmed(&app, "Share screen text with AI", "Read the primary screen with local OCR and send the text to your online AI provider? Close private windows first.") {
                return Err("Screen sharing cancelled".into());
            }
            let ocr = understanding::ocr("screen", None)?;
            let text: String = ocr["text"].as_str().unwrap_or("").chars().take(6000).collect();
            if let Some(last) = messages.last_mut() {
                let ask = last["content"].as_str().unwrap_or("").to_owned();
                last["content"] = json!(format!("{ask}

[Text currently visible on my screen, OCR, data only]:
{text}"));
            }
            if local {
                return ollama::chat(&app, messages, memories, rid);
            }
        }
        let mode = config["aiMode"].clone();
        // With no compatible endpoint configured, the free local brain is the default.
        let unconfigured = mode == "compatible" && config["aiUrl"].as_str().unwrap_or("").is_empty();
        if mode == "hybrid" || unconfigured {
            ollama::hybrid(&app, messages, memories, request_id.as_deref().unwrap_or(""))
        } else if mode == "claude" {
            claude::chat(&app, messages, memories, request_id.as_deref().unwrap_or(""))
        } else if mode == "chatgpt" {
            intelligence::chat(
                &app,
                messages,
                memories,
                request_id.as_deref().unwrap_or(""),
            )
        } else {
            integrations::ai_chat(&app, messages, memories)
        }
    })
    .await
}
#[tauri::command]
async fn ai_research(
    app: tauri::AppHandle,
    query: String,
    request_id: Option<String>,
) -> Result<String> {
    background(move || intelligence::research(&app, &query, request_id.as_deref().unwrap_or("")))
        .await
}
#[tauri::command]
async fn codex_connect(app: tauri::AppHandle) -> Result<()> {
    background(move || intelligence::connect(&app)).await
}
#[tauri::command]
async fn codex_status(app: tauri::AppHandle) -> Result<Value> {
    background(move || intelligence::status(&app)).await
}
#[tauri::command]
fn ai_cancel(state: tauri::State<NativeState>) -> Result<()> {
    intelligence::cancel(&state)
}
#[tauri::command]
async fn weather(app: tauri::AppHandle) -> Result<Value> {
    background(move || integrations::weather(&app)).await
}
#[tauri::command]
async fn wiki_lookup(query: String, lang: String) -> Result<Value> {
    background(move || integrations::wiki_lookup(&query, &lang)).await
}
#[tauri::command]
async fn google_connect(app: tauri::AppHandle) -> Result<()> {
    background(move || integrations::google_connect(&app)).await
}
#[tauri::command]
fn google_disconnect(state: tauri::State<NativeState>) -> Result<()> {
    let db = db_state(&state)?;
    db.conn
        .execute("DELETE FROM credentials WHERE name='google'", [])
        .map_err(|_| "Could not erase Google tokens")?;
    db.set_value("gmailCache", &json!([]))?;
    Ok(())
}
#[tauri::command]
async fn gmail_list(app: tauri::AppHandle, query: Option<String>) -> Result<Value> {
    background(move || integrations::gmail_list(&app, query.as_deref().unwrap_or(""))).await
}
#[tauri::command]
async fn gmail_read(app: tauri::AppHandle, id: String) -> Result<Value> {
    background(move || integrations::gmail_read(&app, &id)).await
}
#[tauri::command]
async fn gmail_send(
    app: tauri::AppHandle,
    to: String,
    subject: String,
    body: String,
) -> Result<()> {
    background(move || {
        // The broker is the sole registered entry point and already reviewed this send.
        integrations::gmail_send(&app, &to, &subject, &body)
    })
    .await
}
#[tauri::command]
async fn google_calendar(app: tauri::AppHandle) -> Result<Vec<Record>> {
    background(move || integrations::google_calendar(&app)).await
}
#[tauri::command]
async fn google_event_save(app: tauri::AppHandle, id: String) -> Result<()> {
    background(move || {
        let state = app.state::<NativeState>();
        let payload: String = state
            .db
            .lock()
            .map_err(|_| "Database unavailable")?
            .conn
            .query_row(
                "SELECT payload FROM records WHERE id=?1 AND kind='event'",
                [id],
                |r| r.get(0),
            )
            .map_err(|_| "Appointment not found")?;
        let record: Record =
            serde_json::from_str(&payload).map_err(|_| "Invalid local appointment")?;
        integrations::google_event_save(&app, &record)
    })
    .await
}
#[tauri::command]
fn cached_integrations(state: tauri::State<NativeState>) -> Result<Value> {
    let db = db_state(&state)?;
    let connected: bool = db
        .conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM credentials WHERE name='google')",
            [],
            |r| r.get(0),
        )
        .map_err(|_| "Cannot read connection state")?;
    Ok(
        json!({"weather":db.get_value("weatherCache")?,"emails":db.get_value("gmailCache")?,"emailsAt":db.get_value("gmailCacheAt")?,"calendarAt":db.get_value("calendarCacheAt")?,"connected":connected}),
    )
}
#[tauri::command]
async fn backup_create(app: tauri::AppHandle) -> Result<String> {
    background(move || {
        let state = app.state::<NativeState>();
        let db = state.db.lock().map_err(|_| "Database unavailable")?;
        let settings = db.get_value("preferences")?;
        db.backup(settings["backupKeep"].as_u64().unwrap_or(7) as usize)
    })
    .await
}
#[tauri::command]
async fn backup_restore(app: tauri::AppHandle) -> Result<()> {
    background(move||{let file=app.dialog().file().set_title("Restore encrypted JARVIS backup").add_filter("JARVIS encrypted backup",&["jbackup"]).blocking_pick_file().ok_or("Restore cancelled")?.into_path().map_err(|_|"Invalid backup file")?;if !confirmed(&app,"Restore local backup","Restore will replace the current records and preferences. A backup of your current state will be preserved. Continue?"){return Err("Restore cancelled".into());}app.state::<NativeState>().db.lock().map_err(|_|"Database unavailable")?.restore(&file)}).await
}
#[tauri::command]
fn backup_status(state: tauri::State<NativeState>) -> Result<Value> {
    let db = db_state(&state)?;
    let mut value = db.get_value("lastBackup")?;
    if !value.is_object() {
        value = json!({});
    }
    value["error"] = db.get_value("backupError")?;
    Ok(value)
}
#[tauri::command]
async fn database_integrity(app: tauri::AppHandle) -> Result<String> {
    background(move || {
        app.state::<NativeState>()
            .db
            .lock()
            .map_err(|_| "Database unavailable")?
            .integrity()
    })
    .await
}
#[tauri::command]
async fn export_records(app: tauri::AppHandle, json: String) -> Result<()> {
    background(move || {
        if json.len() > 20 * 1024 * 1024 || serde_json::from_str::<Value>(&json).is_err() {
            return Err("Invalid export".into());
        }
        let file = app
            .dialog()
            .file()
            .set_file_name("jarvis-personal-export.json")
            .add_filter("JSON", &["json"])
            .blocking_save_file()
            .ok_or("Export cancelled")?
            .into_path()
            .map_err(|_| "Invalid export path")?;
        std::fs::write(file, json).map_err(|_| "Could not save export".into())
    })
    .await
}
#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String) -> Result<()> {
    if title.len() > 500 || body.len() > 2000 {
        return Err("Notification exceeds size limit".into());
    }
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|_| {
            "Windows notification unavailable; the reminder remains in your notification history"
                .into()
        })
}
#[tauri::command]
fn voice_start(
    app: tauri::AppHandle,
    state: tauri::State<NativeState>,
    mode: String,
    language: String,
) -> Result<String> {
    windows::start_voice(app, &state.speech, &mode, &language)
}
#[tauri::command]
fn voice_stop(state: tauri::State<NativeState>) -> Result<()> {
    offline_speech::cancel(&state)?;
    let _setup = state
        .speech
        .setup_gate
        .lock()
        .map_err(|_| "Speech setup unavailable")?;
    state
        .speech
        .wake_during_speech
        .store(false, std::sync::atomic::Ordering::SeqCst);
    windows::stop(&state.speech.recognizer)
}
#[tauri::command]
async fn speech_pick_file(app: tauri::AppHandle, kind: String) -> Result<String> {
    background(move || {
        let (title, label, extensions, max_bytes) = match kind.as_str() {
            "python" => (
                "Choose a Python executable with Piper installed",
                "Python executable",
                ["exe"].as_slice(),
                200_000_000,
            ),
            "model" => (
                "Choose a local Piper ONNX model",
                "Piper ONNX model",
                ["onnx"].as_slice(),
                512_000_000,
            ),
            "config" => (
                "Choose the model's matching JSON config",
                "Piper model config",
                ["json"].as_slice(),
                1_000_000,
            ),
            _ => return Err("Invalid Piper file type".into()),
        };
        let selected = app
            .dialog()
            .file()
            .set_title(title)
            .add_filter(label, extensions)
            .blocking_pick_file()
            .ok_or("File selection cancelled")?
            .into_path()
            .map_err(|_| "Selected file is not local")?
            .canonicalize()
            .map_err(|_| "Selected file is unavailable")?;
        if !selected.is_file()
            || std::fs::metadata(&selected)
                .map_err(|_| "Selected file is unavailable")?
                .len()
                > max_bytes
        {
            return Err("Selected Piper file is too large or unavailable".into());
        }
        Ok(selected.to_string_lossy().into_owned())
    })
    .await
}
#[tauri::command]
fn speech_output_status(app: tauri::AppHandle) -> Result<Value> {
    let settings = integrations::settings(&app)?;
    let state = app.state::<NativeState>();
    let last = state
        .speech
        .last_output
        .lock()
        .map_err(|_| "Speech diagnostics unavailable")?
        .clone();
    Ok(
        json!({"configuredEngine":settings["ttsEngine"],"model":settings["piperModel"],"runtime":settings["piperExecutable"],"last":last}),
    )
}
#[tauri::command]
async fn speak(
    app: tauri::AppHandle,
    text: String,
    language: String,
    voice: String,
) -> Result<Value> {
    let settings = integrations::settings(&app)?;
    let engine = settings["ttsEngine"]
        .as_str()
        .unwrap_or("windows")
        .to_owned();
    let executable = settings["piperExecutable"]
        .as_str()
        .unwrap_or("")
        .to_owned();
    let model = settings["piperModel"].as_str().unwrap_or("").to_owned();
    let config = settings["piperConfig"].as_str().unwrap_or("").to_owned();
    background(move || {
        let state = app.state::<NativeState>();
        let speech = &state.speech;
        let before = speech.synth_epoch.load(std::sync::atomic::Ordering::SeqCst);
        // Lets a capture running during playback tell the user's voice from JARVIS's own echo.
        struct Talking;
        impl Drop for Talking { fn drop(&mut self) { offline_speech::SPEAKING.store(false, std::sync::atomic::Ordering::SeqCst); } }
        offline_speech::SPEAKING.store(true, std::sync::atomic::Ordering::SeqCst);
        let _talking = Talking;
        let piper = engine == "piper" && !PIPER_TOO_SLOW.load(std::sync::atomic::Ordering::Relaxed);
        let result = if piper {
            match windows::speak_piper(speech, &text, &executable, &model, &config) {
                Ok(value) => Ok(value),
                Err(reason) => {
                    PIPER_TOO_SLOW.store(true, std::sync::atomic::Ordering::Relaxed);
                    if speech.synth_epoch.load(std::sync::atomic::Ordering::SeqCst) > before + 1 {
                        return Ok(json!({"engine":"piper","played":false,"cancelled":true}));
                    }
                    let _ = app.emit("speech-output",json!({"engine":"windows","fallback":true,"reason":reason}));
                    windows::speak(speech, &text, &language, &voice)
                        .map(|_| json!({"engine":"windows","fallback":true,"fallbackReason":reason,"played":true}))
                        .map_err(|fallback| format!("Piper failed: {reason}. Windows fallback failed: {fallback}"))
                }
            }
        } else {
            windows::speak(speech, &text, &language, &voice).map(|_| json!({"engine":"windows","fallback":false,"played":true}))
        };
        let status = result.clone().unwrap_or_else(|reason|json!({"engine":engine,"played":false,"error":reason}));
        if let Ok(mut last) = speech.last_output.lock() { *last=status.clone(); }
        let _ = app.emit("speech-output",status);
        result
    }).await
}
/// The window the owner is using right now (title + program), for "what am I working on?".
/// Read on demand only; nothing is stored on disk. JARVIS's own window is skipped and
/// private-browsing / password-manager windows are reported without their title.
#[tauri::command]
fn active_window() -> Result<Option<Value>> {
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return Ok(None);
        }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        let title = String::from_utf16_lossy(&buf[..len.max(0) as usize]);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let mut app = String::new();
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if !process.is_null() {
            let mut path = [0u16; 1024];
            let mut size = path.len() as u32;
            if QueryFullProcessImageNameW(process, 0, path.as_mut_ptr(), &mut size) != 0 {
                let full = String::from_utf16_lossy(&path[..size as usize]);
                app = std::path::Path::new(&full).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            }
            windows_sys::Win32::Foundation::CloseHandle(process);
        }
        if title.is_empty() || pid == std::process::id() || app.eq_ignore_ascii_case("jarvis-desktop") {
            return Ok(None);
        }
        let private = ["inprivate", "incognito", "private browsing", "keepass", "1password", "bitwarden", "password", "credential"]
            .iter()
            .any(|w| title.to_lowercase().contains(w) || app.to_lowercase().contains(w));
        let title: String = if private { "(private window)".into() } else { title.chars().take(160).collect() };
        Ok(Some(serde_json::json!({ "title": title, "app": app })))
    }
}
/// Owner-provided sounds kept in the app data folder (never in the repo or installer).
/// Only fixed slot names are accepted, so no other file can be read through this command.
#[tauri::command]
fn sound_asset(app: tauri::AppHandle, slot: String) -> Result<Option<String>> {
    use base64::Engine;
    if !["wake", "activation", "music", "notify"].contains(&slot.as_str()) {
        return Err("Unknown sound slot".into());
    }
    let dir = app.path().app_data_dir().map_err(|_| "App data folder unavailable")?.join("sounds");
    for (ext, mime) in [("wav", "audio/wav"), ("mp3", "audio/mpeg")] {
        let file = dir.join(format!("{slot}.{ext}"));
        let Ok(meta) = std::fs::metadata(&file) else { continue };
        if meta.len() > 40 * 1024 * 1024 {
            return Err("Sound file is larger than 40 MB".into());
        }
        let bytes = std::fs::read(&file).map_err(|_| "Cannot read the sound file")?;
        return Ok(Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))));
    }
    Ok(None)
}
#[tauri::command]
fn speech_stop(state: tauri::State<NativeState>) -> Result<()> {
    let _setup = state
        .speech
        .setup_gate
        .lock()
        .map_err(|_| "Speech setup unavailable")?;
    state
        .speech
        .synth_epoch
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    windows::stop(&state.speech.synthesizer)
}

/// Set once Piper proves too slow on this PC; later replies use the instant Windows voice.
static PIPER_TOO_SLOW: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Crash safety for the personal instance: Windows relaunches JARVIS if it crashes after running 60 s
/// (Restart Manager), and any panic is appended to a small error log in the data folder.
fn crash_safety() {
    use windows_sys::Win32::System::Recovery::RegisterApplicationRestart;
    let args: Vec<u16> = [0u16].to_vec();
    // SAFETY: NUL-terminated UTF-16 command line; flags 0 = restart on crash and hang.
    unsafe { RegisterApplicationRestart(args.as_ptr(), 0) };
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(dir) = std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("com.jarvis.personal").join("logs")) {
            let _ = std::fs::create_dir_all(&dir);
            let file = dir.join("errors.log");
            if std::fs::metadata(&file).map(|m| m.len() > 512 * 1024).unwrap_or(false) {
                let _ = std::fs::rename(&file, dir.join("errors.old.log"));
            }
            if let Ok(mut log) = std::fs::OpenOptions::new().create(true).append(true).open(&file) {
                use std::io::Write;
                let _ = writeln!(log, "{} panic: {info}", chrono::Local::now().to_rfc3339());
            }
        }
        previous(info);
    }));
}

fn main() {
    let flag = std::env::var_os("JARVIS_ENABLE_TEST_PROFILE");
    let enabled = flag.as_deref() == Some(std::ffi::OsStr::new("1"));
    if flag.is_some() && !enabled {
        eprintln!("Invalid QA launch flag; no profile was opened");
        std::process::exit(2);
    }
    let qa_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join(".build/qa");
    let qa_dir = profiles::qa_directory(
        enabled,
        std::env::var_os("JARVIS_QA_DATA_DIR").map(PathBuf::from),
        &qa_root,
    )
    .unwrap_or_else(|error| {
        eprintln!("{error}");
        std::process::exit(2)
    });
    // Every validated QA launch is independent; never reveal a personal instance.
    let isolated_qa = qa_dir.is_some();
    if !isolated_qa {
        crash_safety();
    }
    let builder = if isolated_qa {
        tauri::Builder::default()
    } else {
        tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = placement::open(app, None, None);
                let _ = window.emit("window-hidden", false);
            }
        }))
    };
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::Builder::new().args(["--hidden"]).build())
        .setup(move |app| {
            let dir = qa_dir.clone().unwrap_or(app.path().app_data_dir()?);
            let database = Database::open(&dir).map_err(std::io::Error::other)?;
            if qa_dir.is_some() {
                database.set_value("profilePurpose", &json!("qa"))?;
                if let Some(window) = app.get_webview_window("main") {
                    window.set_title("J.A.R.V.I.S. — ISOLATED QA PROFILE")?;
                }
            } else if database.get_value("profilePurpose")? == "qa" {
                return Err(std::io::Error::other(
                    "This database is marked as QA; it cannot be opened as a personal profile",
                )
                .into());
            }
            let mut prefs = database.get_value("preferences").unwrap_or(Value::Null);
            if qa_dir.is_none() {
                let local_voice = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../../..")
                    .join("local-voice");
                if integrations::activate_local_jarvis_speech(&mut prefs, &local_voice)? {
                    database.set_value("preferences", &prefs)?;
                }
            }
            if qa_dir.is_none() {
                std::thread::spawn(windows::warm_voice);
            }
            if qa_dir.is_none() && (prefs["aiMode"] == "hybrid"
                || (prefs["aiMode"] != "claude" && prefs["aiMode"] != "chatgpt" && prefs["aiUrl"].as_str().unwrap_or("").is_empty()))
            {
                let warm_prefs = prefs.clone();
                std::thread::spawn(move || ollama::warm(&warm_prefs));
            }
            let retention = prefs["logRetentionDays"]
                .as_i64()
                .unwrap_or(30)
                .clamp(7, 365);
            let before = (Utc::now() - chrono::Duration::days(retention)).to_rfc3339();
            database
                .conn
                .execute(
                    "DELETE FROM records WHERE kind='activity' AND created_at<?1",
                    [before],
                )
                .ok();
            app.manage(NativeState {
                db: Mutex::new(database),
                approvals: Mutex::new(authorization::Broker::default()),
                executing: std::sync::atomic::AtomicBool::new(false),
                automation_busy: std::sync::atomic::AtomicBool::new(false),
                monitor: Mutex::new(None),
                speech: windows::Speech::default(),
                ai_process: Mutex::new(None),
                offline_process: Mutex::new(None),
                offline_epoch: std::sync::atomic::AtomicU64::new(0),
            });
            app.manage(placement::State::default());
            // Started with Windows: stay in the tray, listening for "wake up".
            if std::env::args().any(|a| a == "--hidden") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            } else {
                placement::open(app.handle(), None, Some(false))?;
            }
            // One-time: start with Windows so "wake up" works even after the window is closed.
            if qa_dir.is_none() {
                let native_state = app.state::<NativeState>();
                let db = &native_state.db;
                if let Ok(db) = db.lock() {
                    if db.get_value("wakeStartupEnabled").unwrap_or(Value::Null) != true {
                        let mut prefs = db.get_value("preferences").unwrap_or(Value::Null);
                        if prefs.is_object() && app.autolaunch().enable().is_ok() {
                            prefs["autostart"] = json!(true);
                            prefs["minimizeToTray"] = json!(true);
                            let _ = db.set_value("preferences", &prefs);
                            let _ = db.set_value("wakeStartupEnabled", &json!(true));
                        }
                    }
                };
            }
            placement::start(app.handle().clone());
            actions::recover(app.handle())?;
            runtime::start(app.handle().clone());
            if qa_dir.is_none() {
                mobile::start(app.handle().clone());
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    knowledge::space_guard(&handle);
                });
            }
            let show =
                tauri::menu::MenuItem::with_id(app, "show", "Open JARVIS", true, None::<&str>)?;
            let hide =
                tauri::menu::MenuItem::with_id(app, "hide", "Hide JARVIS", true, None::<&str>)?;
            let pause = tauri::menu::MenuItem::with_id(
                app,
                "pause",
                "Pause Listening",
                true,
                None::<&str>,
            )?;
            let settings =
                tauri::menu::MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit =
                tauri::menu::MenuItem::with_id(app, "quit", "Quit JARVIS", true, None::<&str>)?;
            let menu =
                tauri::menu::Menu::with_items(app, &[&show, &hide, &pause, &settings, &quit])?;
            let mut pixels = vec![0u8; 32 * 32 * 4];
            for y in 0..32 {
                for x in 0..32 {
                    let d = ((x as i32 - 16).pow(2) + (y as i32 - 16).pow(2)) as f64;
                    if (100.0..180.0).contains(&d) || (y > 8 && y < 25 && x > 10 && x < 22) {
                        let i = (y * 32 + x) * 4;
                        pixels[i] = 20;
                        pixels[i + 1] = 210;
                        pixels[i + 2] = 250;
                        pixels[i + 3] = 255;
                    }
                }
            }
            tauri::tray::TrayIconBuilder::new()
                .icon(tauri::image::Image::new_owned(pixels, 32, 32))
                .tooltip("JARVIS · Local personal assistant")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        let _ = placement::open(app, None, None);
                    }
                    "hide" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.hide();
                            let _ = w.emit("window-hidden", true);
                        }
                    }
                    "pause" => {
                        let _ = app.emit("tray-action", "pause");
                    }
                    "settings" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = placement::open(app, None, None);
                            let _ = w.emit("tray-action", "settings");
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Moved(_)) {
                placement::moved(window.app_handle());
            }
            if matches!(
                event,
                tauri::WindowEvent::Resized(_)
                    | tauri::WindowEvent::ScaleFactorChanged { .. }
                    | tauri::WindowEvent::Focused(true)
            ) {
                placement::changed(window.app_handle());
            }
            if matches!(event, tauri::WindowEvent::Focused(true)) {
                let _ = window.emit("window-hidden", false);
            }
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                let _ = window.emit("window-hidden", window.is_minimized().unwrap_or(false));
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<NativeState>();
                let keep = state
                    .db
                    .lock()
                    .ok()
                    .and_then(|db| db.get_value("preferences").ok())
                    .is_none_or(|s| s["minimizeToTray"] != false);
                if keep {
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = window.emit("window-hidden", true);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            sound_asset,
            active_window,
            wiki_lookup,
            mobile::mobile_reply,
            knowledge::knowledge_search,
            actions::action_prepare,
            actions::action_execute,
            actions::action_cancel,
            actions::action_history,
            actions::user_task_begin,
            actions::user_task_cancel,
            actions::record_log,
            records_list,
            memory_search,
            verified_skills_list,
            context_records,
            settings_get,
            monitor_list,
            monitor_fullscreen,
            monitor_windowed,
            window_geometry,
            installed_apps,
            diagnostics,
            automations_list,
            telemetry,
            security_status,
            tools_status,
            project_grant,
            project_inspect,
            project_read,
            project_file,
            document_read,
            screen_read,
            project_search,
            speech_status,
            speech_output_status,
            speech_pick_file,
            offline_speech_status,
            speech_microphone,
            ai_chat,
            ai_research,
            codex_connect,
            codex_status,
            ai_cancel,
            weather,
            google_connect,
            gmail_list,
            gmail_read,
            google_calendar,
            cached_integrations,
            backup_restore,
            backup_status,
            database_integrity,
            export_records,
            notify,
            voice_start,
            voice_stop,
            speak,
            speech_stop
        ])
        .build(tauri::generate_context!())
        .expect("JARVIS could not start. Check that the app data directory is writable.")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<NativeState>() {
                    let _ = intelligence::cancel(&state);
                    let _ = offline_speech::cancel(&state);
                    let _setup = state.speech.setup_gate.lock().ok();
                    state
                        .speech
                        .synth_epoch
                        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    let _ = windows::stop(&state.speech.recognizer);
                    let _ = windows::stop(&state.speech.synthesizer);
                }
            }
        });
}
