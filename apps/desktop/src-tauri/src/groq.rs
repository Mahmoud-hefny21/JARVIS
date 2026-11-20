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
const VOCABULARY: &str = "JARVIS, open Chrome, YouTube, VS Code, monitor one, monitor two, add task, remind me, remember, daily briefing, weather.";
const CHAT_MODEL: &str = "openai/gpt-oss-120b";

pub fn key(app: &tauri::AppHandle) -> Option<zeroize::Zeroizing<String>> {
    crate::integrations::credential(app, "groq").ok()
}

fn client(timeout: u64) -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(timeout))
        .build()
        .map_err(|_| "Network client unavailable".into())
}

pub fn transcribe(app: &tauri::AppHandle, wav: &Path, language: &str) -> Result<String> {
    let key = key(app).ok_or("Groq key not configured")?;
    let audio = std::fs::read(wav).map_err(|_| "Cannot read captured audio")?;
    let boundary = format!("jarvis{}", uuid::Uuid::new_v4().simple());
    let mut body = Vec::with_capacity(audio.len() + 1024);
    for (name, value) in [("model", STT_MODEL), ("language", language), ("response_format", "json"), ("temperature", "0"), ("prompt", VOCABULARY)] {
        body.extend_from_slice(
            format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes(),
        );
    }
    body.extend_from_slice(
        format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\nContent-Type: audio/wav\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(&audio);
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

pub fn chat(
    app: &tauri::AppHandle,
    messages: Vec<Value>,
    memories: Vec<String>,
    request_id: &str,
) -> Result<String> {
    let key = key(app).ok_or("Groq key not configured")?;
    let (_, system, turns) = crate::claude::prepare(app, &messages, &memories)?;
    let mut context = vec![json!({"role":"system","content":system})];
    context.extend(turns);
    let response = client(60)?
        .post("https://api.groq.com/openai/v1/chat/completions")
        .bearer_auth(key.as_str())
        .json(&json!({"model":CHAT_MODEL,"messages":context,"stream":true,"max_tokens":700,"temperature":0.6,"reasoning_effort":"low"}))
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
