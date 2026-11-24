//! JARVIS's own knowledge library (built by scripts/build-knowledge.mjs): Wikipedia lead summaries of the
//! ~10,000 vital articles in English plus Arabic, searched locally with SQLite FTS5. Read-only; works offline.
//! Also the 2 GB space guard for everything JARVIS stores.
use crate::db::Result;
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

const STOP_WORDS: &[&str] = &[
    "what", "who", "whom", "which", "when", "where", "why", "how", "is", "are", "was", "were", "the", "a", "an", "of", "in", "on", "at",
    "to", "for", "and", "or", "do", "does", "did", "tell", "me", "about", "explain", "describe", "please", "can", "you", "i", "my",
    "jarvis", "sir", "show", "give", "know", "it", "its", "this", "that", "be", "with", "from", "by", "as", "much", "many",
    "ما", "ماذا", "من", "مين", "هو", "هي", "في", "عن", "على", "ايه", "إيه", "اية", "ازاي", "إزاي", "يعني", "هل", "كام", "قولي",
    "اشرح", "عرفني", "ال", "و", "يا", "جارفيس", "ده", "دي", "مع", "الى", "إلى", "لي", "ليه", "امتى", "فين",
    "eh", "ya", "3an", "ezay", "meen", "fen", "emta", "leh", "2oly", "oly", "e3rafny", "ashra7", "eshra7",
];

fn library(app: &tauri::AppHandle) -> Option<PathBuf> {
    let file = app.path().app_data_dir().ok()?.join("knowledge.db");
    file.exists().then_some(file)
}

/// Words worth searching for: letters and digits, minus question words, in English, Arabic and Franco.
fn terms(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_alphanumeric())
        .map(|w| w.trim_start_matches("ال").to_lowercase())
        .filter(|w| w.chars().count() >= 2 && !STOP_WORDS.contains(&w.as_str()))
        .take(8)
        .collect()
}

/// Best matching articles for a question; titles weigh ten times the summary text.
pub fn search(app: &tauri::AppHandle, query: &str, limit: usize) -> Result<Vec<Value>> {
    let Some(file) = library(app) else { return Ok(vec![]) };
    let words = terms(query);
    if words.is_empty() {
        return Ok(vec![]);
    }
    let fts = words.iter().map(|w| format!("\"{}\"", w.replace('"', ""))).collect::<Vec<_>>().join(" OR ");
    let conn = Connection::open_with_flags(&file, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|_| "Knowledge library unavailable")?;
    let mut statement = conn
        .prepare(
            "SELECT a.title, a.summary, a.url, a.lang, bm25(articles_fts, 10.0, 1.0) AS score
             FROM articles_fts JOIN articles a ON a.id = articles_fts.rowid
             WHERE articles_fts MATCH ?1 ORDER BY score LIMIT ?2",
        )
        .map_err(|_| "Knowledge library unavailable")?;
    let rows = statement
        .query_map(rusqlite::params![fts, limit.clamp(1, 10) as i64], |row| {
            let title: String = row.get(0)?;
            Ok(json!({"title": title, "summary": row.get::<_, String>(1)?, "url": row.get::<_, String>(2)?, "lang": row.get::<_, String>(3)?}))
        })
        .map_err(|_| "Knowledge library unavailable")?;
    // Keep results whose title shares a searched word, so a passing mention doesn't pose as the answer.
    Ok(rows
        .flatten()
        .filter(|r| {
            let title = r["title"].as_str().unwrap_or("").to_lowercase();
            words.iter().any(|w| title.contains(w.as_str()))
        })
        .collect())
}

#[tauri::command]
pub async fn knowledge_search(app: tauri::AppHandle, query: String) -> Result<Vec<Value>> {
    tauri::async_runtime::spawn_blocking(move || search(&app, &query.chars().take(300).collect::<String>(), 3))
        .await
        .map_err(|_| "Knowledge library unavailable".to_string())?
}

fn size_of(path: &Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return 0 };
    if meta.is_file() {
        return meta.len();
    }
    if !meta.is_dir() {
        return 0;
    }
    std::fs::read_dir(path).map(|entries| entries.flatten().map(|e| size_of(&e.path())).sum()).unwrap_or(0)
}

/// Keeps JARVIS (app, data, library, caches, backups) under 2 GB: above 1.8 GB it removes the oldest
/// backups and the speech cache. Returns the total in bytes after any trimming.
pub fn space_guard(app: &tauri::AppHandle) -> u64 {
    const LIMIT: u64 = 1_800 * 1024 * 1024;
    let data = app.path().app_data_dir().unwrap_or_default();
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_default();
    let places = [data.clone(), local.join("JARVIS"), local.join("com.jarvis.personal")];
    let total = |places: &[PathBuf]| places.iter().map(|p| size_of(p)).sum::<u64>();
    let mut used = total(&places);
    if used <= LIMIT {
        return used;
    }
    let _ = std::fs::remove_dir_all(local.join("JARVIS").join("speech-cache"));
    if let Ok(entries) = std::fs::read_dir(data.join("backups")) {
        let mut backups: Vec<_> = entries.flatten().filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path()))).collect();
        backups.sort();
        for (_, oldest) in backups.iter().take(backups.len().saturating_sub(2)) {
            used = total(&places);
            if used <= LIMIT {
                break;
            }
            let _ = std::fs::remove_file(oldest);
        }
    }
    total(&places)
}
