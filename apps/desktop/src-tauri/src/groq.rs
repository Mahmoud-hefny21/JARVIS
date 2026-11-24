//! Groq cloud: near-instant Whisper transcription and fast streaming answers.
//! Used only when the user stores a Groq key; local Whisper/Ollama remain the fallback.
use crate::db::Result;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::time::Duration;
use tauri::Emitter;

const STT_MODEL: &str = "whisper-large-v3-turbo";
/// Biases recognition toward the app's command words (names Whisper often mishears).
const VOCABULARY: &str = "JARVIS, buy, open Chrome, YouTube, VS Code, monitor one, monitor two, add task, remind me, remember, daily briefing, weather, prayer times, Fajr, Dhuhr, Asr, Maghrib, Isha, salah, Al-Rehab, New Cairo, MIU, sir.";
const CHAT_MODEL: &str = "openai/gpt-oss-120b";

pub fn key(app: &tauri::AppHandle) -> Option<zeroize::Zeroizing<String>> {
    crate::integrations::credential(app, "groq").ok()
}

/// One pooled client for the whole run: reusing the TLS connection saves a handshake (~0.3-0.6 s) per request.
fn client(timeout: u64) -> Result<ClientWithTimeout> {
    static CLIENT: std::sync::OnceLock<reqwest::blocking::Client> = std::sync::OnceLock::new();
    let c = CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(4))
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(30))
            .build()
            .unwrap_or_default()
    });
    Ok(ClientWithTimeout(c, Duration::from_secs(timeout)))
}
struct ClientWithTimeout(&'static reqwest::blocking::Client, Duration);
impl ClientWithTimeout {
    fn post(&self, url: &str) -> reqwest::blocking::RequestBuilder {
        self.0.post(url).timeout(self.1)
    }
}

/// Opens the Groq connection in the background (called on wake word) so the
/// transcription request that follows skips DNS and TLS setup.
pub fn warm(app: &tauri::AppHandle) {
    let Some(key) = key(app) else { return };
    std::thread::spawn(move || {
        if let Ok(c) = client(5) {
            let _ = c.0.get("https://api.groq.com/openai/v1/models").bearer_auth(key.as_str()).timeout(c.1).send();
        }
    });
}

pub fn transcribe(app: &tauri::AppHandle, wav: &Path, language: &str) -> Result<String> {
    let audio = std::fs::read(wav).map_err(|_| "Cannot read captured audio")?;
    transcribe_audio(app, &audio, "speech.wav", "audio/wav", Some(language))
}

/// Any recorded clip (WAV from the PC, M4A/WebM from the phone). Without a language Whisper detects it,
/// which suits mixed Egyptian Arabic and English.
pub fn transcribe_audio(app: &tauri::AppHandle, audio: &[u8], filename: &str, mime: &str, language: Option<&str>) -> Result<String> {
    let key = key(app).ok_or("Groq key not configured")?;
    let boundary = format!("jarvis{}", uuid::Uuid::new_v4().simple());
    let mut body = Vec::with_capacity(audio.len() + 1024);
    let mut fields = vec![("model", STT_MODEL), ("response_format", "json"), ("temperature", "0"), ("prompt", VOCABULARY)];
    if let Some(language) = language.filter(|l| !l.is_empty()) {
        fields.push(("language", language));
    }
    for (name, value) in fields {
        body.extend_from_slice(
            format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes(),
        );
    }
    body.extend_from_slice(
        format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(audio);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    let response = client(20)?
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .bearer_auth(key.as_str())
        .header("Content-Type", format!("multipart/form-data; boundary={boundary}"))
        .body(body)
        .send()
        .map_err(|_| "Groq is unreachable")?;
    let status = response.status();
    let value: Value = response.json().unwrap_or(Value::Null);
    if !status.is_success() {
        return Err(format!(
            "Groq transcription error {}: {}",
            status.as_u16(),
            value["error"]["message"].as_str().unwrap_or("request failed")
        ));
    }
    Ok(value["text"].as_str().unwrap_or("").trim().to_owned())
}

/// Questions that deserve real reasoning: maths, science, study, code, planning, decisions, "why"/"explain",
/// in English, Franco and Arabic, or anything long.
pub fn needs_thought(text: &str) -> bool {
    let t = text.to_lowercase();
    if t.chars().count() > 160 {
        return true;
    }
    const WORDS: [&str; 40] = [
        "why", "explain", "how does", "how do", "how can", "solve", "calculate", "compute", "prove", "derive", "compare",
        "difference between", "should i", "plan", "strategy", "code", "bug", "error", "algorithm", "equation", "formula",
        "summari", "analy", "pros and cons", "leh ", "ezay", "eshra7", "e4ra7", "a7seb", "ليه", "ازاي", "إزاي", "اشرح",
        "احسب", "الفرق بين", "اعمل خطة", "حل ", "معادلة", "يعني ايه", "ya3ni eh",
    ];
    WORDS.iter().any(|w| t.contains(w)) || (t.chars().filter(|c| c.is_ascii_digit()).count() >= 2 && t.chars().any(|c| "+-*/^=×÷%".contains(c)))
}

pub fn chat(
    app: &tauri::AppHandle,
    messages: Vec<Value>,
    memories: Vec<String>,
    request_id: &str,
) -> Result<String> {
    let key = key(app).ok_or("Groq key not configured")?;
    let (_, system, turns) = crate::claude::prepare(app, &messages, &memories)?;
    // Think harder only when the question needs it, so small talk stays instant.
    let hard = turns.last().and_then(|t| t["content"].as_str()).is_some_and(needs_thought);
    let mut context = vec![json!({"role":"system","content":system})];
    context.extend(turns);
    let response = client(60)?
        .post("https://api.groq.com/openai/v1/chat/completions")
        .bearer_auth(key.as_str())
        .json(&json!({"model":CHAT_MODEL,"messages":context,"stream":true,"max_tokens":if hard {2500} else {900},"temperature":0.5,"reasoning_effort":if hard {"medium"} else {"low"}}))
        .send()
        .map_err(|_| "Groq is unreachable")?;
    let status = response.status();
    if !status.is_success() {
        let value: Value = response.json().unwrap_or(Value::Null);
        return Err(format!(
            "Groq error {}: {}",
            status.as_u16(),
            value["error"]["message"].as_str().unwrap_or("request failed")
        ));
    }
    let mut answer = String::new();
    for line in BufReader::new(response).lines() {
        let line = line.map_err(|_| "Groq stream interrupted")?;
        let Some(data) = line.strip_prefix("data: ") else { continue };
        if data == "[DONE]" {
            break;
        }
        let Ok(event) = serde_json::from_str::<Value>(data) else { continue };
        if let Some(delta) = event["choices"][0]["delta"]["content"].as_str() {
            answer.push_str(delta);
            let _ = app.emit("ai-delta", json!({"requestId":request_id,"text":delta}));
        }
    }
    if answer.trim().is_empty() {
        return Err("Groq returned no answer".into());
    }
    Ok(answer)
}
