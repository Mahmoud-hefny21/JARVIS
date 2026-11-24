//! What he is doing, on every monitor: every 10 s JARVIS notes the visible windows (app, title, monitor) and
//! keeps a 7-day journal on this PC only (app data folder, never uploaded except as short context for an
//! answer he asked for). Paused in private mode; password managers, banking, sign-in pages and private
//! browsing are never written down.
use crate::db::Result;
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

static PAUSED: AtomicBool = AtomicBool::new(false);
static NOW: Mutex<Option<Value>> = Mutex::new(None);
const KEEP_DAYS: i64 = 7;

fn sensitive(app: &str, title: &str) -> bool {
    let t = format!("{app} {title}").to_lowercase();
    [
        "password", "passwort", "1password", "bitwarden", "keepass", "lastpass", "dashlane", "credential", "bank", "instapay", "vodafone cash",
        "paypal", "visa", "mastercard", "inprivate", "incognito", "private browsing", "sign in", "log in", "login", "otp", "verification code",
        "كلمة السر", "البنك",
    ]
    .iter()
    .any(|w| t.contains(w))
}

/// Visible top-level windows with their monitor (1 = leftmost), foreground first.
pub fn visible_windows() -> Vec<Value> {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows_sys::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, MonitorFromWindow, HDC, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowLongW, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
    };
    unsafe extern "system" fn add_monitor(m: HMONITOR, _: HDC, _: *mut RECT, data: LPARAM) -> BOOL {
        let list = &mut *(data as *mut Vec<(isize, i32)>);
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        GetMonitorInfoW(m, &mut info);
        list.push((m as isize, info.rcMonitor.left));
        1
    }
    unsafe extern "system" fn add_window(h: HWND, data: LPARAM) -> BOOL {
        let list = &mut *(data as *mut Vec<HWND>);
        if IsWindowVisible(h) != 0 && IsIconic(h) == 0 && (GetWindowLongW(h, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW) == 0 {
            list.push(h);
        }
        1
    }
    unsafe {
        let mut monitors: Vec<(isize, i32)> = Vec::new();
        EnumDisplayMonitors(std::ptr::null_mut(), std::ptr::null(), Some(add_monitor), &mut monitors as *mut _ as LPARAM);
        monitors.sort_by_key(|m| m.1);
        let mut handles: Vec<HWND> = Vec::new();
        EnumWindows(Some(add_window), &mut handles as *mut _ as LPARAM);
        let fg = GetForegroundWindow();
        let own = std::process::id();
        let mut out = Vec::new();
        for h in handles {
            let mut buf = [0u16; 512];
            let len = GetWindowTextW(h, buf.as_mut_ptr(), buf.len() as i32);
            let title = String::from_utf16_lossy(&buf[..len.max(0) as usize]);
            if title.trim().is_empty() || ["Program Manager", "Windows Input Experience", "Settings", "Microsoft Text Input Application"].contains(&title.as_str()) {
                continue;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(h, &mut pid);
            if pid == own {
                continue;
            }
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
            if app.is_empty() || ["TextInputHost", "ApplicationFrameHost", "ShellExperienceHost", "SearchHost", "StartMenuExperienceHost", "jarvis-desktop"].contains(&app.as_str()) {
                continue;
            }
            let m = MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST) as isize;
            let monitor = monitors.iter().position(|x| x.0 == m).map(|i| i + 1).unwrap_or(1);
            let hidden = sensitive(&app, &title);
            let entry = json!({"app": app, "title": if hidden { "(private)".to_owned() } else { title.chars().take(160).collect() }, "monitor": monitor, "active": h == fg});
            if h == fg {
                out.insert(0, entry);
            } else if out.len() < 14 {
                out.push(entry);
            }
        }
        out
    }
}

fn journal_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    Some(app.path().app_data_dir().ok()?.join("journal.jsonl"))
}

/// Starts the 10-second watcher. The journal records a line only when the active window changes,
/// plus a heartbeat every minute so time spent can be measured.
pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last_key = String::new();
        let mut last_write = chrono::Local::now();
        let mut ticks = 0u32;
        loop {
            std::thread::sleep(Duration::from_secs(10));
            if PAUSED.load(Ordering::Relaxed) {
                continue;
            }
            let windows = visible_windows();
            let idle = crate::idle_seconds();
            *NOW.lock().unwrap_or_else(|e| e.into_inner()) = Some(json!({"windows": windows, "idle": idle, "at": chrono::Local::now().to_rfc3339()}));
            let Some(active) = windows.iter().find(|w| w["active"] == true) else { continue };
            if idle > 300 {
                continue; // away from the laptop: not "doing" anything
            }
            let key = format!("{}|{}", active["app"], active["title"]);
            let now = chrono::Local::now();
            if key == last_key && (now - last_write).num_seconds() < 60 {
                continue;
            }
            last_key = key;
            last_write = now;
            let others: Vec<String> = windows.iter().filter(|w| w["active"] != true).take(6).map(|w| format!("{} on {}", w["app"].as_str().unwrap_or(""), w["monitor"])).collect();
            let line = json!({"at": now.to_rfc3339(), "app": active["app"], "title": active["title"], "monitor": active["monitor"], "also": others});
            if let Some(path) = journal_path(&app) {
                if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
                    let _ = writeln!(f, "{line}");
                }
                ticks += 1;
                if ticks % 360 == 0 {
                    prune(&path);
                }
            }
        }
    });
}
fn prune(path: &std::path::Path) {
    let cutoff = chrono::Local::now() - chrono::Duration::days(KEEP_DAYS);
    let Ok(file) = std::fs::File::open(path) else { return };
    let keep: Vec<String> = std::io::BufReader::new(file)
        .lines()
        .map_while(|l| l.ok())
        .filter(|l| serde_json::from_str::<Value>(l).ok().and_then(|v| v["at"].as_str().and_then(|a| chrono::DateTime::parse_from_rfc3339(a).ok())).is_some_and(|t| t > cutoff))
        .collect();
    let _ = std::fs::write(path, keep.join("\n") + "\n");
}

/// Journal entries between two local times (RFC 3339), oldest first, at most `limit`.
fn read_journal(app: &tauri::AppHandle, from: &str, to: &str, limit: usize) -> Vec<Value> {
    let (Ok(from), Ok(to)) = (chrono::DateTime::parse_from_rfc3339(from), chrono::DateTime::parse_from_rfc3339(to)) else { return vec![] };
    let Some(path) = journal_path(app) else { return vec![] };
    let Ok(file) = std::fs::File::open(path) else { return vec![] };
    let all: Vec<Value> = std::io::BufReader::new(file)
        .lines()
        .map_while(|l| l.ok())
        .filter_map(|l| serde_json::from_str::<Value>(&l).ok())
        .filter(|v| v["at"].as_str().and_then(|a| chrono::DateTime::parse_from_rfc3339(a).ok()).is_some_and(|t| t >= from && t <= to))
        .collect();
    let skip = all.len().saturating_sub(limit);
    all.into_iter().skip(skip).collect()
}

#[tauri::command]
pub fn screens_now() -> Value {
    NOW.lock().unwrap_or_else(|e| e.into_inner()).clone().unwrap_or(Value::Null)
}
#[tauri::command]
pub async fn journal_range(app: tauri::AppHandle, from: String, to: String) -> Result<Vec<Value>> {
    tauri::async_runtime::spawn_blocking(move || Ok(read_journal(&app, &from, &to, 4000))).await.map_err(|_| "Journal unavailable".to_string())?
}
#[tauri::command]
pub fn journal_pause(paused: bool) {
    PAUSED.store(paused, Ordering::Relaxed);
    if paused {
        *NOW.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}
#[tauri::command]
pub async fn journal_clear(app: tauri::AppHandle) -> Result<()> {
    if let Some(p) = journal_path(&app) {
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_windows_are_never_written_down() {
        assert!(sensitive("chrome", "Sign in - Google Accounts"));
        assert!(sensitive("Bitwarden", "Vault"));
        assert!(sensitive("msedge", "New InPrivate tab"));
        assert!(!sensitive("Code", "main.ts - JARVIS"));
    }
    #[test]
    #[ignore]
    fn live_windows() {
        for w in visible_windows() {
            eprintln!("{w}");
        }
    }
}
