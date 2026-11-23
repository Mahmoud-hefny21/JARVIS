//! Voice ID: JARVIS answers only Mahmoud's voice. A small speaker-embedding model (wespeaker ResNet34,
//! Apache-2.0, 26.5 MB, run locally with tract) turns each sentence into a 256-number voice fingerprint;
//! sentences whose fingerprint isn't close to the enrolled owner's are ignored (videos, people nearby).
//! Only the averaged fingerprint is stored (DPAPI-protected database), never recordings.
use crate::db::Result;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use tract_onnx::prelude::*;

const MODEL_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34.onnx";
const MODEL_SHA256: &str = "5ef208a9da1453335308a6b6f4e6dfbd7e183a38b604de0a57664f45d257fe94";
const MIN_CLIPS: usize = 3;

type Plan = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;
fn plan_slot() -> &'static Mutex<Option<Plan>> {
    static P: OnceLock<Mutex<Option<Plan>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(None))
}
fn clips() -> &'static Mutex<Vec<Vec<f32>>> {
    static C: OnceLock<Mutex<Vec<Vec<f32>>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(Vec::new()))
}

fn model_path(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_data_dir().map_err(|_| "App data folder unavailable")?.join("voiceid.onnx"))
}
/// Downloads the model once (free, from the sherpa-onnx project) and checks its SHA-256.
fn ensure_model(app: &tauri::AppHandle) -> Result<PathBuf> {
    use sha2::{Digest, Sha256};
    let path = model_path(app)?;
    let ok = |p: &Path| std::fs::read(p).map(|b| format!("{:x}", Sha256::digest(&b)) == MODEL_SHA256).unwrap_or(false);
    if path.exists() && ok(&path) {
        return Ok(path);
    }
    let bytes = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|_| "Network unavailable")?
        .get(MODEL_URL)
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.bytes())
        .map_err(|_| "Couldn't download the voice model. Check the internet connection, sir.")?;
    if format!("{:x}", Sha256::digest(&bytes)) != MODEL_SHA256 {
        return Err("The voice model download didn't verify; nothing was installed.".into());
    }
    std::fs::write(&path, &bytes).map_err(|_| "Couldn't save the voice model")?;
    Ok(path)
}
fn with_plan<T>(app: &tauri::AppHandle, run: impl FnOnce(&Plan) -> Result<T>) -> Result<T> {
    let mut slot = plan_slot().lock().map_err(|_| "Voice ID unavailable")?;
    if slot.is_none() {
        let path = ensure_model(app)?;
        let mut model = tract_onnx::onnx().model_for_path(&path).map_err(|_| "Voice model unreadable")?;
        let frames = model.symbols.sym("T");
        model
            .set_input_fact(0, f32::fact([1.to_dim(), frames.to_dim(), 80.to_dim()]).into())
            .map_err(|_| "Voice model unreadable")?;
        *slot = Some(model.into_optimized().and_then(|m| m.into_runnable()).map_err(|_| "Voice model unreadable")?);
    }
    run(slot.as_ref().ok_or("Voice ID unavailable")?)
}

include!("voiceid_fbank.rs");

/// 16 kHz mono 16-bit WAV (as written by capture.rs) → samples.
fn read_wav(path: &Path) -> Result<Vec<i16>> {
    let bytes = std::fs::read(path).map_err(|_| "Cannot read captured audio")?;
    let mut i = 12;
    while i + 8 <= bytes.len() {
        let size = u32::from_le_bytes([bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]]) as usize;
        if &bytes[i..i + 4] == b"data" {
            let end = (i + 8 + size).min(bytes.len());
            return Ok(bytes[i + 8..end].chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]])).collect());
        }
        i += 8 + size + (size & 1);
    }
    Err("Unexpected audio format".into())
}
/// Unit-length voice fingerprint of a recording (needs ~1 s of speech).
pub fn fingerprint(app: &tauri::AppHandle, wav: &Path) -> Result<Vec<f32>> {
    let pcm = read_wav(wav)?;
    if pcm.len() < 16_000 {
        return Err("Too short to recognise the voice".into());
    }
    let feats = fbank(&pcm);
    let frames = feats.len() / 80;
    with_plan(app, |plan| {
        let input: Tensor = tract_ndarray::Array3::from_shape_vec((1, frames, 80), feats).map_err(|_| "Voice ID failed")?.into();
        let out = plan.run(tvec!(input.into())).map_err(|_| "Voice ID failed")?;
        let v: Vec<f32> = out[0].to_array_view::<f32>().map_err(|_| "Voice ID failed")?.iter().copied().collect();
        let n = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-6);
        Ok(v.iter().map(|x| x / n).collect())
    })
}
fn cosine(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn print_value(app: &tauri::AppHandle) -> Value {
    let state = app.state::<crate::NativeState>();
    state.db.lock().ok().and_then(|db| db.get_value("voiceprint").ok()).unwrap_or(Value::Null)
}
/// Is Voice ID on and enrolled? Then: does this recording sound like the owner? (similarity, threshold)
pub fn check(app: &tauri::AppHandle, wav: &Path) -> Option<(bool, f32, f32)> {
    let print = print_value(app);
    if print["enabled"] != true {
        return None;
    }
    let owner: Vec<f32> = print["embedding"].as_array()?.iter().filter_map(|v| v.as_f64().map(|x| x as f32)).collect();
    let threshold = print["threshold"].as_f64().unwrap_or(0.5) as f32;
    // Too short to judge (e.g. "yes"): let it through rather than ignore the owner.
    let mine = fingerprint(app, wav).ok()?;
    let similarity = cosine(&owner, &mine);
    Some((similarity >= threshold, similarity, threshold))
}

#[tauri::command]
pub async fn voiceid_status(app: tauri::AppHandle) -> Result<Value> {
    let print = print_value(&app);
    Ok(json!({"enrolled": print["embedding"].is_array(), "enabled": print["enabled"] == true, "threshold": print["threshold"]}))
}
/// Records one enrollment sentence and keeps its fingerprint in memory until `voiceid_enroll_finish`.
#[tauri::command]
pub async fn voiceid_enroll_clip(app: tauri::AppHandle, first: bool) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        if first {
            clips().lock().map_err(|_| "Voice ID unavailable")?.clear();
            ensure_model(&app)?;
        }
        let wav = std::env::temp_dir().join(format!("jarvis-voiceid-{}.wav", uuid::Uuid::new_v4()));
        let recorded = crate::capture::record(
            &app,
            crate::capture::Settings { wait_for_speech: std::time::Duration::from_secs(10), echo_active: crate::offline_speech::speaking },
            || false,
            &wav,
        );
        let print = recorded.and_then(|_| fingerprint(&app, &wav));
        let _ = std::fs::remove_file(&wav);
        let print = print?;
        let mut all = clips().lock().map_err(|_| "Voice ID unavailable")?;
        all.push(print);
        Ok(json!({"clips": all.len()}))
    })
    .await
    .map_err(|_| "Voice ID unavailable".to_string())?
}
/// Averages the enrollment fingerprints and sets a threshold from how consistent the owner's own clips were.
#[tauri::command]
pub async fn voiceid_enroll_finish(app: tauri::AppHandle) -> Result<Value> {
    let all = clips().lock().map_err(|_| "Voice ID unavailable")?.clone();
    if all.len() < MIN_CLIPS {
        return Err(format!("I need at least {MIN_CLIPS} sentences, sir."));
    }
    let mut mean = vec![0f32; all[0].len()];
    for c in &all {
        for (m, v) in mean.iter_mut().zip(c) {
            *m += v;
        }
    }
    let n = mean.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-6);
    mean.iter_mut().for_each(|x| *x /= n);
    let own: Vec<f32> = all.iter().map(|c| cosine(&mean, c)).collect();
    let weakest = own.iter().cloned().fold(1.0f32, f32::min);
    // Accept anything close to the owner's weakest enrollment clip; other voices scored ≤ 0.46 in tests.
    let threshold = (weakest - 0.15).clamp(0.40, 0.62);
    let state = app.state::<crate::NativeState>();
    state.db.lock().map_err(|_| "Database unavailable")?.set_value(
        "voiceprint",
        &json!({"embedding": mean, "threshold": threshold, "enabled": true, "clips": all.len(), "ownScores": own}),
    )?;
    clips().lock().map_err(|_| "Voice ID unavailable")?.clear();
    Ok(json!({"threshold": threshold, "ownScores": own}))
}
#[tauri::command]
pub async fn voiceid_enable(app: tauri::AppHandle, enabled: bool) -> Result<()> {
    let state = app.state::<crate::NativeState>();
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    let mut print = db.get_value("voiceprint")?;
    if !print["embedding"].is_array() {
        return Err("Teach me your voice first, sir: say “learn my voice”.".into());
    }
    print["enabled"] = json!(enabled);
    db.set_value("voiceprint", &print)
}
