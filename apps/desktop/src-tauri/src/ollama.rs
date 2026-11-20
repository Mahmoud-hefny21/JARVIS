//! Free local brain via Ollama, with a hybrid router that escalates to Claude
//! only for hard requests so everyday chat costs no API tokens.
use crate::db::Result;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const ENDPOINT: &str = "http://127.0.0.1:11434/api/chat";
/// Unix time until which the local brain is skipped after a failure (model-ladder cooldown).
static LOCAL_COOLDOWN_UNTIL: AtomicU64 = AtomicU64::new(0);
/// Unix time until which ChatGPT is assumed unavailable (not signed in or no consent).
static CHATGPT_DOWN_UNTIL: AtomicU64 = AtomicU64::new(0);

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn reachable() -> bool {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
        .ok()
        .and_then(|c| c.get("http://127.0.0.1:11434/api/version").send().ok())
        .is_some_and(|r| r.status().is_success())
}

/// Starts Ollama if needed and preloads the model so the first reply skips the cold load.
pub fn warm(config: &Value) {
    if !reachable() {
        let Some(base) = std::env::var_os("LOCALAPPDATA") else { return };
        let exe = std::path::PathBuf::from(base).join("Programs/Ollama/ollama.exe");
        if !exe.exists() {
            return;
        }
        let mut cmd = std::process::Command::new(exe);
        cmd.arg("serve");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        if cmd.spawn().is_err() {
            return;
        }
        for _ in 0..20 {
            std::thread::sleep(Duration::from_millis(500));
            if reachable() {
                break;
            }
        }
    }
    if let Ok(client) = reqwest::blocking::Client::builder().timeout(Duration::from_secs(120)).build() {
        let _ = client
            .post("http://127.0.0.1:11434/api/generate")
            .json(&json!({"model":local_model(config),"prompt":"","keep_alive":"30m"}))
            .send();
    }
}

pub const DEFAULT_MODEL: &str = "qwen2.5:1.5b";

fn local_model(config: &Value) -> String {
    config["aiModel"]
        .as_str()
        .filter(|m| !m.is_empty() && !m.starts_with("claude-"))
        .unwrap_or(DEFAULT_MODEL)
        .to_owned()
}

pub fn chat(
    app: &tauri::AppHandle,
    messages: Vec<Value>,
    memories: Vec<String>,
    request_id: &str,
) -> Result<String> {
    let (config, system, turns) = crate::claude::prepare(app, &messages, &memories)?;
    // Small local models drift; keep the last few turns and a firmer brevity cue.
    let recent = &turns[turns.len().saturating_sub(8)..];
    let mut context = vec![json!({"role":"system","content":format!("{system}\nAnswer briefly and stay in character.")})];
    context.extend(recent.iter().cloned());
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(240))
        .build()
        .map_err(|_| "Network client unavailable")?;
    let response = client
        .post(ENDPOINT)
        .json(&json!({"model":local_model(&config),"messages":context,"stream":true,"keep_alive":"30m","options":{"num_ctx":4096,"temperature":0.6,"num_predict":220}}))
        .send()
        .map_err(|_| "Local brain (Ollama) is not running")?;
    if !response.status().is_success() {
        let body: Value = response.json().unwrap_or(Value::Null);
        return Err(format!(
            "Local brain error: {}",
            body["error"].as_str().unwrap_or("request failed")
        ));
    }
    let mut answer = String::new();
    for line in BufReader::new(response).lines() {
        let line = line.map_err(|_| "Local brain stream interrupted")?;
        let Ok(event) = serde_json::from_str::<Value>(&line) else { continue };
        if let Some(err) = event["error"].as_str() {
            return Err(format!("Local brain error: {err}"));
        }
        if let Some(delta) = event["message"]["content"].as_str() {
            if answer.len() + delta.len() > 64000 {
                break;
            }
            answer.push_str(delta);
            let _ = app.emit("ai-delta", json!({"requestId":request_id,"text":delta}));
        }
        if event["done"] == true {
            break;
        }
    }
    if answer.trim().is_empty() {
        return Err("Local brain returned no answer".into());
    }
    Ok(answer)
}

/// Heuristic: send to Claude only when the request clearly needs deep reasoning.
pub fn needs_claude(text: &str) -> bool {
    let t = text.to_lowercase();
    const TRIGGERS: [&str; 14] = [
        "claude", "think deeply", "think hard", "deep dive", "step by step", "write code",
        "debug", "refactor", "algorithm", "analyze", "analyse", "essay", "فكر كويس", "بالتفصيل",
    ];
    text.len() > 600 || t.contains("```") || TRIGGERS.iter().any(|k| t.contains(k))
}

/// ChatGPT through Codex, then Claude. Slow (a CLI process per turn), so only used for hard
/// requests or when the fast brains are unavailable.
fn cloud(
    app: &tauri::AppHandle,
    messages: &[Value],
    memories: &[String],
    request_id: &str,
    claude_ready: bool,
) -> Result<String> {
    let mut failure = String::from("No cloud AI is connected");
    if now() >= CHATGPT_DOWN_UNTIL.load(Ordering::Relaxed) {
        let recent = messages[messages.len().saturating_sub(8)..].to_vec();
        let notes: Vec<String> = memories.iter().take(4).cloned().collect();
        match crate::intelligence::chat(app, recent, notes, request_id) {
            Ok(answer) => return Ok(answer),
            Err(e) => {
                // Remember the failure so later requests do not wait on it again.
                let setup = e.contains("Connect an eligible") || e.contains("consent") || e.contains("Install the official");
                CHATGPT_DOWN_UNTIL.store(now() + if setup { 600 } else { 120 }, Ordering::Relaxed);
                failure = e;
            }
        }
    }
    if claude_ready {
        return crate::claude::chat(app, messages.to_vec(), memories.to_vec(), request_id);
    }
    Err(failure)
}

pub fn hybrid(
    app: &tauri::AppHandle,
    messages: Vec<Value>,
    memories: Vec<String>,
    request_id: &str,
) -> Result<String> {
    let last = messages
        .last()
        .and_then(|m| m["content"].as_str())
        .unwrap_or("")
        .to_owned();
    let claude_ready = crate::integrations::settings(app)?["onlineAiConsent"] == true
        && crate::integrations::credential(app, "ai").is_ok();
    // 1. Groq streams answers in about a second when the user stored a key.
    if crate::groq::key(app).is_some() {
        if let Ok(answer) = crate::groq::chat(app, messages.clone(), memories.clone(), request_id) {
            return Ok(answer);
        }
    }
    // 2. Hard requests go to the strongest available cloud brain.
    if needs_claude(&last) {
        if let Ok(answer) = cloud(app, &messages, &memories, request_id, claude_ready) {
            return Ok(answer);
        }
    }
    // 3. Everyday chat uses the free local model.
    let local = if now() < LOCAL_COOLDOWN_UNTIL.load(Ordering::Relaxed) {
        Err("Local brain (Ollama) is unavailable".to_string())
    } else {
        let result = chat(app, messages.clone(), memories.clone(), request_id);
        if result.is_err() {
            LOCAL_COOLDOWN_UNTIL.store(now() + 120, Ordering::Relaxed);
            let config = crate::integrations::settings(app)?;
            std::thread::spawn(move || warm(&config));
        }
        result
    };
    match local {
        Ok(answer) => Ok(answer),
        Err(local) => cloud(app, &messages, &memories, request_id, claude_ready).map_err(|cloud| {
            format!("{local}. {cloud}. Install Ollama and run `ollama pull {DEFAULT_MODEL}`, or add a Groq or Claude key in Settings.")
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::needs_claude;
    #[test]
    fn routes_only_hard_requests_to_claude() {
        assert!(!needs_claude("what time is it"));
        assert!(!needs_claude("ازيك يا جارفس"));
        assert!(needs_claude("think deeply about my startup plan"));
        assert!(needs_claude("please debug this function"));
        assert!(needs_claude(&"x".repeat(700)));
    }
}
