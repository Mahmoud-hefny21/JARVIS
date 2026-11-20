use crate::db::Result;
use serde_json::{json, Value};
use std::os::windows::process::CommandExt;
use std::{
    io::{BufRead, BufReader, Read, Write},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Emitter;
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
    System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS},
    UI::Shell::ShellExecuteW,
};

pub fn hidden(command: &mut Command) -> &mut Command {
    command.creation_flags(0x08000000)
}
pub fn powershell() -> Command {
    Command::new(format!(
        "{}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into())
    ))
}
pub fn run(command: &mut Command, timeout: Duration) -> Result<String> {
    hidden(command)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|_| "The requested Windows component is unavailable")?;
    let stdout = child.stdout.take().ok_or("Cannot read component output")?;
    let reader = std::thread::spawn(move || {
        let mut out = Vec::new();
        let _ = stdout.take(256 * 1024).read_to_end(&mut out);
        out
    });
    let deadline = Instant::now() + timeout;
    let result = loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                break if status.success() {
                    Ok(())
                } else {
                    Err("Windows component returned an error")
                }
            }
            Ok(None) => {}
            Err(_) => break Err("Cannot read process status"),
        };
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            break Err("Windows operation timed out");
        }
        std::thread::sleep(Duration::from_millis(25));
    };
    let output = reader.join().map_err(|_| "Cannot read component output")?;
    result.map_err(String::from)?;
    Ok(String::from_utf8_lossy(&output).trim().to_owned())
}
pub fn ps(script: &str) -> Result<String> {
    run(
        powershell().args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        ]),
        Duration::from_secs(25),
    )
}
pub fn protect(data: &[u8]) -> Result<Vec<u8>> {
    crypt(data, true)
}
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>> {
    crypt(data, false)
}
fn crypt(data: &[u8], encrypt: bool) -> Result<Vec<u8>> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len().try_into().map_err(|_| "Data too large")?,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let success = unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if success == 0 {
        return Err("Windows credential protection failed. Backups can only be restored by the Windows account that created them.".into());
    }
    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as *mut _);
    }
    Ok(result)
}
pub fn open(target: &str) -> Result<()> {
    let wide: Vec<u16> = target.encode_utf16().chain(Some(0)).collect();
    let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let code = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    };
    if code as isize <= 32 {
        Err("Windows could not open the requested item".into())
    } else {
        Ok(())
    }
}
pub fn open_url(value: &str) -> Result<()> {
    let url = url::Url::parse(value).map_err(|_| "Invalid website URL")?;
    if !["https", "http"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || value.len() > 2048
    {
        return Err("Use a valid HTTP(S) website without embedded credentials".into());
    }
    open(url.as_str())
}
fn valid_start_app_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._!-{}\\ :".contains(&b))
}
fn parse_start_apps(output: &str) -> Result<Vec<Value>> {
    let value: Value = serde_json::from_str(output).map_err(|_| "Invalid Windows app catalog")?;
    let rows = value.as_array().cloned().unwrap_or_else(|| vec![value]);
    let mut result = Vec::new();
    for row in rows {
        let Some(name) = row["Name"].as_str().map(str::trim) else {
            continue;
        };
        let Some(app_id) = row["AppID"].as_str() else {
            continue;
        };
        if name.is_empty()
            || name.chars().count() > 120
            || name.chars().any(char::is_control)
            || !valid_start_app_id(app_id)
        {
            continue;
        }
        if result.iter().any(|app: &Value| app["appId"] == app_id) {
            continue;
        }
        result.push(json!({"name":name,"appId":app_id}));
    }
    result.sort_by(|a, b| {
        a["name"]
            .as_str()
            .unwrap_or_default()
            .to_lowercase()
            .cmp(&b["name"].as_str().unwrap_or_default().to_lowercase())
    });
    Ok(result)
}
pub fn installed_apps() -> Result<Vec<Value>> {
    // Windows itself supplies registered Start-menu application identities;
    // no directory scan, command discovery, or executable path is exposed.
    let output = ps("$ErrorActionPreference='Stop'; Get-StartApps | Select-Object -First 500 Name,AppID | ConvertTo-Json -Compress")?;
    parse_start_apps(&output)
}
pub fn open_installed_app(app_id: &str, name: &str) -> Result<()> {
    if !valid_start_app_id(app_id) {
        return Err("Invalid Windows application identity".into());
    }
    if !installed_apps()?
        .iter()
        .any(|app| app["appId"] == app_id && app["name"].as_str() == Some(name))
    {
        return Err("The selected application is no longer in the Windows app catalog".into());
    }
    // `shell:AppsFolder` resolves an exact catalog identity. The supplied
    // value never becomes a command line, executable path, or PowerShell code.
    open(&format!("shell:AppsFolder\\{app_id}"))
}
pub fn battery() -> (Option<u8>, Option<bool>) {
    let mut status: SYSTEM_POWER_STATUS = unsafe { std::mem::zeroed() };
    if unsafe { GetSystemPowerStatus(&mut status) } == 0
        || status.BatteryFlag == 128
        || status.BatteryLifePercent == 255
    {
        (None, None)
    } else {
        (
            Some(status.BatteryLifePercent),
            Some(status.ACLineStatus == 1),
        )
    }
}
pub fn security() -> Value {
    let script = r#"$ErrorActionPreference='Stop'; $d=$null; $f=$null; try{$d=Get-MpComputerStatus}catch{};try{$f=@(Get-NetFirewallProfile -PolicyStore ActiveStore)}catch{};[pscustomobject]@{defender=$(if($d){[bool]$d.AntivirusEnabled}else{$null});realTime=$(if($d){[bool]$d.RealTimeProtectionEnabled}else{$null});firewall=$(if($f.Count -gt 0){[bool](-not ($f | Where-Object {-not $_.Enabled}))}else{$null});lastScan=$(if($d -and $d.QuickScanEndTime){$d.QuickScanEndTime.ToString('o')}else{$null});error=$(if(-not $d -or -not $f){'One or more Windows security providers could not be read.'}else{$null})}|ConvertTo-Json -Compress"#;
    match ps(script).and_then(|s| {
        serde_json::from_str(&s).map_err(|_| "Invalid security provider response".into())
    }) {
        Ok(value) => value,
        Err(error) => {
            json!({"defender":null,"realTime":null,"firewall":null,"lastScan":null,"error":error})
        }
    }
}
pub fn execute(action: &str) -> Result<()> {
    match action {
        "chrome"=>{let roots=[std::env::var("PROGRAMFILES").unwrap_or_default(),std::env::var("PROGRAMFILES(X86)").unwrap_or_default(),std::env::var("LOCALAPPDATA").unwrap_or_default()];for root in roots{let path=std::path::Path::new(&root).join("Google/Chrome/Application/chrome.exe");if path.is_file(){hidden(&mut Command::new(path)).spawn().map_err(|_|"Chrome could not be opened")?;return Ok(());}}Err("Chrome is not installed in a supported location".into())},
        "vscode"=>{for path in [std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("Programs/Microsoft VS Code/Code.exe"),std::path::PathBuf::from(std::env::var("PROGRAMFILES").unwrap_or_default()).join("Microsoft VS Code/Code.exe")]{if path.is_file(){hidden(&mut Command::new(path)).spawn().map_err(|_|"VS Code could not be opened")?;return Ok(());}}Err("VS Code is not installed in a supported location".into())},
        "windows-security"=>open("windowsdefender:"),
        "lock"=>ps("Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class JLock { [DllImport(\"user32.dll\")] public static extern bool LockWorkStation(); }'; if(-not [JLock]::LockWorkStation()){exit 1}").map(|_|()),
        "sleep"=>ps("Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class JSleep { [DllImport(\"powrprof.dll\", SetLastError=true)] public static extern bool SetSuspendState(bool h,bool f,bool w); }'; if(-not [JSleep]::SetSuspendState($false,$false,$false)){exit 1}").map(|_|()),
        "restart"|"shutdown"=>{let executable=format!("{}\\System32\\shutdown.exe",std::env::var("SystemRoot").unwrap_or_else(|_|"C:\\Windows".into()));run(Command::new(executable).args([if action=="restart"{"/r"}else{"/s"},"/t","0"]),Duration::from_secs(5)).map(|_|())},
        _=>Err("This action is not allowlisted".into())
    }
}
fn validate_app_window_request(application: &str, operation: &str, has_bounds: bool) -> Result<()> {
    if !["chrome", "vscode"].contains(&application)
        || !["open", "focus", "move", "minimize", "restore"].contains(&operation)
        || (operation == "move" && !has_bounds)
    {
        return Err("Application window request is not allowlisted".into());
    }
    Ok(())
}
pub fn app_window(
    application: &str,
    operation: &str,
    bounds: Option<(i32, i32, u32, u32)>,
) -> Result<()> {
    validate_app_window_request(application, operation, bounds.is_some())?;
    if operation == "open" {
        execute(application)?;
    }
    let mut command = powershell();
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        include_str!("window-control.ps1"),
    ]);
    command.env(
        "JARVIS_WINDOW_REQUEST",
        serde_json::json!({"application":application,"operation":if operation=="open"{if bounds.is_some(){"move"}else{"focus"}}else{operation},"bounds":bounds.map(|(x,y,w,h)| serde_json::json!({"x":x,"y":y,"width":w,"height":h}))}).to_string(),
    );
    let result = run(&mut command, Duration::from_secs(12)).map(|_| ());
    // Windows may refuse to bring a window to the front for a background app (focus lock);
    // once the app was launched, an unverified focus is not a failed open.
    if operation == "open" && bounds.is_none() {
        return Ok(());
    }
    result
}
#[cfg(test)]
mod app_window_tests {
    use super::*;
    #[test]
    fn app_window_operations_are_fixed_and_bounded() {
        assert!(validate_app_window_request("chrome", "move", true).is_ok());
        assert!(validate_app_window_request("vscode", "focus", false).is_ok());
        assert!(validate_app_window_request("notepad", "focus", false).is_err());
        assert!(validate_app_window_request("chrome", "powershell", false).is_err());
        assert!(validate_app_window_request("chrome", "move", false).is_err());
    }
    #[test]
    fn start_app_catalog_filters_invalid_and_duplicate_identities() {
        let rows = parse_start_apps(r#"[{"Name":"Calculator","AppID":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"},{"Name":"Duplicate","AppID":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"},{"Name":"Bad","AppID":"../../cmd.exe"},{"Name":"","AppID":"Safe.App!Main"},{"Name":"Injected\nTitle","AppID":"Safe.Other!App"}]"#).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["name"], "Calculator");
        assert!(!valid_start_app_id("../../cmd.exe"));
        assert!(valid_start_app_id(
            "{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}\\Adobe\\Reader 11\\AcroRd32.exe"
        ));
        assert!(!valid_start_app_id("app\\..\\evil|cmd"));
    }
}
pub struct Speech {
    pub setup_gate: Mutex<()>,
    pub synth_epoch: std::sync::atomic::AtomicU64,
    pub wake_during_speech: std::sync::atomic::AtomicBool,
    pub last_output: Mutex<Value>,
    pub recognizer: Arc<Mutex<Option<Child>>>,
    pub synthesizer: Arc<Mutex<Option<Child>>>,
}
impl Default for Speech {
    fn default() -> Self {
        Self {
            setup_gate: Mutex::new(()),
            synth_epoch: std::sync::atomic::AtomicU64::new(0),
            wake_during_speech: std::sync::atomic::AtomicBool::new(false),
            last_output: Mutex::new(json!({"engine":"none","played":false})),
            recognizer: Arc::new(Mutex::new(None)),
            synthesizer: Arc::new(Mutex::new(None)),
        }
    }
}
pub fn stop(slot: &Arc<Mutex<Option<Child>>>) -> Result<()> {
    let mut lock = slot.lock().map_err(|_| "Speech state unavailable")?;
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}
pub fn start_voice(
    app: tauri::AppHandle,
    speech: &Speech,
    mode: &str,
    language: &str,
) -> Result<String> {
    if !["wake", "wake-whisper", "wake-interrupt", "ptt", "caption"].contains(&mode)
        || !["en-US", "en-GB", "ar-EG"].contains(&language)
    {
        return Err("Invalid speech configuration".into());
    }
    let _setup = speech
        .setup_gate
        .lock()
        .map_err(|_| "Speech setup is unavailable")?;
    let interrupt = mode == "wake-interrupt";
    speech
        .wake_during_speech
        .store(interrupt, std::sync::atomic::Ordering::SeqCst);
    if !interrupt {
        speech
            .synth_epoch
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        stop(&speech.synthesizer)?;
    }
    stop(&speech.recognizer)?;
    let session = uuid::Uuid::new_v4().to_string();
    let mut command = powershell();
    hidden(&mut command)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            include_str!("voice.ps1"),
        ])
        .env(
            "JARVIS_SPEECH_CONFIG",
            json!({"mode":mode,"language":language}).to_string(),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|_| "Windows speech engine is unavailable")?;
    let output = child.stdout.take().ok_or("Cannot read speech events")?;
    *speech
        .recognizer
        .lock()
        .map_err(|_| "Speech state unavailable")? = Some(child);
    let event_session = session.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(output)
            .lines()
            .map_while(std::result::Result::ok)
        {
            if line.len() < 16000 {
                if let Ok(mut value) = serde_json::from_str::<Value>(&line) {
                    value["session"] = json!(event_session);
                    let _ = app.emit("voice", value);
                }
            }
        }
        let _ = app.emit("voice", json!({"type":"stopped","session":event_session}));
    });
    Ok(session)
}
pub fn speak(speech: &Speech, text: &str, language: &str, voice: &str) -> Result<()> {
    if text.len() > 32000 || voice.len() > 240 || !["en-US", "en-GB", "ar-EG"].contains(&language) {
        return Err("Invalid speech request".into());
    }
    let setup = speech
        .setup_gate
        .lock()
        .map_err(|_| "Speech setup is unavailable")?;
    let epoch = speech
        .synth_epoch
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        + 1;
    stop(&speech.synthesizer)?;
    if !speech
        .wake_during_speech
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        stop(&speech.recognizer)?;
    }
    drop(setup);
    let request = json!({"text":text,"language":language,"voice":voice}).to_string();
    let mut host = VOICE_HOST.lock().map_err(|_| "Speech state unavailable")?;
    if host.as_mut().is_none_or(|h| h.child.try_wait().ok().flatten().is_some()) {
        *host = Some(VoiceHost::start()?);
    }
    let h = host.as_mut().ok_or("Windows voice is unavailable")?;
    // serde_json escapes newlines, so each request is exactly one line.
    writeln!(h.input, "{request}").map_err(|_| "Windows voice is unavailable")?;
    h.input.flush().map_err(|_| "Windows voice is unavailable")?;
    let deadline = Instant::now() + Duration::from_secs(180);
    loop {
        // An interruption (new speech, stop, or listening) kills the host; the next reply restarts it.
        if speech.synth_epoch.load(std::sync::atomic::Ordering::SeqCst) != epoch || Instant::now() > deadline {
            if let Some(mut dead) = host.take() {
                let _ = dead.child.kill();
                let _ = dead.child.wait();
            }
            return Ok(());
        }
        let h = host.as_mut().ok_or("Windows voice is unavailable")?;
        match h.output.recv_timeout(Duration::from_millis(50)) {
            Ok(line) if line == "done" => return Ok(()),
            Ok(line) if line == "error" => {
                return Err("No matching installed Windows voice is available, or audio output failed. Check language and voice settings.".into())
            }
            Ok(_) | Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                host.take();
                return Err("Windows voice stopped unexpectedly".into());
            }
        }
    }
}

/// Long-lived speech process so each reply skips PowerShell start-up and voice enumeration (~5 s).
struct VoiceHost {
    child: Child,
    input: std::process::ChildStdin,
    output: std::sync::mpsc::Receiver<String>,
}
static VOICE_HOST: Mutex<Option<VoiceHost>> = Mutex::new(None);
impl VoiceHost {
    fn start() -> Result<Self> {
        let mut command = powershell();
        hidden(&mut command)
            .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", include_str!("voice-host.ps1")])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut child = command.spawn().map_err(|_| "Windows voice is unavailable")?;
        let input = child.stdin.take().ok_or("Windows voice is unavailable")?;
        let stdout = child.stdout.take().ok_or("Windows voice is unavailable")?;
        let (tx, output) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if tx.send(line.trim().to_owned()).is_err() {
                    break;
                }
            }
        });
        Ok(Self { child, input, output })
    }
}
/// Starts the speech host early so the first reply is fast too.
pub fn warm_voice() {
    if let Ok(mut host) = VOICE_HOST.lock() {
        if host.is_none() {
            *host = VoiceHost::start().ok();
        }
    }
}

/// Plays a WAV file synchronously on a worker thread; a new speech epoch (interrupt) stops it.
fn play_wav(speech: &Speech, epoch: u64, path: &std::path::Path) -> Result<bool> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Media::Audio::{PlaySoundW, SND_FILENAME, SND_NODEFAULT, SND_SYNC};
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let player = std::thread::spawn(move || unsafe {
        PlaySoundW(wide.as_ptr(), std::ptr::null_mut(), SND_FILENAME | SND_SYNC | SND_NODEFAULT) != 0
    });
    let deadline = Instant::now() + Duration::from_secs(180);
    loop {
        if player.is_finished() {
            let ok = player.join().unwrap_or(false);
            return if ok { Ok(true) } else { Err("Windows audio playback failed".into()) };
        }
        if speech.synth_epoch.load(std::sync::atomic::Ordering::SeqCst) != epoch || Instant::now() > deadline {
            unsafe { PlaySoundW(std::ptr::null(), std::ptr::null_mut(), 0) };
            let _ = player.join();
            return Ok(false);
        }
        std::thread::sleep(Duration::from_millis(15));
    }
}

struct PiperTempFiles(std::path::PathBuf, std::path::PathBuf, std::path::PathBuf);
impl Drop for PiperTempFiles {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
        let _ = std::fs::remove_file(&self.1);
        let _ = std::fs::remove_file(&self.2);
    }
}

fn wait_speech_child(speech: &Speech, epoch: u64, timeout: Duration) -> Result<bool> {
    let deadline = Instant::now() + timeout;
    loop {
        if speech.synth_epoch.load(std::sync::atomic::Ordering::SeqCst) != epoch {
            return Ok(false);
        }
        let mut slot = speech
            .synthesizer
            .lock()
            .map_err(|_| "Speech state unavailable")?;
        let status = match slot.as_mut() {
            Some(child) => child
                .try_wait()
                .map_err(|_| "Cannot read Piper process status")?,
            None => return Ok(false),
        };
        if let Some(status) = status {
            slot.take();
            return if status.success() {
                Ok(true)
            } else {
                Err(format!("Piper process exited with status {status}"))
            };
        }
        drop(slot);
        if Instant::now() >= deadline {
            stop(&speech.synthesizer)?;
            return Err("Piper speech timed out".into());
        }
        std::thread::sleep(Duration::from_millis(30));
    }
}

fn wav_info(bytes: &[u8]) -> Result<(u32, f64)> {
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Piper did not produce a RIFF/WAVE file".into());
    }
    let mut offset = 12usize;
    let mut rate = 0u32;
    let mut byte_rate = 0u32;
    let mut data = 0usize;
    while offset.checked_add(8).is_some_and(|end| end <= bytes.len()) {
        let len = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
        let start = offset + 8;
        let end = start
            .checked_add(len)
            .filter(|end| *end <= bytes.len())
            .ok_or("Truncated Piper audio chunk")?;
        if &bytes[offset..offset + 4] == b"fmt " && len >= 16 {
            if u16::from_le_bytes(bytes[start..start + 2].try_into().unwrap()) != 1 {
                return Err("Piper audio must be PCM".into());
            }
            rate = u32::from_le_bytes(bytes[start + 4..start + 8].try_into().unwrap());
            byte_rate = u32::from_le_bytes(bytes[start + 8..start + 12].try_into().unwrap());
        }
        if &bytes[offset..offset + 4] == b"data" {
            data = len;
        }
        offset = end + (len % 2);
    }
    if !(8000..=192000).contains(&rate) || byte_rate == 0 || data == 0 {
        return Err("Piper audio has no valid PCM samples".into());
    }
    Ok((rate, data as f64 / byte_rate as f64))
}
#[cfg(test)]
mod piper_audio_tests {
    use super::*;
    #[test]
    fn wav_samples_are_required_and_chunks_are_bounded() {
        let mut wav = vec![0u8; 48];
        wav[..4].copy_from_slice(b"RIFF");
        wav[8..12].copy_from_slice(b"WAVE");
        wav[12..16].copy_from_slice(b"fmt ");
        wav[16..20].copy_from_slice(&16u32.to_le_bytes());
        wav[20..22].copy_from_slice(&1u16.to_le_bytes());
        wav[24..28].copy_from_slice(&22050u32.to_le_bytes());
        wav[28..32].copy_from_slice(&44100u32.to_le_bytes());
        wav[36..40].copy_from_slice(b"data");
        wav[40..44].copy_from_slice(&4u32.to_le_bytes());
        assert_eq!(wav_info(&wav).unwrap().0, 22050);
        assert!(wav_info(&wav[..44]).is_err());
        wav[40..44].copy_from_slice(&0u32.to_le_bytes());
        assert!(wav_info(&wav).is_err());
        assert!(wav_info(b"not audio").is_err());
    }
}
/// Uses a selected standalone Piper or Python runtime and a local, unbundled model.
pub fn speak_piper(
    speech: &Speech,
    text: &str,
    executable: &str,
    model: &str,
    config: &str,
) -> Result<Value> {
    if text.trim().is_empty() || text.chars().count() > 8000 {
        return Err("Piper text exceeds its local speech limit".into());
    }
    let executable = std::path::Path::new(executable)
        .canonicalize()
        .map_err(|_| "Piper executable unavailable")?;
    let model = std::path::Path::new(model)
        .canonicalize()
        .map_err(|_| "Piper model unavailable")?;
    let config = std::path::Path::new(config)
        .canonicalize()
        .map_err(|_| "Piper config unavailable")?;
    if executable
        .extension()
        .is_none_or(|x| !x.eq_ignore_ascii_case("exe"))
        || model
            .extension()
            .is_none_or(|x| !x.eq_ignore_ascii_case("onnx"))
        || config.file_name().is_none_or(|x| {
            !x.to_string_lossy().eq_ignore_ascii_case(&format!(
                "{}.json",
                model.file_name().unwrap_or_default().to_string_lossy()
            ))
        })
    {
        return Err("Piper requires an executable and a matching ONNX/JSON pair".into());
    }
    let id = uuid::Uuid::new_v4();
    let base = std::env::temp_dir().join(format!("jarvis-piper-{id}"));
    let input = base.with_extension("txt");
    let output = base.with_extension("wav");
    let diagnostic = base.with_extension("stderr");
    let _cleanup = PiperTempFiles(input.clone(), output.clone(), diagnostic.clone());
    let synthesis_start = Instant::now();
    std::fs::write(&input, text).map_err(|_| "Cannot stage private Piper input")?;

    let setup = speech
        .setup_gate
        .lock()
        .map_err(|_| "Speech setup is unavailable")?;
    let epoch = speech
        .synth_epoch
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        + 1;
    stop(&speech.synthesizer)?;
    if !speech
        .wake_during_speech
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        stop(&speech.recognizer)?;
    }
    let standalone = executable
        .file_name()
        .is_some_and(|x| x.eq_ignore_ascii_case("piper.exe"));
    let mut command = Command::new(&executable);
    hidden(&mut command);
    if standalone {
        command
            .arg("--model")
            .arg(&model)
            .arg("--config")
            .arg(&config)
            .arg("--output_file")
            .arg(&output)
            .args(["--sentence_silence", "0.12"])
            .stdin(std::fs::File::open(&input).map_err(|_| "Cannot read private speech input")?);
    } else {
        command
            .args(["-I", "-m", "piper", "-m"])
            .arg(&model)
            .arg("-f")
            .arg(&output)
            .arg("--input-file")
            .arg(&input)
            .stdin(Stdio::null());
    }
    command.stdout(Stdio::null()).stderr(
        std::fs::File::create(&diagnostic).map_err(|_| "Cannot capture Piper diagnostics")?,
    );
    let child = command
        .spawn()
        .map_err(|error| format!("Could not start the selected Piper runtime: {error}"))?;
    let piper_pid = child.id();
    *speech
        .synthesizer
        .lock()
        .map_err(|_| "Speech state unavailable")? = Some(child);
    drop(setup);
    match wait_speech_child(speech, epoch, Duration::from_secs(6)) {
        Ok(false) => return Ok(json!({"engine":"piper","cancelled":true,"played":false})),
        Err(reason) => {
            let detail = std::fs::read_to_string(&diagnostic).unwrap_or_default();
            let detail = detail.replace(text, "[private speech text]");
            return Err(format!(
                "{reason}: {}",
                detail.chars().take(2000).collect::<String>()
            ));
        }
        Ok(true) => (),
    }
    let synthesis_ms = synthesis_start.elapsed().as_secs_f64() * 1000.;
    let bytes = std::fs::metadata(&output)
        .map_err(|_| "Piper produced no audio file")?
        .len();
    if bytes < 44 || bytes > 32_000_000 {
        return Err("Piper audio output is empty or exceeds the playback limit".into());
    }
    let audio = std::fs::read(&output).map_err(|_| "Cannot verify Piper WAV output")?;
    let (sample_rate, duration_seconds) = wav_info(&audio)?;
    drop(audio);
    if speech.synth_epoch.load(std::sync::atomic::Ordering::SeqCst) != epoch {
        return Ok(json!({"engine":"piper","cancelled":true,"played":false}));
    }
    // Native playback: starting PowerShell for every sentence added about a second of silence.
    let playback_start = Instant::now();
    let played = play_wav(speech, epoch, &output)?;
    Ok(
        json!({"engine":"piper","runtime":executable,"model":model,"config":config,"audioBytes":bytes,"sampleRate":sample_rate,"durationSeconds":duration_seconds,"piperPid":piper_pid,"synthesisMs":synthesis_ms,"playbackMs":playback_start.elapsed().as_secs_f64()*1000.,"played":played,"cancelled":!played}),
    )
}
