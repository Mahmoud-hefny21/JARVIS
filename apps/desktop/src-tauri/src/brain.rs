//! What JARVIS looks at before it answers, beyond the model itself (all free):
//! live web search (DuckDuckGo, no key), his own course files (Documents\JARVIS Courses, indexed locally
//! with SQLite FTS5) and a second-opinion check of hard answers by another free Groq model.
use crate::db::Result;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::Manager;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const REVIEW_MODEL: &str = "qwen/qwen3-32b";
const FALLBACK_REVIEW_MODEL: &str = "openai/gpt-oss-120b";

fn http(timeout: u64) -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout))
        .user_agent(UA)
        .build()
        .map_err(|_| "Network unavailable".into())
}

/// Readable text of an HTML page: drops scripts, styles and tags, decodes common entities, squeezes spaces.
pub fn html_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 3);
    let lower = html.to_lowercase();
    let mut i = 0;
    let bytes = html.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b'<' {
            let rest = &lower[i..];
            let skip_to = ["script", "style", "noscript", "svg", "head"].iter().find_map(|t| {
                rest.strip_prefix('<')
                    .filter(|r| r.starts_with(t))
                    .and_then(|_| rest.find(&format!("</{t}>")).map(|e| e + t.len() + 3))
            });
            if let Some(n) = skip_to {
                i += n;
                continue;
            }
            match html[i..].find('>') {
                Some(e) => {
                    i += e + 1;
                    out.push(' ');
                }
                None => break,
            }
        } else {
            let next = html[i..].find('<').map(|n| i + n).unwrap_or(html.len());
            out.push_str(&html[i..next]);
            i = next;
        }
    }
    let out = out
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ");
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Top results from DuckDuckGo's plain HTML page: [{title, url, snippet}].
fn ddg(query: &str) -> Result<Vec<Value>> {
    let html = http(6)?
        .post("https://html.duckduckgo.com/html/")
        .form(&[("q", query), ("kl", "wt-wt")])
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
        .map_err(|_| "Web search is unreachable")?;
    let mut results = Vec::new();
    for block in html.split("class=\"result__a\"").skip(1).take(6) {
        let href = block.split("href=\"").nth(1).and_then(|s| s.split('"').next()).unwrap_or("");
        let href = href.replace("&amp;", "&");
        // Links go through a DuckDuckGo redirect: the real address is its "uddg" parameter.
        let full = if href.starts_with("//") { format!("https:{href}") } else { href.clone() };
        let real = url::Url::parse(&full)
            .ok()
            .and_then(|u| u.query_pairs().find(|(k, _)| k == "uddg").map(|(_, v)| v.into_owned()))
            .unwrap_or(full);
        if !real.starts_with("http") || real.contains("duckduckgo.com/y.js") {
            continue;
        }
        let title = block.split('>').nth(1).and_then(|s| s.split("</a").next()).map(html_text).unwrap_or_default();
        let snippet = block
            .split("class=\"result__snippet\"")
            .nth(1)
            .and_then(|s| s.split_once('>'))
            .and_then(|(_, s)| s.split("</a>").next())
            .map(html_text)
            .unwrap_or_default();
        results.push(json!({"title": title, "url": real, "snippet": snippet}));
    }
    Ok(results)
}

/// Searches the web and reads the two best pages, within about seven seconds in total.
pub fn web_search(query: &str) -> Result<Value> {
    let query: String = query.chars().take(200).collect();
    let started = Instant::now();
    // DuckDuckGo sometimes turns a request away; one quick retry nearly always gets through.
    let mut results = match ddg(&query) {
        Ok(r) if !r.is_empty() => r,
        _ => {
            std::thread::sleep(Duration::from_millis(400));
            ddg(&query)?
        }
    };
    let pages: Vec<(usize, String)> = std::thread::scope(|s| {
        let jobs: Vec<_> = results
            .iter()
            .take(2)
            .enumerate()
            .map(|(i, r)| {
                let url = r["url"].as_str().unwrap_or("").to_owned();
                s.spawn(move || {
                    let text = http(4)
                        .ok()
                        .and_then(|c| c.get(&url).send().ok())
                        .filter(|r| r.status().is_success())
                        .filter(|r| r.headers().get("content-type").and_then(|v| v.to_str().ok()).is_some_and(|t| t.contains("html")))
                        .and_then(|r| r.text().ok())
                        .map(|h| html_text(&h))
                        .unwrap_or_default();
                    (i, text)
                })
            })
            .collect();
        jobs.into_iter().filter_map(|j| j.join().ok()).collect()
    });
    for (i, text) in pages {
        if text.len() > 200 {
            results[i]["page"] = json!(text.chars().take(3500).collect::<String>());
        }
    }
    Ok(json!({"query": query, "results": results, "ms": started.elapsed().as_millis() as u64}))
}

// ---------- His course files ----------

pub fn courses_folder(app: &tauri::AppHandle) -> Result<PathBuf> {
    let dir = app.path().document_dir().map_err(|_| "Documents folder unavailable")?.join("JARVIS Courses");
    let _ = std::fs::create_dir_all(&dir);
    Ok(dir)
}
fn courses_db(app: &tauri::AppHandle) -> Result<Connection> {
    let file = app.path().app_data_dir().map_err(|_| "App data folder unavailable")?.join("courses.db");
    let conn = Connection::open(file).map_err(|_| "Course index unavailable")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, modified INTEGER, chunks INTEGER);
         CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(path UNINDEXED, name, body, tokenize='unicode61 remove_diacritics 2');",
    )
    .map_err(|_| "Course index unavailable")?;
    Ok(conn)
}
fn file_text(path: &std::path::Path) -> Option<String> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    match ext.as_str() {
        "txt" | "md" | "csv" => std::fs::read(path).ok().filter(|b| b.len() < 4_000_000).map(|b| String::from_utf8_lossy(&b).into_owned()),
        "html" | "htm" => std::fs::read_to_string(path).ok().map(|h| html_text(&h)),
        // PDFs (lecture slides, notes, scans) are read by Windows' own OCR, on this PC.
        "pdf" => crate::understanding::ocr("pdf", Some(path)).ok().and_then(|v| v["text"].as_str().map(str::to_owned)),
        _ => None,
    }
}
/// Pieces of about 1,200 characters on sentence or line boundaries, so a search returns a usable passage.
fn chunks(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for piece in text.split_inclusive(['\n', '.', '?', '!', '؟']) {
        cur.push_str(piece);
        if cur.chars().count() > 1200 {
            out.push(cur.split_whitespace().collect::<Vec<_>>().join(" "));
            cur.clear();
        }
    }
    if cur.trim().len() > 40 {
        out.push(cur.split_whitespace().collect::<Vec<_>>().join(" "));
    }
    out
}
/// Indexes new or changed files in the courses folder (and forgets deleted ones). Returns counts.
pub fn courses_index(app: &tauri::AppHandle) -> Result<Value> {
    let root = courses_folder(app)?;
    let mut conn = courses_db(app)?;
    let mut seen = Vec::new();
    let mut stack = vec![root.clone()];
    let (mut added, mut files) = (0, 0);
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let Ok(meta) = e.metadata() else { continue };
            if meta.len() > 60 * 1024 * 1024 {
                continue;
            }
            let modified = meta.modified().ok().and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0);
            let key = p.to_string_lossy().into_owned();
            seen.push(key.clone());
            files += 1;
            let known: Option<i64> = conn.query_row("SELECT modified FROM files WHERE path=?1", [&key], |r| r.get(0)).ok();
            if known == Some(modified) {
                continue;
            }
            let Some(text) = file_text(&p) else { continue };
            let name = p.strip_prefix(&root).unwrap_or(&p).to_string_lossy().into_owned();
            let parts = chunks(&text);
            let tx = conn.transaction().map_err(|_| "Course index unavailable")?;
            tx.execute("DELETE FROM chunks WHERE path=?1", [&key]).ok();
            for c in &parts {
                tx.execute("INSERT INTO chunks(path,name,body) VALUES(?1,?2,?3)", params![key, name, c]).ok();
            }
            tx.execute("INSERT OR REPLACE INTO files(path,modified,chunks) VALUES(?1,?2,?3)", params![key, modified, parts.len() as i64]).ok();
            tx.commit().map_err(|_| "Course index unavailable")?;
            added += 1;
        }
    }
    let stale: Vec<String> = conn
        .prepare("SELECT path FROM files")
        .and_then(|mut s| s.query_map([], |r| r.get::<_, String>(0)).and_then(|rows| rows.collect()))
        .unwrap_or_default();
    for p in stale.iter().filter(|p| !seen.contains(p)) {
        conn.execute("DELETE FROM chunks WHERE path=?1", [p]).ok();
        conn.execute("DELETE FROM files WHERE path=?1", [p]).ok();
    }
    Ok(json!({"folder": root, "files": files, "updated": added}))
}
/// Best passages from his course files for a question.
pub fn courses_search(app: &tauri::AppHandle, query: &str) -> Result<Vec<Value>> {
    let conn = courses_db(app)?;
    let words: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 3)
        .map(|w| format!("\"{}\"", w.to_lowercase()))
        .take(10)
        .collect();
    if words.is_empty() {
        return Ok(vec![]);
    }
    let mut stmt = conn
        .prepare("SELECT name, body, bm25(chunks, 0.0, 5.0, 1.0) AS rank FROM chunks WHERE chunks MATCH ?1 ORDER BY rank LIMIT 3")
        .map_err(|_| "Course index unavailable")?;
    let rows = stmt
        .query_map([words.join(" OR ")], |r| Ok(json!({"file": r.get::<_, String>(0)?, "text": r.get::<_, String>(1)?, "rank": r.get::<_, f64>(2)?})))
        .map_err(|_| "Course search failed")?;
    // bm25 is negative: closer to zero means a weak match; keep only passages that share real words.
    Ok(rows.flatten().filter(|v| v["rank"].as_f64().unwrap_or(0.0) < -1.0).collect())
}

// ---------- Second opinion ----------

/// Another free model checks a hard answer. Returns "" when it agrees, or a short correction.
pub fn review(app: &tauri::AppHandle, question: &str, answer: &str) -> Result<String> {
    let key = crate::groq::key(app).ok_or("Groq key not configured")?;
    let prompt = format!(
        "QUESTION:\n{}\n\nPROPOSED ANSWER:\n{}\n\nYou are a strict expert checker. Re-solve the question yourself. If the proposed answer is \
correct (small wording issues don't matter), reply exactly OK. If it contains a real factual, logical or numerical error, reply with \
'FIX:' followed by the corrected answer in at most three short sentences, in the same language as the proposed answer.",
        question.chars().take(4000).collect::<String>(),
        answer.chars().take(6000).collect::<String>()
    );
    for model in [REVIEW_MODEL, FALLBACK_REVIEW_MODEL] {
        let mut body = json!({"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 1500, "temperature": 0.1});
        if model == REVIEW_MODEL {
            body["reasoning_format"] = json!("hidden");
        } else {
            body["reasoning_effort"] = json!("medium");
        }
        let Ok(resp) = http(25)?.post("https://api.groq.com/openai/v1/chat/completions").bearer_auth(key.as_str()).json(&body).send() else {
            continue;
        };
        if !resp.status().is_success() {
            continue;
        }
        let v: Value = resp.json().unwrap_or(Value::Null);
        let text = v["choices"][0]["message"]["content"].as_str().unwrap_or("").trim().to_owned();
        if text.is_empty() {
            continue;
        }
        return Ok(text.strip_prefix("FIX:").map(|s| s.trim().to_owned()).unwrap_or_default());
    }
    Err("Second opinion unavailable".into())
}

#[tauri::command]
pub async fn web_search_cmd(query: String) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || web_search(&query)).await.map_err(|_| "Web search failed".to_string())?
}
#[tauri::command]
pub async fn courses_index_cmd(app: tauri::AppHandle) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || courses_index(&app)).await.map_err(|_| "Course index failed".to_string())?
}
#[tauri::command]
pub async fn courses_search_cmd(app: tauri::AppHandle, query: String) -> Result<Vec<Value>> {
    tauri::async_runtime::spawn_blocking(move || courses_search(&app, &query)).await.map_err(|_| "Course search failed".to_string())?
}
#[tauri::command]
pub async fn courses_open(app: tauri::AppHandle) -> Result<String> {
    let dir = courses_folder(&app)?;
    let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    Ok(dir.to_string_lossy().into_owned())
}
#[tauri::command]
pub async fn answer_review(app: tauri::AppHandle, question: String, answer: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || review(&app, &question, &answer)).await.map_err(|_| "Second opinion failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn html_text_keeps_words_and_drops_scripts() {
        let t = html_text("<html><head><title>x</title></head><body><script>var a=1;</script><p>Hello &amp; welcome</p><style>p{}</style><b>sir</b></body></html>");
        assert_eq!(t, "Hello & welcome sir");
    }
    #[test]
    #[ignore]
    fn live_web_search() {
        let v = web_search("Egypt pound dollar exchange rate today").unwrap();
        let r = v["results"].as_array().unwrap();
        eprintln!("{} results in {} ms; first: {} | {} | page {}", r.len(), v["ms"], r[0]["title"], r[0]["url"], r[0]["page"].as_str().map(|p| p.len()).unwrap_or(0));
        assert!(r.len() >= 3);
    }
    #[test]
    fn chunks_split_long_text() {
        let text = "This is a sentence about physics. ".repeat(100);
        let c = chunks(&text);
        assert!(c.len() >= 2 && c.iter().all(|p| p.chars().count() < 1400));
    }
}
