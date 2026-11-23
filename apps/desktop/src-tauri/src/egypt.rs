//! Free, keyless live data for Mahmoud in Egypt: exchange rates and gold (international price converted to
//! EGP), the Egypt national football team's matches (TheSportsDB public test key), and Quran verses with
//! translation and the Muyassar tafsir (alquran.cloud).
use crate::db::Result;
use serde_json::{json, Value};
use std::time::Duration;

const AGENT: &str = "JARVIS-Personal/0.1 (https://github.com/Mahmoud-hefny21/JARVIS)";
const EGYPT_TEAM: &str = "136138"; // Egypt men's national team on TheSportsDB

fn get(url: &str) -> Result<Value> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(AGENT)
        .build()
        .map_err(|_| "Network unavailable")?;
    let response = client.get(url).send().map_err(|_| "No internet connection, sir.")?;
    if !response.status().is_success() {
        return Err(format!("The data source answered {}", response.status().as_u16()));
    }
    response.json::<Value>().map_err(|_| "The data source sent something unexpected".into())
}

/// Dollar, euro and riyal in Egyptian pounds, and gold per gram (24k and 21k) from the world price.
pub fn rates() -> Result<Value> {
    let fx = get("https://open.er-api.com/v6/latest/USD")?;
    let egp = fx["rates"]["EGP"].as_f64().filter(|v| *v > 1.0).ok_or("Exchange rates unavailable")?;
    let per_usd = |code: &str| fx["rates"][code].as_f64().filter(|v| *v > 0.0).map(|v| egp / v);
    let gold = get("https://api.gold-api.com/price/XAU").ok();
    let ounce = gold.as_ref().and_then(|g| g["price"].as_f64()).filter(|v| *v > 100.0);
    let gram24 = ounce.map(|o| o / 31.1035 * egp);
    Ok(json!({
        "usd": egp, "eur": per_usd("EUR"), "sar": per_usd("SAR"), "gbp": per_usd("GBP"), "aed": per_usd("AED"),
        "goldOunceUsd": ounce, "gold24": gram24, "gold21": gram24.map(|g| g * 0.875), "gold18": gram24.map(|g| g * 0.75),
        "updated": fx["time_last_update_utc"], "goldUpdated": gold.as_ref().map(|g| g["updatedAt"].clone()),
    }))
}

fn event(e: &Value) -> Value {
    json!({
        "id": e["idEvent"], "title": e["strEvent"], "home": e["strHomeTeam"], "away": e["strAwayTeam"],
        "homeScore": e["intHomeScore"], "awayScore": e["intAwayScore"], "league": e["strLeague"],
        "date": e["dateEvent"], "time": e["strTime"], "timestamp": e["strTimestamp"], "status": e["strStatus"],
    })
}

/// Egypt's next and last matches; `live` re-reads one event for the current score.
pub fn egypt_matches() -> Result<Value> {
    let next = get(&format!("https://www.thesportsdb.com/api/v1/json/123/eventsnext.php?id={EGYPT_TEAM}"))?;
    let last = get(&format!("https://www.thesportsdb.com/api/v1/json/123/eventslast.php?id={EGYPT_TEAM}"))?;
    let first = |v: &Value, key: &str| v[key].as_array().and_then(|a| a.first()).map(event);
    Ok(json!({"next": first(&next, "events"), "last": first(&last, "results")}))
}
pub fn match_event(id: &str) -> Result<Value> {
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) {
        return Err("Invalid match".into());
    }
    let d = get(&format!("https://www.thesportsdb.com/api/v1/json/123/lookupevent.php?id={id}"))?;
    d["events"].as_array().and_then(|a| a.first()).map(event).ok_or("Match not found".into())
}

/// One verse: Uthmani text, English (Saheeh International) and the Muyassar tafsir.
pub fn quran_ayah(surah: u32, ayah: u32) -> Result<Value> {
    if !(1..=114).contains(&surah) || !(1..=286).contains(&ayah) {
        return Err("That verse doesn't exist, sir.".into());
    }
    let d = get(&format!("https://api.alquran.cloud/v1/ayah/{surah}:{ayah}/editions/quran-uthmani,en.sahih,ar.muyassar"))?;
    let parts = d["data"].as_array().ok_or("That verse doesn't exist, sir.")?;
    let text = |id: &str| parts.iter().find(|p| p["edition"]["identifier"] == id).map(|p| p["text"].clone()).unwrap_or(Value::Null);
    let first = parts.first().ok_or("That verse doesn't exist, sir.")?;
    Ok(json!({
        "surah": surah, "ayah": ayah, "surahAr": first["surah"]["name"], "surahEn": first["surah"]["englishName"],
        "arabic": text("quran-uthmani"), "english": text("en.sahih"), "tafsir": text("ar.muyassar"),
    }))
}

#[tauri::command]
pub async fn egypt_rates() -> Result<Value> {
    tauri::async_runtime::spawn_blocking(rates).await.map_err(|_| "Rates unavailable".to_string())?
}
#[tauri::command]
pub async fn egypt_football(event_id: Option<String>) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || match event_id {
        Some(id) => match_event(&id),
        None => egypt_matches(),
    })
    .await
    .map_err(|_| "Football data unavailable".to_string())?
}
#[tauri::command]
pub async fn quran_verse(surah: u32, ayah: u32) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || quran_ayah(surah, ayah)).await.map_err(|_| "Quran unavailable".to_string())?
}

/// Windows media and volume keys (works with Spotify, YouTube, any player). Volume steps are 2% each.
#[tauri::command]
pub fn media_key(key: String, level: Option<u32>) -> Result<()> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_KEYUP};
    let press = |vk: u8, times: u32| {
        for _ in 0..times {
            // SAFETY: synthesizes a standard virtual-key press and release.
            unsafe {
                keybd_event(vk, 0, 0, 0);
                keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
            }
        }
    };
    const PLAY_PAUSE: u8 = 0xB3; const NEXT: u8 = 0xB0; const PREVIOUS: u8 = 0xB1;
    const MUTE: u8 = 0xAD; const DOWN: u8 = 0xAE; const UP: u8 = 0xAF;
    match key.as_str() {
        "playpause" => press(PLAY_PAUSE, 1),
        "next" => press(NEXT, 1),
        "previous" => press(PREVIOUS, 1),
        "mute" => press(MUTE, 1),
        "up" => press(UP, 5),
        "down" => press(DOWN, 5),
        "set" => {
            let level = level.unwrap_or(50).min(100);
            press(DOWN, 50);
            press(UP, (level + 1) / 2);
        }
        _ => return Err("Unknown media key".into()),
    }
    Ok(())
}

/// English dictionary (dictionaryapi.dev, free): meanings with part of speech, an example, synonyms.
#[tauri::command]
pub async fn define_word(word: String) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let word = word.trim().to_lowercase();
        if word.is_empty() || word.len() > 40 || !word.chars().all(|c| c.is_ascii_alphabetic() || c == '-' || c == ' ') {
            return Err("Say one English word, sir.".to_string());
        }
        let d = get(&format!("https://api.dictionaryapi.dev/api/v2/entries/en/{}", word.replace(' ', "%20")))?;
        let entry = d.as_array().and_then(|a| a.first()).ok_or("I couldn't find that word, sir.")?;
        let meanings: Vec<Value> = entry["meanings"].as_array().cloned().unwrap_or_default().iter().take(3).map(|m| {
            let def = &m["definitions"][0];
            json!({"part": m["partOfSpeech"], "definition": def["definition"], "example": def["example"],
                   "synonyms": m["synonyms"].as_array().map(|s| s.iter().take(5).cloned().collect::<Vec<_>>())})
        }).collect();
        Ok(json!({"word": entry["word"], "phonetic": entry["phonetic"], "meanings": meanings}))
    })
    .await
    .map_err(|_| "Dictionary unavailable".to_string())?
}

/// Read-only git summary of an authorized project: branch, changed files, and today's commits.
#[tauri::command]
pub async fn git_summary(app: tauri::AppHandle, id: String) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::os::windows::process::CommandExt;
        let path = crate::grant_path(&app, &id)?;
        let git = |args: &[&str]| -> Result<String> {
            let out = std::process::Command::new("git")
                .arg("-C").arg(&path).args(args)
                .creation_flags(0x0800_0000)
                .output()
                .map_err(|_| "Git isn't available on this PC")?;
            if !out.status.success() {
                return Err("That folder isn't a git repository, sir.".into());
            }
            Ok(String::from_utf8_lossy(&out.stdout).chars().take(6000).collect())
        };
        let status = git(&["status", "--short", "--branch"])?;
        let today = git(&["log", "--since=midnight", "--pretty=format:%h %s", "-n", "30"])?;
        Ok(json!({"status": status, "today": today}))
    })
    .await
    .map_err(|_| "Git unavailable".to_string())?
}
