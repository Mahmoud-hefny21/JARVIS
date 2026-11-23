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
