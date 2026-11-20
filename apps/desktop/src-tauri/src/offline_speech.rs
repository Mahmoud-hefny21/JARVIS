use crate::{db::Result, NativeState};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

static VERIFIED: AtomicBool = AtomicBool::new(false);
/// Serializes microphone captures; a new request cancels and replaces the previous one.
static CAPTURE: Mutex<()> = Mutex::new(());
const ZIP_URL: &str =
    "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip";
const MODEL_URL:&str="https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base-q5_1.bin";
const MODEL_HASH: &str = "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898";
#[derive(serde::Deserialize)]
struct Asset {
    name: String,
    size: usize,
    sha256: String,
}
fn assets() -> Result<Vec<Asset>> {
    serde_json::from_str(include_str!("speech-runtime.json"))
        .map_err(|_| "Invalid embedded speech manifest".into())
}
fn verify_runtime(root: &Path) -> Result<()> {
    let assets = assets()?;
    let release = root.join("runtime/Release");
    for entry in std::fs::read_dir(&release).map_err(|_| "Speech runtime unavailable")? {
        let entry = entry.map_err(|_| "Cannot inspect runtime")?;
        if !assets
            .iter()
            .any(|a| a.name == entry.file_name().to_string_lossy())
        {
            return Err("Unexpected speech runtime file; reinstall from a verified source".into());
        }
    }
    for a in assets {
        check(&release.join(a.name), &a.sha256, a.size)?;
    }
    Ok(())
}
fn folder(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app
        .state::<NativeState>()
        .db
        .lock()
        .map_err(|_| "Database unavailable")?
        .dir
        .join("optional-speech"))
}
fn check(path: &Path, expected: &str, size: usize) -> Result<()> {
    let bytes =
        std::fs::read(path).map_err(|_| "Speech component is missing; install it in Settings")?;
    if bytes.len() != size || format!("{:x}", Sha256::digest(&bytes)) != expected {
        return Err("Speech component integrity check failed".into());
    }
    Ok(())
}
pub fn status(app: &tauri::AppHandle) -> Result<Value> {
    let root = folder(app)?;
    Ok(
        json!({"installed":root.join("runtime/Release/whisper-cli.exe").is_file()&&root.join("ggml-base-q5_1.bin").is_file(),"engine":"whisper.cpp b5454 / multilingual base-q5_1","downloadBytes":68636265,"idleModelLoaded":false,"captureSeconds":15,"realMicrophoneVerified":false}),
    )
}
pub fn install(app: &tauri::AppHandle) -> Result<()> {
    let root = folder(app)?;
    if root.exists() {
        return Err("Speech folder already exists; check its integrity before replacing it".into());
    }
    let staging = root.with_file_name(format!("speech-install-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&staging).map_err(|_| "Cannot stage optional speech")?;
    let result = (|| -> Result<()> {
        let http = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(180))
            .build()
            .map_err(|_| "Download client unavailable")?;
        for (name, url, hash, size) in [
            (
                "runtime.zip",
                ZIP_URL,
                "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
                8928640,
            ),
            ("ggml-base-q5_1.bin", MODEL_URL, MODEL_HASH, 59707625),
        ] {
            let response = http
                .get(url)
                .send()
                .map_err(|_| "Speech download unavailable; no personal data was sent")?
                .error_for_status()
                .map_err(|_| "Speech download rejected")?;
            let mut bytes = Vec::new();
            response
                .take((size + 1) as u64)
                .read_to_end(&mut bytes)
                .map_err(|_| "Speech download interrupted")?;
            if bytes.len() != size || format!("{:x}", Sha256::digest(&bytes)) != hash {
                return Err("Downloaded speech checksum mismatch".into());
            }
            std::fs::write(staging.join(name), bytes)
                .map_err(|_| "Cannot save verified speech component")?;
        }
        let mut cmd = crate::windows::powershell();
        cmd.args(["-NoLogo","-NoProfile","-NonInteractive","-Command",r#"$ErrorActionPreference='Stop';Add-Type -AssemblyName System.IO.Compression.FileSystem;$base=$env:JARVIS_SPEECH_STAGE;$zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $base 'runtime.zip'));try{foreach($entry in $zip.Entries){if($entry.FullName -match '(^[\/]|\.\.|:)'){throw 'Invalid archive path'}}}finally{$zip.Dispose()};Expand-Archive -LiteralPath (Join-Path $base 'runtime.zip') -DestinationPath (Join-Path $base 'runtime');"#]).env("JARVIS_SPEECH_STAGE",&staging);
        crate::windows::run(&mut cmd, Duration::from_secs(35))?;
        let allowed = assets()?;
        for entry in std::fs::read_dir(staging.join("runtime/Release"))
            .map_err(|_| "Unsupported speech archive layout")?
        {
            let entry = entry.map_err(|_| "Cannot inspect runtime")?;
            if !allowed
                .iter()
                .any(|a| a.name == entry.file_name().to_string_lossy())
            {
                std::fs::remove_file(entry.path()).map_err(|_| "Cannot minimize runtime")?;
            }
        }
        verify_runtime(&staging)?;
        std::fs::write(
            staging.join("LICENSE-MIT.txt"),
            include_str!("speech-license.txt"),
        )
        .map_err(|_| "Cannot save speech notices")?;
        std::fs::rename(&staging, &root)
            .map_err(|_| "Cannot publish verified optional speech installation")?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    result
}
fn run(app: &tauri::AppHandle, mut command: Command, timeout: Duration) -> Result<String> {
    let state = app.state::<NativeState>();
    let mut slot = state
        .offline_process
        .lock()
        .map_err(|_| "Speech process unavailable")?;
    if slot.is_some() {
        return Err("Offline speech already running; stop it first".into());
    }
    crate::windows::hidden(&mut command)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped());
    let mut c = command
        .spawn()
        .map_err(|_| "Offline speech component unavailable")?;
    let out = c.stdout.take().ok_or("Speech output unavailable")?;
    let child = Arc::new(Mutex::new(c));
    *slot = Some(child.clone());
    drop(slot);
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = out.take(128000).read_to_end(&mut bytes);
        bytes
    });
    let end = Instant::now() + timeout;
    let result = loop {
        if let Some(status) = child
            .lock()
            .map_err(|_| "Speech process unavailable")?
            .try_wait()
            .map_err(|_| "Cannot read speech process")?
        {
            break if status.success() {
                Ok(())
            } else {
                Err("Speech stopped, microphone unavailable, or no audible speech captured")
            };
        }
        if Instant::now() > end {
            let mut c = child.lock().map_err(|_| "Speech process unavailable")?;
            let _ = c.kill();
            let _ = c.wait();
            break Err("Offline speech timed out");
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    {
        let mut slot = state
            .offline_process
            .lock()
            .map_err(|_| "Speech process unavailable")?;
        if slot.as_ref().is_some_and(|c| Arc::ptr_eq(c, &child)) {
            slot.take();
        }
    }
    let bytes = reader.join().map_err(|_| "Cannot collect speech output")?;
    result.map_err(String::from)?;
    Ok(String::from_utf8_lossy(&bytes).trim().to_owned())
}
pub fn cancel(state: &NativeState) -> Result<()> {
    state
        .offline_epoch
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    if let Some(c) = state
        .offline_process
        .lock()
        .map_err(|_| "Speech process unavailable")?
        .take()
    {
        let mut c = c.lock().map_err(|_| "Speech process unavailable")?;
        let _ = c.kill();
        let _ = c.wait();
    }
    Ok(())
}
pub fn transcribe(app: &tauri::AppHandle, wav: &Path) -> Result<String> {
    let language = crate::integrations::settings(app)
        .ok()
        .and_then(|c| c["language"].as_str().map(|l| if l.starts_with("ar") { "ar" } else { "en" }))
        .unwrap_or("en");
    if crate::groq::key(app).is_some() {
        if let Ok(text) = crate::groq::transcribe(app, wav, language) {
            return clean_transcript(&text);
        }
    }
    transcribe_local(app, wav)
}
fn transcribe_local(app: &tauri::AppHandle, wav: &Path) -> Result<String> {
    let root = folder(app)?;
    // Hashing ~80 MB of model and runtime on every request added noticeable delay; verify once per run.
    if !VERIFIED.load(Ordering::Acquire) {
        check(&root.join("ggml-base-q5_1.bin"), MODEL_HASH, 59707625)?;
        check(
            &root.join("runtime.zip"),
            "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
            8928640,
        )?;
        verify_runtime(&root)?;
        VERIFIED.store(true, Ordering::Release);
    }
    // A reduced audio context (-ac) makes whisper loop on short clips, so only threads are tuned.
    // Fixing the language avoids misdetection on short clips ("open Chrome" -> "Arras").
    let language = crate::integrations::settings(app)
        .ok()
        .and_then(|c| c["language"].as_str().map(|l| if l.starts_with("ar") { "ar" } else { "en" }))
        .unwrap_or("auto");
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(8).to_string();
    let mut cmd = Command::new(root.join("runtime/Release/whisper-cli.exe"));
    cmd.current_dir(root.join("runtime/Release"))
        .args(["-m"])
        .arg(root.join("ggml-base-q5_1.bin"))
        .args(["-f"])
        .arg(wav)
        .args([
            "-bo", "1", "-bs", "1", "-nt", "-np", "-nf",
        ])
        .args(["-l", language, "-t", threads.as_str()])
        .args(["--prompt", "JARVIS, open Chrome, YouTube, VS Code, add task, remind me, remember."]);
    let text = run(app, cmd, Duration::from_secs(60))?;
    clean_transcript(&text)
}
/// Phrases Whisper produces from silence or background noise; never treat them as requests.
const HALLUCINATIONS: [&str; 22] = [
    "okay", "ok", "thank you", "thanks", "thanks for watching", "thank you for watching", "you",
    "bye", "so", "uh", "um", "hmm", "ah", "oh", "i m going to go", "im going to go", "yeah",
    "please subscribe", "the end", "music", "applause", "شكرا",
];
fn clean_transcript(text: &str) -> Result<String> {
    // Whisper labels noise as [Ambient], (music), (Carris)...; drop bracketed tags and treat what remains as the request.
    let mut spoken = String::new();
    let mut depth = 0;
    for ch in text.chars() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = (depth - 1).max(0),
            _ if depth == 0 => spoken.push(ch),
            _ => {}
        }
    }
    let text = spoken.trim().to_owned();
    // Whisper invents these on silence or noise; treat them as nothing heard.
    let bare: String = text
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if HALLUCINATIONS.contains(&bare.as_str()) || bare.starts_with("thanks for watching") || bare.starts_with("subtitles by") {
        return Err("I didn’t catch that — please say it again.".into());
    }
    if text.chars().filter(|c| c.is_alphanumeric()).count() < 2 || text.contains("BLANK_AUDIO") {
        return Err("I didn’t catch that — please say it again.".into());
    }
    Ok(text.chars().take(4000).collect())
}
pub fn microphone(app: &tauri::AppHandle, follow_up: bool) -> Result<String> {
    if status(app)?["installed"] != true && crate::groq::key(app).is_none() {
        return Err("Install the optional offline speech component in Settings first".into());
    }
    let state = app.state::<NativeState>();
    // Cancel a capture or transcription still running from an earlier request instead of failing.
    cancel(&state)?;
    let _capture = CAPTURE.lock().unwrap_or_else(|e| e.into_inner());
    let epoch = state.offline_epoch.load(Ordering::SeqCst);
    let wav = std::env::temp_dir().join(format!("jarvis-capture-{}.wav", uuid::Uuid::new_v4()));
    let result = (|| {
        crate::capture::record(
            app,
            crate::capture::Settings {
                wait_for_speech: Duration::from_secs(if follow_up { 6 } else { 8 }),
            },
            || state.offline_epoch.load(Ordering::SeqCst) != epoch,
            &wav,
        )?;
        transcribe(app, &wav)
    })();
    let _ = std::fs::remove_file(&wav);
    result
}
