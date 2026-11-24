//! Notifications on Mahmoud's iPhone (Web Push, RFC 8291/8292). The payload is encrypted on this PC with
//! the phone's own key (aes128gcm), so Apple's push service only relays ciphertext. The VAPID signing key is
//! created once and kept in JARVIS's DPAPI-protected credential store.
use crate::db::Result;
use aes_gcm::{aead::Aead, Aes128Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use hkdf::Hkdf;
use p256::{
    ecdsa::{signature::Signer, Signature, SigningKey},
    elliptic_curve::{rand_core::OsRng, sec1::ToEncodedPoint},
    PublicKey, SecretKey,
};
use serde_json::{json, Value};
use sha2::Sha256;
use tauri::Manager;

const CONTACT: &str = "https://github.com/Mahmoud-hefny21/JARVIS";
const MAX_SUBSCRIPTIONS: usize = 5;

fn vapid(app: &tauri::AppHandle) -> Result<SigningKey> {
    if let Ok(saved) = crate::integrations::credential(app, "vapid") {
        if let Ok(bytes) = B64.decode(saved.as_bytes()) {
            if let Ok(key) = SigningKey::from_slice(&bytes) {
                return Ok(key);
            }
        }
    }
    let key = SigningKey::random(&mut OsRng);
    crate::integrations::credential_set(app, "vapid", &B64.encode(key.to_bytes()))?;
    Ok(key)
}

/// The public VAPID key the phone needs to subscribe (uncompressed point, base64url).
pub fn public_key(app: &tauri::AppHandle) -> Result<String> {
    Ok(B64.encode(vapid(app)?.verifying_key().to_encoded_point(false).as_bytes()))
}

fn subscriptions(app: &tauri::AppHandle) -> Result<Vec<Value>> {
    let state = app.state::<crate::NativeState>();
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    Ok(db.get_value("pushSubscriptions")?.as_array().cloned().unwrap_or_default())
}
fn save_subscriptions(app: &tauri::AppHandle, list: &[Value]) -> Result<()> {
    let state = app.state::<crate::NativeState>();
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    db.set_value("pushSubscriptions", &json!(list))
}

/// Stores a phone subscription (only Apple/Google/Mozilla push endpoints are accepted).
pub fn subscribe(app: &tauri::AppHandle, sub: &Value) -> Result<()> {
    let endpoint = sub["endpoint"].as_str().ok_or("Invalid subscription")?;
    let host = reqwest::Url::parse(endpoint).ok().and_then(|u| u.host_str().map(str::to_owned)).unwrap_or_default();
    let trusted = endpoint.starts_with("https://")
        && (host.ends_with("push.apple.com") || host.ends_with("googleapis.com") || host.ends_with("mozilla.com") || host.ends_with("windows.com"));
    let keys_ok = sub["keys"]["p256dh"].as_str().is_some_and(|k| B64.decode(k).map(|b| b.len() == 65).unwrap_or(false))
        && sub["keys"]["auth"].as_str().is_some_and(|k| B64.decode(k).map(|b| b.len() == 16).unwrap_or(false));
    if !trusted || !keys_ok || endpoint.len() > 1000 {
        return Err("Invalid subscription".into());
    }
    let mut list: Vec<Value> = subscriptions(app)?.into_iter().filter(|s| s["endpoint"] != endpoint).collect();
    list.push(json!({"endpoint": endpoint, "keys": {"p256dh": sub["keys"]["p256dh"], "auth": sub["keys"]["auth"]}}));
    let excess = list.len().saturating_sub(MAX_SUBSCRIPTIONS);
    list.drain(..excess);
    save_subscriptions(app, &list)
}

pub fn has_subscribers(app: &tauri::AppHandle) -> bool {
    subscriptions(app).map(|l| !l.is_empty()).unwrap_or(false)
}

/// RFC 8291 aes128gcm content encoding for one subscription.
fn encrypt(p256dh: &[u8], auth: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    let ua_public = PublicKey::from_sec1_bytes(p256dh).map_err(|_| "Invalid phone key")?;
    let as_secret = SecretKey::random(&mut OsRng);
    let as_public = as_secret.public_key().to_encoded_point(false);
    let shared = p256::ecdh::diffie_hellman(as_secret.to_nonzero_scalar(), ua_public.as_affine());
    let mut key_info = b"WebPush: info\0".to_vec();
    key_info.extend_from_slice(p256dh);
    key_info.extend_from_slice(as_public.as_bytes());
    let mut ikm = [0u8; 32];
    Hkdf::<Sha256>::new(Some(auth), shared.raw_secret_bytes()).expand(&key_info, &mut ikm).map_err(|_| "Encryption failed")?;
    let salt: [u8; 16] = rand_bytes();
    let prk = Hkdf::<Sha256>::new(Some(&salt), &ikm);
    let (mut cek, mut nonce) = ([0u8; 16], [0u8; 12]);
    prk.expand(b"Content-Encoding: aes128gcm\0", &mut cek).map_err(|_| "Encryption failed")?;
    prk.expand(b"Content-Encoding: nonce\0", &mut nonce).map_err(|_| "Encryption failed")?;
    let mut record = plaintext.to_vec();
    record.push(0x02); // last (and only) record
    let sealed = Aes128Gcm::new_from_slice(&cek).map_err(|_| "Encryption failed")?.encrypt(Nonce::from_slice(&nonce), record.as_slice()).map_err(|_| "Encryption failed")?;
    let mut body = Vec::with_capacity(86 + sealed.len());
    body.extend_from_slice(&salt);
    body.extend_from_slice(&4096u32.to_be_bytes());
    body.push(65);
    body.extend_from_slice(as_public.as_bytes());
    body.extend_from_slice(&sealed);
    Ok(body)
}
fn rand_bytes<const N: usize>() -> [u8; N] {
    use p256::elliptic_curve::rand_core::RngCore;
    let mut out = [0u8; N];
    OsRng.fill_bytes(&mut out);
    out
}

/// VAPID (RFC 8292) authorization header for a push service origin.
fn authorization(key: &SigningKey, endpoint: &str) -> Result<String> {
    let url = reqwest::Url::parse(endpoint).map_err(|_| "Invalid endpoint")?;
    let audience = format!("{}://{}", url.scheme(), url.host_str().unwrap_or_default());
    let exp = chrono::Utc::now().timestamp() + 12 * 3600;
    let header = B64.encode(br#"{"typ":"JWT","alg":"ES256"}"#);
    let claims = B64.encode(json!({"aud": audience, "exp": exp, "sub": CONTACT}).to_string());
    let signing_input = format!("{header}.{claims}");
    let signature: Signature = key.sign(signing_input.as_bytes());
    let public = B64.encode(key.verifying_key().to_encoded_point(false).as_bytes());
    Ok(format!("vapid t={signing_input}.{}, k={public}", B64.encode(signature.to_bytes())))
}

/// Sends a notification to every subscribed phone; expired subscriptions are removed. Returns how many got it.
pub fn send(app: &tauri::AppHandle, title: &str, body: &str) -> Result<usize> {
    let list = subscriptions(app)?;
    if list.is_empty() {
        return Ok(0);
    }
    let key = vapid(app)?;
    let payload = json!({"title": title.chars().take(120).collect::<String>(), "body": body.chars().take(400).collect::<String>()}).to_string();
    let client = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(15)).build().map_err(|_| "Push unavailable")?;
    let (mut sent, mut keep) = (0, Vec::new());
    for sub in list {
        let endpoint = sub["endpoint"].as_str().unwrap_or_default().to_owned();
        let p256dh = B64.decode(sub["keys"]["p256dh"].as_str().unwrap_or_default()).unwrap_or_default();
        let auth = B64.decode(sub["keys"]["auth"].as_str().unwrap_or_default()).unwrap_or_default();
        let result = encrypt(&p256dh, &auth, payload.as_bytes()).and_then(|body| {
            client
                .post(&endpoint)
                .header("Authorization", authorization(&key, &endpoint)?)
                .header("TTL", "86400")
                .header("Urgency", "high")
                .header("Content-Encoding", "aes128gcm")
                .header("Content-Type", "application/octet-stream")
                .body(body)
                .send()
                .map_err(|_| "Push service unreachable".to_string())
        });
        match result {
            Ok(r) if r.status().is_success() => {
                sent += 1;
                keep.push(sub);
            }
            Ok(r) if [404, 410].contains(&r.status().as_u16()) => {} // phone unsubscribed: drop it
            _ => keep.push(sub),
        }
    }
    save_subscriptions(app, &keep)?;
    Ok(sent)
}

/// Fire-and-forget push for a Windows notification, so reminders also reach the phone.
pub fn notify_phone(app: &tauri::AppHandle, title: &str, body: &str) {
    if !has_subscribers(app) {
        return;
    }
    let (app, title, body) = (app.clone(), title.to_owned(), body.to_owned());
    std::thread::spawn(move || {
        let _ = send(&app, &title, &body);
    });
}

#[cfg(test)]
mod tests {
    /// Writes one encrypted message for an independent decryption check (scripts verify with http_ece).
    #[test]
    fn aes128gcm_payload_for_interop_check() {
        use super::*;
        let ua = SecretKey::random(&mut OsRng);
        let ua_public = ua.public_key().to_encoded_point(false);
        let auth: [u8; 16] = rand_bytes();
        let body = encrypt(ua_public.as_bytes(), &auth, "Reminder: أروح الجيم الساعة ٧".as_bytes()).unwrap();
        let out = json!({"private": B64.encode(ua.to_bytes()), "public": B64.encode(ua_public.as_bytes()), "auth": B64.encode(auth), "body": B64.encode(&body)});
        std::fs::write(std::env::temp_dir().join("jarvis-push-check.json"), out.to_string()).unwrap();
        assert_eq!(body[16..20], 4096u32.to_be_bytes());
        assert_eq!(body[20], 65);
    }
}
