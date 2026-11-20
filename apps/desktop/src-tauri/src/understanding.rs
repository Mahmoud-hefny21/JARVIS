use crate::db::Result;
use serde_json::{json, Value};
use std::{path::Path, time::Duration};
use tauri_plugin_dialog::DialogExt;

pub fn path_is_excluded(target: &Path, excluded: &Value) -> bool {
    fn normalized(path: &Path) -> String {
        let value = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        value
            .to_string_lossy()
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase()
    }
    let target = normalized(target);
    excluded.as_array().is_some_and(|paths| {
        paths.iter().filter_map(Value::as_str).any(|value| {
            let root = normalized(Path::new(value));
            target == root || target.starts_with(&(root + "\\"))
        })
    })
}

pub fn check_project_privacy(root: &Path, preferences: &Value) -> Result<()> {
    let paths = &preferences["excludedPaths"];
    if path_is_excluded(root, paths)
        || paths.as_array().is_some_and(|rows| {
            rows.iter()
                .filter_map(Value::as_str)
                .any(|path| path_is_excluded(Path::new(path), &json!([root.to_string_lossy()])))
        })
    {
        return Err(
            "This project overlaps an excluded folder; review privacy settings before accessing it"
                .into(),
        );
    }
    Ok(())
}
pub fn ocr(mode: &str, path: Option<&Path>) -> Result<Value> {
    let mut command = crate::windows::powershell();
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        include_str!("understanding.ps1"),
    ]);
    command.env(
        "JARVIS_DOCUMENT_CONFIG",
        json!({"mode":mode,"path":path.map(|p|p.to_string_lossy())}).to_string(),
    );
    serde_json::from_str(&crate::windows::run(&mut command, Duration::from_secs(40))?)
        .map_err(|_| "Windows OCR returned invalid output".into())
}
pub fn browser_read() -> Result<String> {
    let mut command = crate::windows::powershell();
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        include_str!("browser-read.ps1"),
    ]);
    let value: Value =
        serde_json::from_str(&crate::windows::run(&mut command, Duration::from_secs(15))?)
            .map_err(|_| "Browser accessibility returned invalid output")?;
    let text = value["text"]
        .as_str()
        .ok_or("Browser page text unavailable")?;
    if text.len() > 80_000 {
        return Err("Browser page text exceeded the local limit".into());
    }
    Ok(text.to_owned())
}
pub fn browser_scroll(direction: &str) -> Result<Value> {
    if !["up", "down"].contains(&direction) {
        return Err("Browser scroll direction is not allowed".into());
    }
    let mut command = crate::windows::powershell();
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        include_str!("browser-scroll.ps1"),
    ]);
    command.env("JARVIS_BROWSER_SCROLL", direction);
    let value: Value =
        serde_json::from_str(&crate::windows::run(&mut command, Duration::from_secs(15))?)
            .map_err(|_| "Browser scrolling returned invalid output")?;
    if value["verified"] != true || value["direction"] != direction {
        return Err("Browser scrolling could not be verified".into());
    }
    Ok(value)
}
pub fn browser_activate_link(label: &str) -> Result<Value> {
    if label.trim().is_empty() || label.chars().count() > 160 || label.chars().any(char::is_control)
    {
        return Err("Browser link label is invalid".into());
    }
    let mut command = crate::windows::powershell();
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        include_str!("browser-link.ps1"),
    ]);
    command.env("JARVIS_BROWSER_LINK_LABEL", label.trim());
    let value: Value =
        serde_json::from_str(&crate::windows::run(&mut command, Duration::from_secs(15))?)
            .map_err(|_| "Browser link activation returned invalid output")?;
    if value["invoked"] != true || value["label"] != label.trim() {
        return Err("The requested browser link activation could not be verified".into());
    }
    Ok(value)
}
pub fn browser_control(request: &Value) -> Result<Value> {
    let kind = request["kind"]
        .as_str()
        .ok_or("Browser control kind unavailable")?;
    let label = request["label"]
        .as_str()
        .ok_or("Browser control label unavailable")?;
    let value = request["value"].as_str().unwrap_or("");
    if !["button", "fill"].contains(&kind)
        || label.trim().is_empty()
        || label.chars().count() > 120
        || label.chars().any(char::is_control)
        || value.chars().count() > 2000
        || value.chars().any(char::is_control)
        || (kind == "button" && request["value"].is_string())
    {
        return Err("Browser control request is outside the supported boundary".into());
    }
    let mut command = crate::windows::powershell();
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        include_str!("browser-control.ps1"),
    ]);
    command.env("JARVIS_BROWSER_CONTROL", request.to_string());
    let result: Value =
        serde_json::from_str(&crate::windows::run(&mut command, Duration::from_secs(15))?)
            .map_err(|_| "Browser control returned invalid output")?;
    if result["verified"] != true || result["kind"] != kind || result["label"] != label.trim() {
        return Err("The browser control did not verify against the requested label".into());
    }
    Ok(result)
}
pub fn document(app: &tauri::AppHandle) -> Result<Value> {
    let path = app
        .dialog()
        .file()
        .set_title("Read this document locally; nothing is uploaded")
        .add_filter(
            "Local documents",
            &["txt", "md", "pdf", "json", "csv", "log"],
        )
        .blocking_pick_file()
        .ok_or("Document selection cancelled")?
        .into_path()
        .map_err(|_| "Not a local file")?
        .canonicalize()
        .map_err(|_| "Document unavailable")?;
    let settings = crate::integrations::settings(app)?;
    if path_is_excluded(&path, &settings["excludedPaths"]) {
        return Err("This folder is excluded by your privacy settings".into());
    }
    if path.ancestors().any(|p| {
        p.file_name().is_some_and(|s| {
            let n = s.to_string_lossy().to_lowercase();
            n.starts_with('.')
                || ["appdata", "windows", "programdata"].contains(&n.as_str())
                || ["credential", "secret", "token", "password"]
                    .iter()
                    .any(|s| n.contains(s))
        })
    }) {
        return Err("Sensitive or system locations are excluded".into());
    }
    if std::fs::metadata(&path)
        .map_err(|_| "Document unavailable")?
        .len()
        > 20 * 1024 * 1024
    {
        return Err("Document exceeds 20 MB limit".into());
    }
    if path
        .extension()
        .is_some_and(|x| x.eq_ignore_ascii_case("pdf"))
    {
        return ocr("pdf", Some(&path));
    }
    let bytes = std::fs::read(&path).map_err(|_| "Cannot read document")?;
    if bytes.len() > 256_000 {
        return Err("Text document exceeds 256 KB limit".into());
    }
    let text = String::from_utf8(bytes).map_err(|_| "Document must be UTF-8 text or PDF")?;
    Ok(
        json!({"text":text.chars().take(20000).collect::<String>(),"engine":"Local UTF-8 reader","limit":"First 20,000 characters. Nothing uploaded."}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn project_read_access_fails_closed_when_any_excluded_folder_overlaps() {
        let prefs = json!({"excludedPaths":[r"C:\Work\Private"]});
        assert!(check_project_privacy(Path::new(r"C:\Work"), &prefs).is_err());
        assert!(check_project_privacy(Path::new(r"C:\Work\Private\Nested"), &prefs).is_err());
        assert!(check_project_privacy(Path::new(r"C:\Work\Public"), &prefs).is_ok());
    }
    #[test]
    fn excluded_paths_match_a_folder_and_its_children_only() {
        let paths = json!([r"C:\Users\Sir\Private"]);
        assert!(path_is_excluded(
            Path::new(r"C:\Users\Sir\Private\notes.txt"),
            &paths
        ));
        assert!(path_is_excluded(Path::new(r"C:\Users\Sir\Private"), &paths));
        assert!(!path_is_excluded(
            Path::new(r"C:\Users\Sir\Private2\notes.txt"),
            &paths
        ));
        assert!(!path_is_excluded(
            Path::new(r"C:\Users\Sir\Work\notes.txt"),
            &paths
        ));
    }
}
