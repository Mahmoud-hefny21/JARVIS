use crate::db::{Record, Result};
use serde_json::{json, Value};
pub fn payload(r: &Record) -> Result<Value> {
    r.validate()?;
    if r.kind != "event" {
        return Err("Choose a calendar event".into());
    }
    let start =
        chrono::DateTime::parse_from_rfc3339(&r.due_at).map_err(|_| "Invalid event start")?;
    let end = if r.end_at.is_empty() {
        start
            + if r.all_day {
                chrono::Duration::days(1)
            } else {
                chrono::Duration::hours(1)
            }
    } else {
        chrono::DateTime::parse_from_rfc3339(&r.end_at).map_err(|_| "Invalid event end")?
    };
    if end <= start {
        return Err("Event end must be after its start".into());
    }
    let (start_value, end_value) = if r.all_day {
        let s = start.date_naive();
        let e = end.date_naive();
        if e <= s {
            return Err("All-day end date is exclusive and must be later".into());
        }
        (json!({"date":s.to_string()}), json!({"date":e.to_string()}))
    } else {
        (
            json!({"dateTime":start.to_rfc3339()}),
            json!({"dateTime":end.to_rfc3339()}),
        )
    };
    Ok(json!({"summary":r.title,"description":r.body,"start":start_value,"end":end_value}))
}
pub fn remote_time(item: &Value, key: &str) -> String {
    item[key]["dateTime"]
        .as_str()
        .map(str::to_owned)
        .or_else(|| item[key]["date"].as_str().map(|d| format!("{d}T00:00:00Z")))
        .unwrap_or_default()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_day_uses_exclusive_dates_and_legacy_timed_default_is_retained() {
        let mut r:Record=serde_json::from_value(json!({"id":uuid::Uuid::new_v4().to_string(),"kind":"event","title":"Synthetic event","body":"","createdAt":"2026-11-16T00:00:00Z","updatedAt":"2026-11-16T00:00:00Z","done":false,"priority":"medium","dueAt":"2026-11-16T00:00:00Z","recurrence":"none","projectId":"","role":"","notifiedAt":""})).unwrap();
        assert_eq!(
            payload(&r).unwrap()["end"]["dateTime"],
            "2026-11-16T01:00:00+00:00"
        );
        r.all_day = true;
        assert_eq!(payload(&r).unwrap()["end"]["date"], "2026-11-17");
        r.end_at = "2026-11-15T00:00:00Z".into();
        assert!(payload(&r).is_err());
    }
}
