//! PC control by voice (brightness, dark mode, Wi-Fi/Bluetooth, screenshots, finding files, tidying Downloads,
//! cleaning temp files), his money notebook, and the news. Every PowerShell script here is fixed text; only
//! numbers or on/off reach it, never words he said. Moving or deleting files asks him first.
use crate::db::Result;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::Manager;

fn ps(script: &str, timeout: u64) -> Result<String> {
    let mut command = crate::windows::powershell();
    command.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script]);
    crate::windows::run(&mut command, Duration::from_secs(timeout))
}

const RADIO: &str = r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$g = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $g.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
$r = $radios | Where-Object { $_.Kind -eq '__KIND__' } | Select-Object -First 1
if (-not $r) { 'missing'; exit }
$s = Await ($r.SetStateAsync('__STATE__')) ([Windows.Devices.Radios.RadioAccessStatus])
"$s"
"#;

const SCREENSHOT: &str = r#"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$dir = Join-Path ([Environment]::GetFolderPath('MyPictures')) 'Screenshots'
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir ('JARVIS ' + (Get-Date -Format 'yyyy-MM-dd HH.mm.ss') + '.png')
$bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
$file
"#;

/// One fixed PC operation. `value` is a number (brightness) or on/off.
pub fn control(app: &tauri::AppHandle, op: &str, value: &str) -> Result<Value> {
    let on = matches!(value, "on" | "true" | "1");
    match op {
        "brightness" => {
            let current: i64 = ps("(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1).CurrentBrightness", 10)?
                .trim()
                .parse()
                .map_err(|_| "This screen's brightness can't be controlled from Windows (external monitor?)")?;
            let target = match value {
                "up" => current + 20,
                "down" => current - 20,
                v => v.parse::<i64>().map_err(|_| "Brightness must be a number")?,
            }
            .clamp(5, 100);
            ps(&format!("$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Select-Object -First 1; Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{{Timeout=1; Brightness=[byte]{target}}} | Out-Null"), 10)?;
            Ok(json!({"brightness": target}))
        }
        "dark" => {
            let light = if on { 0 } else { 1 };
            ps(&format!("$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'; Set-ItemProperty $k AppsUseLightTheme {light} -Type DWord; Set-ItemProperty $k SystemUsesLightTheme {light} -Type DWord"), 10)?;
            Ok(json!({"dark": on}))
        }
        "wifi" | "bluetooth" => {
            let kind = if op == "wifi" { "WiFi" } else { "Bluetooth" };
            let out = ps(&RADIO.replace("__KIND__", kind).replace("__STATE__", if on { "On" } else { "Off" }), 20)?;
            if out.trim() != "Allowed" {
                // Windows refused or there is no such radio: open the settings page instead.
                let page = if op == "wifi" { "ms-settings:network-wifi" } else { "ms-settings:bluetooth" };
                let _ = std::process::Command::new("explorer").arg(page).spawn();
                return Ok(json!({"opened": page}));
            }
            Ok(json!({op: on}))
        }
        "screenshot" => {
            let file = ps(SCREENSHOT, 20)?.trim().to_owned();
            Ok(json!({"file": file}))
        }
        "tidy-downloads" => tidy_downloads(app),
        "clean-temp" => clean_temp(app),
        _ => Err("Unknown PC operation".into()),
    }
}

fn user_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let p = app.path();
    [p.desktop_dir(), p.document_dir(), p.download_dir(), p.picture_dir(), p.video_dir(), p.audio_dir()]
        .into_iter()
        .flatten()
        .filter(|d| d.exists())
        .collect()
}
const RISKY: &[&str] = &["exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "lnk", "reg", "url", "pif", "cpl", "jar", "msc", "appx", "msix"];

/// Files in his own folders whose names contain every word, newest first.
pub fn find_files(app: &tauri::AppHandle, query: &str) -> Result<Vec<Value>> {
    let words: Vec<String> = query.to_lowercase().split_whitespace().filter(|w| w.len() > 1).map(str::to_owned).collect();
    if words.is_empty() {
        return Ok(vec![]);
    }
    let mut hits: Vec<(SystemTime, PathBuf)> = Vec::new();
    let mut stack: Vec<(PathBuf, u8)> = user_roots(app).into_iter().map(|d| (d, 0)).collect();
    let mut visited = 0;
    while let Some((dir, depth)) = stack.pop() {
        visited += 1;
        if visited > 20_000 {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_lowercase();
            if name.starts_with('.') || name == "node_modules" || name == "appdata" {
                continue;
            }
            let p = e.path();
            let Ok(meta) = e.metadata() else { continue };
            if meta.is_dir() {
                if depth < 6 {
                    stack.push((p.clone(), depth + 1));
                }
            }
            if words.iter().all(|w| name.contains(w)) {
                hits.push((meta.modified().unwrap_or(SystemTime::UNIX_EPOCH), p));
            }
        }
    }
    hits.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(hits
        .into_iter()
        .take(8)
        .map(|(_, p)| json!({"path": p, "name": p.file_name().map(|n| n.to_string_lossy().into_owned()), "folder": p.is_dir()}))
        .collect())
}
/// Opens a file or folder found in his own folders; programs and scripts are never launched this way.
pub fn open_found(app: &tauri::AppHandle, path: &str) -> Result<()> {
    let p = Path::new(path).canonicalize().map_err(|_| "That file is gone")?;
    if !user_roots(app).iter().filter_map(|r| r.canonicalize().ok()).any(|r| p.starts_with(r)) {
        return Err("I only open files from your own folders, sir".into());
    }
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if p.is_file() && RISKY.contains(&ext.as_str()) {
        let _ = std::process::Command::new("explorer").arg(format!("/select,{}", p.display())).spawn();
        return Err("That's a program or script, so I showed it in its folder instead of running it, sir".into());
    }
    std::process::Command::new("explorer").arg(&p).spawn().map_err(|_| "Couldn't open it")?;
    Ok(())
}

fn category(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "heic" | "bmp" | "svg" => "Images",
        "pdf" | "doc" | "docx" | "ppt" | "pptx" | "xls" | "xlsx" | "txt" | "md" | "csv" | "odt" => "Documents",
        "mp4" | "mkv" | "mov" | "avi" | "webm" => "Videos",
        "mp3" | "wav" | "m4a" | "flac" | "ogg" => "Audio",
        "zip" | "rar" | "7z" | "tar" | "gz" => "Archives",
        "exe" | "msi" | "msix" | "appx" => "Installers",
        _ => "Other",
    }
}
fn tidy_downloads(app: &tauri::AppHandle) -> Result<Value> {
    let dir = app.path().download_dir().map_err(|_| "Downloads folder unavailable")?;
    let recent = SystemTime::now() - Duration::from_secs(600);
    let files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(|_| "Downloads folder unavailable")?
        .flatten()
        .filter(|e| e.metadata().is_ok_and(|m| m.is_file() && m.modified().is_ok_and(|t| t < recent)))
        .map(|e| e.path())
        .filter(|p| !p.extension().is_some_and(|x| ["crdownload", "part", "tmp", "ini"].contains(&x.to_string_lossy().to_lowercase().as_str())))
        .collect();
    if files.is_empty() {
        return Ok(json!({"moved": 0}));
    }
    if !crate::confirmed(app, "Tidy Downloads", &format!("Sort {} files in Downloads into folders (Images, Documents, Videos, Audio, Archives, Installers, Other)? Nothing is deleted.", files.len())) {
        return Err("Cancelled, sir".into());
    }
    let mut moved = 0;
    for f in files {
        let ext = f.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        let target_dir = dir.join(category(&ext));
        let _ = std::fs::create_dir_all(&target_dir);
        let name = f.file_name().unwrap_or_default().to_string_lossy().into_owned();
        let mut target = target_dir.join(&name);
        let mut n = 1;
        while target.exists() {
            let stem = Path::new(&name).file_stem().unwrap_or_default().to_string_lossy().into_owned();
            target = target_dir.join(if ext.is_empty() { format!("{stem} ({n})") } else { format!("{stem} ({n}).{ext}") });
            n += 1;
        }
        if std::fs::rename(&f, &target).is_ok() {
            moved += 1;
        }
    }
    Ok(json!({"moved": moved}))
}
fn clean_temp(app: &tauri::AppHandle) -> Result<Value> {
    let dir = std::env::temp_dir();
    let old = SystemTime::now() - Duration::from_secs(2 * 86400);
    let mut size = 0u64;
    let mut files = Vec::new();
    let mut stack = vec![dir.clone()];
    while let Some(d) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&d) else { continue };
        for e in entries.flatten() {
            let Ok(meta) = e.metadata() else { continue };
            if meta.is_dir() {
                stack.push(e.path());
            } else if meta.modified().is_ok_and(|t| t < old) {
                size += meta.len();
                files.push(e.path());
            }
        }
    }
    if files.is_empty() {
        return Ok(json!({"freedMB": 0, "files": 0}));
    }
    if !crate::confirmed(app, "Clean temporary files", &format!("Delete {} temporary files older than 2 days ({:.0} MB) from {}? Files in use are skipped.", files.len(), size as f64 / 1e6, dir.display())) {
        return Err("Cancelled, sir".into());
    }
    let mut freed = 0u64;
    let mut count = 0;
    for f in files {
        let len = f.metadata().map(|m| m.len()).unwrap_or(0);
        if std::fs::remove_file(&f).is_ok() {
            freed += len;
            count += 1;
        }
    }
    // Remove folders left empty (bottom-up is unnecessary: remove_dir only succeeds on empty ones).
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let _ = std::fs::remove_dir(e.path());
        }
    }
    Ok(json!({"freedMB": (freed as f64 / 1e6).round(), "files": count}))
}

// ---------- Money notebook (encrypted database, one JSON document) ----------
fn money_load(app: &tauri::AppHandle) -> Result<Value> {
    let state = app.state::<crate::NativeState>();
    let v = state.db.lock().map_err(|_| "Database unavailable")?.get_value("money")?;
    Ok(if v.is_object() { v } else { json!({"expenses": [], "budget": 0, "subscriptions": [], "goals": []}) })
}
fn money_save(app: &tauri::AppHandle, value: Value) -> Result<()> {
    if !value.is_object() || value.to_string().len() > 1_000_000 {
        return Err("Invalid money data".into());
    }
    let state = app.state::<crate::NativeState>();
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    db.set_value("money", &value)
}

// ---------- News ----------
/// Top headlines from Google News for Egypt (English or Arabic), optionally on a topic.
pub fn news(lang: &str, topic: &str) -> Result<Vec<Value>> {
    let (hl, ceid) = if lang == "ar" { ("ar", "EG:ar") } else { ("en-EG", "EG:en") };
    let url = if topic.trim().is_empty() {
        format!("https://news.google.com/rss?hl={hl}&gl=EG&ceid={ceid}")
    } else {
        let q: String = url::form_urlencoded::byte_serialize(topic.trim().as_bytes()).collect();
        format!("https://news.google.com/rss/search?q={q}+when:2d&hl={hl}&gl=EG&ceid={ceid}")
    };
    let xml = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|_| "Network unavailable")?
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
        .map_err(|_| "The news service is unreachable")?;
    let tag = |s: &str, t: &str| -> String {
        s.split(&format!("<{t}>")).nth(1).and_then(|x| x.split(&format!("</{t}>")).next()).unwrap_or("").replace("<![CDATA[", "").replace("]]>", "")
    };
    Ok(xml
        .split("<item>")
        .skip(1)
        .take(10)
        .map(|item| {
            let title = crate::brain::html_text(&tag(item, "title"));
            let source = crate::brain::html_text(item.split("<source").nth(1).and_then(|x| x.split_once('>')).and_then(|(_, x)| x.split("</source>").next()).unwrap_or(""));
            // Titles end with " - Source"; keep the headline only.
            let headline = title.strip_suffix(&format!(" - {source}")).unwrap_or(&title).to_owned();
            json!({"title": headline, "source": source, "url": tag(item, "link"), "date": tag(item, "pubDate")})
        })
        .collect())
}

#[tauri::command]
pub async fn pc_control(app: tauri::AppHandle, op: String, value: Option<String>) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || control(&app, &op, value.as_deref().unwrap_or(""))).await.map_err(|_| "PC control failed".to_string())?
}
#[tauri::command]
pub async fn files_find(app: tauri::AppHandle, query: String) -> Result<Vec<Value>> {
    tauri::async_runtime::spawn_blocking(move || find_files(&app, &query)).await.map_err(|_| "File search failed".to_string())?
}
#[tauri::command]
pub async fn file_open_found(app: tauri::AppHandle, path: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || open_found(&app, &path)).await.map_err(|_| "Open failed".to_string())?
}
#[tauri::command]
pub fn money_get(app: tauri::AppHandle) -> Result<Value> {
    money_load(&app)
}
#[tauri::command]
pub fn money_put(app: tauri::AppHandle, value: Value) -> Result<()> {
    money_save(&app, value)
}
#[tauri::command]
pub async fn news_headlines(lang: String, topic: Option<String>) -> Result<Vec<Value>> {
    tauri::async_runtime::spawn_blocking(move || news(&lang, topic.as_deref().unwrap_or(""))).await.map_err(|_| "News failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn downloads_are_sorted_by_type() {
        assert_eq!(category("pdf"), "Documents");
        assert_eq!(category("jpg"), "Images");
        assert_eq!(category("exe"), "Installers");
        assert_eq!(category("xyz"), "Other");
    }
    #[test]
    #[ignore]
    fn live_brightness_read_and_screenshot() {
        let b = ps("(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1).CurrentBrightness", 10);
        eprintln!("brightness now: {:?}", b);
        let file = ps(SCREENSHOT, 20).unwrap();
        let file = file.trim();
        eprintln!("screenshot: {} ({} bytes)", file, std::fs::metadata(file).map(|m| m.len()).unwrap_or(0));
        assert!(std::fs::metadata(file).is_ok_and(|m| m.len() > 10_000));
        std::fs::remove_file(file).unwrap();
    }
    #[test]
    #[ignore]
    fn live_news() {
        let n = news("en", "").unwrap();
        eprintln!("{} headlines; first: {}", n.len(), n.first().map(|v| v.to_string()).unwrap_or_default());
        assert!(n.len() >= 5);
        let a = news("ar", "الأهلي").unwrap();
        eprintln!("{} Arabic; first: {}", a.len(), a.first().map(|v| v.to_string()).unwrap_or_default());
    }
}
