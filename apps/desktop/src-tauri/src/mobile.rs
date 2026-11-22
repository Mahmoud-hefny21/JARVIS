//! Private phone app: a tiny HTTP server on 127.0.0.1 that Tailscale Serve exposes over HTTPS to the
//! owner's tailnet only. Every request must carry Tailscale's `Tailscale-User-Login` header; the first login
//! seen becomes the owner and every other identity is refused. Questions are answered by the main window
//! (the same `answer()` path as typing on the PC) and the reply is returned to the phone.
use crate::db::Result;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    sync::{mpsc, Mutex, OnceLock},
    time::Duration,
};
use tauri::{Emitter, Manager};

pub const PORT: u16 = 17840;
const PAGE: &str = include_str!("../../mobile/index.html");
const ICON: &[u8] = include_bytes!("../icons/icon.png");
const MANIFEST: &str = r##"{"name":"J.A.R.V.I.S.","short_name":"JARVIS","start_url":"/","display":"standalone","background_color":"#02080d","theme_color":"#02080d","icons":[{"src":"/icon.png","sizes":"256x256","type":"image/png"}]}"##;

fn waiting() -> &'static Mutex<HashMap<String, mpsc::Sender<Value>>> {
    static W: OnceLock<Mutex<HashMap<String, mpsc::Sender<Value>>>> = OnceLock::new();
    W.get_or_init(|| Mutex::new(HashMap::new()))
}

/// One-time: copy the owner's Groq key from Windows Credential Manager ("JARVIS-Groq") into JARVIS's own
/// DPAPI-protected store, so phone speech and fast answers work without pasting it into Settings.
fn import_groq_key(app: &tauri::AppHandle) {
    use windows_sys::Win32::Security::Credentials::{CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC};
    if crate::groq::key(app).is_some() {
        return;
    }
    let target: Vec<u16> = "JARVIS-Groq".encode_utf16().chain([0]).collect();
    let mut found: *mut CREDENTIALW = std::ptr::null_mut();
    // SAFETY: target is NUL-terminated; on success `found` points to a CREDENTIALW freed with CredFree below.
    if unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut found) } == 0 || found.is_null() {
        return;
    }
    let secret = unsafe {
        let cred = &*found;
        let bytes = std::slice::from_raw_parts(cred.CredentialBlob, cred.CredentialBlobSize as usize);
        let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        let text = zeroize::Zeroizing::new(String::from_utf16_lossy(&units));
        CredFree(found as *const _);
        text
    };
    if secret.starts_with("gsk_") && secret.len() < 200 {
        let _ = crate::integrations::credential_set(app, "groq", &secret);
    }
}

pub fn start(app: tauri::AppHandle) {
    import_groq_key(&app);
    std::thread::spawn(move || {
        let Ok(listener) = TcpListener::bind(("127.0.0.1", PORT)) else {
            eprintln!("phone app: port {PORT} unavailable");
            return;
        };
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
                if let Err(error) = handle(&app, stream) {
                    eprintln!("phone app: {error}");
                }
            });
        }
    });
}

/// Main window answered a phone question.
#[tauri::command]
pub fn mobile_reply(id: String, reply: String, card: Option<String>, spoken: Option<String>) -> Result<()> {
    if let Some(tx) = waiting().lock().map_err(|_| "Phone link unavailable")?.remove(&id) {
        let _ = tx.send(json!({"reply": reply.chars().take(8000).collect::<String>(), "spoken": spoken.map(|t| t.chars().take(1200).collect::<String>()), "card": card.map(|c| c.chars().take(60000).collect::<String>())}));
    }
    Ok(())
}

fn handle(app: &tauri::AppHandle, mut stream: TcpStream) -> Result<()> {
    let mut reader = BufReader::new(stream.try_clone().map_err(|_| "Stream unavailable")?);
    let mut line = String::new();
    reader.read_line(&mut line).map_err(|_| "Bad request")?;
    let mut parts = line.split_whitespace();
    let (method, path) = (parts.next().unwrap_or("").to_string(), parts.next().unwrap_or("/").to_string());
    let (mut length, mut login, mut kind) = (0usize, String::new(), String::new());
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).map_err(|_| "Bad request")? == 0 || header.trim().is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            match name.trim().to_ascii_lowercase().as_str() {
                "content-length" => length = value.trim().parse().unwrap_or(0),
                "tailscale-user-login" => login = value.trim().to_string(),
                "content-type" => kind = value.trim().to_ascii_lowercase(),
                _ => {}
            }
        }
    }
    if !authorized(app, &login)? {
        return send(&mut stream, "403 Forbidden", "text/plain", b"JARVIS answers its owner only.");
    }
    match (method.as_str(), path.split('?').next().unwrap_or("/")) {
        ("GET", "/") => send(&mut stream, "200 OK", "text/html; charset=utf-8", PAGE.as_bytes()),
        ("GET", "/manifest.webmanifest") => send(&mut stream, "200 OK", "application/manifest+json", MANIFEST.as_bytes()),
        ("GET", "/icon.png") => send(&mut stream, "200 OK", "image/png", ICON),
        ("GET", "/api/version") => send(&mut stream, "200 OK", "application/json", json!({"version": version()}).to_string().as_bytes()),
        ("POST", "/api/ask") => {
            if length == 0 || length > 16_000 {
                return send(&mut stream, "413 Payload Too Large", "text/plain", b"Message too long.");
            }
            let mut body = vec![0; length];
            reader.read_exact(&mut body).map_err(|_| "Bad request")?;
            let request = serde_json::from_slice::<Value>(&body).unwrap_or(Value::Null);
            let voice = request["voice"] == true;
            let text = request["text"]
                .as_str()
                .map(|s| s.trim().chars().take(2000).collect::<String>())
                .filter(|s| !s.is_empty())
                .ok_or("Empty message")?;
            let id = format!("{:x}", rand_id());
            let (tx, rx) = mpsc::channel();
            waiting().lock().map_err(|_| "Phone link unavailable")?.insert(id.clone(), tx);
            app.emit_to("main", "mobile-ask", json!({"id": id, "text": text, "voice": voice})).map_err(|_| "JARVIS window unavailable")?;
            let answer = rx.recv_timeout(Duration::from_secs(120)).unwrap_or_else(|_| {
                json!({"reply": "That took too long, sir. Please try again."})
            });
            waiting().lock().map_err(|_| "Phone link unavailable")?.remove(&id);
            send(&mut stream, "200 OK", "application/json", answer.to_string().as_bytes())
        }
        ("POST", "/api/listen") => {
            if length == 0 || length > 6_000_000 {
                return send(&mut stream, "413 Payload Too Large", "text/plain", b"Recording too long.");
            }
            let mut audio = vec![0; length];
            reader.read_exact(&mut audio).map_err(|_| "Bad recording")?;
            let (file, mime) = if kind.contains("webm") { ("speech.webm", "audio/webm") } else if kind.contains("wav") { ("speech.wav", "audio/wav") } else { ("speech.m4a", "audio/mp4") };
            let result = match crate::groq::transcribe_audio(app, &audio, file, mime, None) {
                Ok(text) => json!({"text": text}),
                Err(error) => json!({"error": error}),
            };
            send(&mut stream, "200 OK", "application/json", result.to_string().as_bytes())
        }
        ("POST", "/api/speak") => {
            if length == 0 || length > 16_000 {
                return send(&mut stream, "413 Payload Too Large", "text/plain", b"Text too long.");
            }
            let mut body = vec![0; length];
            reader.read_exact(&mut body).map_err(|_| "Bad request")?;
            let text = serde_json::from_slice::<Value>(&body).ok().and_then(|v| v["text"].as_str().map(|s| s.chars().take(1200).collect::<String>())).unwrap_or_default();
            match speech_wav(&text) {
                Ok(wav) => send(&mut stream, "200 OK", "audio/wav", &wav),
                Err(error) => send(&mut stream, "500 Internal Server Error", "text/plain", error.as_bytes()),
            }
        }
        _ => send(&mut stream, "404 Not Found", "text/plain", b"Not found."),
    }
}

/// Trust on first use: the first Tailscale login becomes the owner; every other identity is refused.
fn authorized(app: &tauri::AppHandle, login: &str) -> Result<bool> {
    if login.is_empty() || login.len() > 200 {
        return Ok(false);
    }
    let state = app.state::<crate::NativeState>();
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    match db.get_value("mobileOwner")?.as_str() {
        Some(owner) => Ok(owner.eq_ignore_ascii_case(login)),
        None => {
            db.set_value("mobileOwner", &json!(login))?;
            Ok(true)
        }
    }
}

/// JARVIS's own voice for the phone: the same SAPI voices as the PC (Ryan for English, Shakir for Arabic),
/// rendered to a WAV file instead of the speakers. Text goes in on stdin as JSON, never on the command line.
fn speech_wav(text: &str) -> Result<Vec<u8>> {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    let text = text.trim();
    if text.is_empty() {
        return Err("Nothing to say".into());
    }
    let file = std::env::temp_dir().join(format!("jarvis-phone-{:x}.wav", rand_id()));
    let script = r#"$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$c=[Console]::In.ReadToEnd().TrimStart([char]0xFEFF)|ConvertFrom-Json
$v=New-Object -ComObject SAPI.SpVoice; $all=$v.GetVoices(); $tokens=@(for($i=0;$i -lt $all.Count;$i++){$all.Item($i)})
$wants=if(@($c.text.ToCharArray()|Where-Object{[int]$_ -ge 0x600 -and [int]$_ -le 0x6FF}).Count -gt 0){'Shakir','Arabic'}else{'Ryan','Thomas','United Kingdom','Guy'}
:pick foreach($w in $wants){foreach($t in $tokens){if($t.GetDescription() -like "*$w*"){$v.Voice=$t;break pick}}}
$s=New-Object -ComObject SAPI.SpFileStream; $s.Format.Type=22; $s.Open($c.file,3); $v.AudioOutputStream=$s; [void]$v.Speak($c.text); $s.Close()"#;
    let mut child = Command::new("powershell.exe")
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x0800_0000)
        .spawn()
        .map_err(|_| "Voice unavailable")?;
    if let Some(mut input) = child.stdin.take() {
        input
            .write_all(json!({"text": text, "file": file.to_string_lossy()}).to_string().as_bytes())
            .map_err(|_| "Voice unavailable")?;
    }
    let ok = child.wait().map(|s| s.success()).unwrap_or(false);
    let wav = std::fs::read(&file).ok();
    let _ = std::fs::remove_file(&file);
    match wav {
        Some(bytes) if ok && bytes.len() > 44 => Ok(bytes),
        _ => Err("Voice unavailable".into()),
    }
}
/// Changes whenever the phone page or icon changes, so an open app can refresh itself.
fn version() -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in PAGE.as_bytes().iter().chain(ICON) {
        hash = (hash ^ *byte as u64).wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}
fn rand_id() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    nanos ^ ((std::process::id() as u128) << 64) ^ (&nanos as *const u128 as u128)
}

fn send(stream: &mut TcpStream, status: &str, kind: &str, body: &[u8]) -> Result<()> {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes()).and_then(|_| stream.write_all(body)).map_err(|_| "Phone disconnected".into())
}
