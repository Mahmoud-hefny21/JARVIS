use serde_json::{json, Value};

// A task never changes this classification. Anything not explicitly routine
// requires native review, including unknown future actions/settings.
pub fn routine(action: &str, args: &Value, before: &str) -> Option<String> {
    match action {
        "app_window_control" if ["chrome", "vscode"].contains(&args["application"].as_str()?) => {
            Some(format!("app:{}", args["application"].as_str()?))
        }
        "installed_app_open" => Some(format!("installed-app:{}", args["appId"].as_str()?)),
        "system_action"
            if ["chrome", "vscode", "windows-security"].contains(&args["action"].as_str()?) =>
        {
            Some(format!("app:{}", args["action"].as_str()?))
        }
        "open_website" => {
            let url = url::Url::parse(args["url"].as_str()?).ok()?;
            // Navigation without credentials, payload/query or custom protocols.
            if !["http", "https"].contains(&url.scheme())
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return None;
            }
            Some(format!("website:{}", url.as_str()))
        }
        // A user's own task, deleted by their direct command, is routine and recoverable (encrypted backup kept).
        "record_delete" => {
            let record: Value = serde_json::from_str(before).ok()?;
            (record["kind"] == "task").then(|| format!("task-delete:{}", args["id"].as_str().unwrap_or_default()))
        }
        "browser_page_read" if args.as_object().is_some_and(|object| object.is_empty()) => {
            Some("browser-active".into())
        }
        "browser_page_scroll"
            if args.as_object().is_some_and(|object| object.len() == 1)
                && [Some("up"), Some("down")].contains(&args["direction"].as_str()) =>
        {
            Some("browser-active".into())
        }
        "open_project" | "project_copy" => Some(format!("project:{}", args["id"].as_str()?)),
        "skill_save" if args["skill"]["id"].is_string() => Some("new:verified-skill".into()),
        "record_put" => {
            let new = &args["record"];
            let kind = new["kind"].as_str()?;
            if !["task", "memory", "event", "draft", "notification"].contains(&kind) {
                return None;
            }
            if before.is_empty() {
                return Some(format!("new:{kind}"));
            }
            let old: Value = serde_json::from_str(before).ok()?;
            let safe = [
                "done",
                "priority",
                "dueAt",
                "endAt",
                "allDay",
                "recurrence",
                "notifiedAt",
                "updatedAt",
            ];
            if old
                .as_object()?
                .keys()
                .chain(new.as_object()?.keys())
                .any(|k| !safe.contains(&k.as_str()) && old[k] != new[k])
            {
                return None;
            }
            Some(format!("record:{}", new["id"].as_str()?))
        }
        "settings_save" => {
            let old: Value = serde_json::from_str(before).unwrap_or(json!({}));
            let defaults = json!({"sttEngine":"sapi","ttsEngine":"windows","piperExecutable":"","piperModel":"","piperConfig":"","language":"en-US","speak":false,"voice":"","latitude":30.0444,"longitude":31.2357,"location":"Cairo","weatherEnabled":false,"aiMode":"compatible","aiUrl":"","aiModel":"","onlineAiConsent":false,"googleClientId":"","backupEnabled":true,"backupKeep":7,"logRetentionDays":30,"autostart":false,"excludedPaths":[],"overviewLayout":{"version":1,"sides":{},"order":[],"pinned":null,"hidden":false,"extras":[]}});
            let safe = [
                "name",
                "role",
                "interests",
                "lowPower",
                "reducedMotion",
                "dnd",
                "quietStart",
                "quietEnd",
                "monitorKey",
                "minimizeToTray",
                "briefingHour",
                "briefingEnabled",
                "workspacePresets",
                "overviewLayout",
            ];
            for key in old
                .as_object()?
                .keys()
                .chain(args["settings"].as_object()?.keys())
            {
                if !safe.contains(&key.as_str())
                    && old.get(key).or_else(|| defaults.get(key))? != &args["settings"][key]
                {
                    return None;
                }
            }
            Some("preferences".into())
        }
        _ => None,
    }
}
pub fn description(action: &str, a: &Value) -> String {
    let text = |key: &str| a[key].as_str().unwrap_or("not specified").to_owned();
    let operation=match action {
        "record_put"=>format!("Save the {} named “{}”. Existing content may be replaced; an encrypted recovery backup is retained.",a["record"]["kind"].as_str().unwrap_or("record"),a["record"]["title"].as_str().unwrap_or("selected record")),
        "record_delete"=>"Delete the selected local record. An encrypted recovery backup is retained.".into(),
        "settings_save"=>"Save preferences that change privacy, account, network, speech, startup or data-protection settings. Review the selected settings before continuing.".into(),
        "system_action"=>format!("{} Windows now. Save your work before continuing.",text("action")),
        "app_window_control"=>format!("{} the {} window{}.",text("operation"),text("application"),if a["monitorKey"].is_string(){" on the selected connected display"}else{""}),
        "installed_app_open"=>format!("Open {} from the current Windows Start-menu app catalog.",text("name")),
        "open_website"=>format!("Navigate to {}. This address includes data or needs separate review.",a["url"].as_str().and_then(|s|url::Url::parse(s).ok()).and_then(|u|u.host_str().map(str::to_owned)).unwrap_or_else(||"the requested website".into())),
        "browser_page_read"=>"Read visible accessible text from one open Chrome or Edge page locally. Nothing is uploaded. If several browser windows are open and the target cannot be identified safely, JARVIS will stop without reading one.".into(),
        "browser_page_scroll"=>format!("Scroll the currently active browser page {} using Windows accessibility. No page controls or links will be clicked.", text("direction")),
        "browser_link_activate"=>format!("Activate the unique visible browser link labelled ‘{}’. This may navigate the page or trigger the link’s normal site behavior. JARVIS will not activate it if the label is missing, duplicated, hidden, or inaccessible.", text("label")),
        "browser_control"=>if a["kind"] == "button" { format!("Activate the unique visible browser button labelled ‘{}’. It may submit data or trigger a site action. JARVIS will stop if the button is ambiguous or inaccessible.",text("label")) } else { format!("Enter the text you requested into the unique visible browser field labelled ‘{}’. The field may autosave or transmit the value. JARVIS will not submit the form; review the field before proceeding. The value is omitted from the approval log.",text("label")) },
        "project_write"=>format!("Replace the contents of {} in the authorized project. The original is encrypted for recovery.",text("path")),
        "project_copy"=>format!("Copy {} to {} inside the authorized project. Existing destinations are never overwritten.",text("source"),text("destination")),
        "open_project"=>"Open the selected currently authorized project folder.".into(),
        "gmail_send"=>format!("Send an email to {}.\nSubject: {}\n\n{}",text("to"),text("subject"),text("body")),
        "google_event_save"=>"Publish the selected calendar event to your connected Google account.".into(),
        "project_revoke"=>"Revoke access to the selected project folder.".into(),
        "google_disconnect"=>"Disconnect Google and erase the stored account tokens.".into(),
        "codex_disconnect"=>"Disconnect the protected ChatGPT account.".into(),
        "backup_create"=>"Create an encrypted local backup of JARVIS data.".into(),
        "automation_save"=>"Save the selected recurring, read-only automation schedule.".into(),
        "automation_delete"=>"Remove the selected automation schedule.".into(),
        "skill_save"=>format!("Save a local skill note titled ‘{}’. It is a user-reported verified procedure, stored as text only; JARVIS will not run these steps automatically.",a["skill"]["title"].as_str().unwrap_or("selected skill")),
        _=>"Review the requested protected operation.".into()
    };
    format!("{operation}\n\nCancel leaves this action unapplied. Approval is single-use and expires in three minutes.")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn direct_tasks_never_downgrade_risk() {
        assert_eq!(
            routine("app_window_control", &json!({"application":"chrome"}), ""),
            Some("app:chrome".into())
        );
        assert_eq!(
            routine(
                "installed_app_open",
                &json!({"appId":"Example.App!Main"}),
                ""
            ),
            Some("installed-app:Example.App!Main".into())
        );
        for action in [
            "record_delete",
            "project_write",
            "gmail_send",
            "google_event_save",
            "credential_set",
            "speech_install",
        ] {
            assert!(routine(action, &json!({}), "").is_none())
        }
        assert!(routine("system_action", &json!({"action":"shutdown"}), "").is_none());
        assert!(routine(
            "open_website",
            &json!({"url":"https://example.com/?secret=data"}),
            ""
        )
        .is_none());
        assert_eq!(
            routine(
                "open_website",
                &json!({"url":"https://example.com/docs"}),
                ""
            ),
            Some("website:https://example.com/docs".into())
        );
        assert_eq!(
            routine("browser_page_read", &json!({}), ""),
            Some("browser-active".into())
        );
        assert!(routine(
            "browser_page_read",
            &json!({"url":"https://example.com"}),
            ""
        )
        .is_none());
        assert_eq!(
            routine("browser_page_scroll", &json!({"direction":"down"}), ""),
            Some("browser-active".into())
        );
        assert!(routine(
            "browser_page_scroll",
            &json!({"direction":"down","url":"https://example.com"}),
            ""
        )
        .is_none());
        assert!(routine(
            "browser_link_activate",
            &json!({"label":"Privacy Policy"}),
            ""
        )
        .is_none());
        assert!(routine(
            "browser_control",
            &json!({"kind":"button","label":"Continue"}),
            ""
        )
        .is_none());
        assert!(routine(
            "browser_control",
            &json!({"kind":"fill","label":"Search","value":"synthetic"}),
            ""
        )
        .is_none());
    }
    #[test]
    fn settings_and_record_overwrites_fail_closed() {
        let old = json!({"lowPower":false,"onlineAiConsent":false,"excludedPaths":["C:\\Private"]});
        let mut changed = old.clone();
        changed["lowPower"] = json!(true);
        assert!(routine(
            "settings_save",
            &json!({"settings":changed}),
            &old.to_string()
        )
        .is_some());
        changed["excludedPaths"] = json!([]);
        assert!(routine(
            "settings_save",
            &json!({"settings":changed}),
            &old.to_string()
        )
        .is_none());
        let old = json!({"id":"record","kind":"task","title":"original","done":false});
        let mut new = old.clone();
        new["done"] = json!(true);
        assert!(routine("record_put", &json!({"record":new}), &old.to_string()).is_some());
        new["title"] = json!("replaced");
        assert!(routine("record_put", &json!({"record":new}), &old.to_string()).is_none());
        assert!(!description(
            "settings_save",
            &json!({"settings":{"secret":"must-not-appear"}})
        )
        .contains("must-not-appear"));
    }
    #[test]
    fn overview_layout_is_a_safe_scoped_preference_but_unknown_values_are_not() {
        let before = json!({"overviewLayout":{"version":1,"sides":{},"order":[],"pinned":null,"hidden":false}});
        let mut after = before.clone();
        after["overviewLayout"]["sides"]["system-resources"] = json!("right");
        assert_eq!(
            routine(
                "settings_save",
                &json!({"settings":after}),
                &before.to_string()
            ),
            Some("preferences".into())
        );
        after["overviewLayout"]["sides"]["arbitrary"] = json!("right");
        assert!(routine(
            "settings_save",
            &json!({"settings":after}),
            &before.to_string()
        )
        .is_some());
        assert!(crate::integrations::validate_settings(
            &json!({"name":"Sir","overviewLayout":after["overviewLayout"]})
        )
        .is_err());
    }
}

#[cfg(test)]
mod task_delete_tests {
    use super::routine;
    use serde_json::json;
    #[test]
    fn only_own_tasks_are_deleted_without_a_popup() {
        let args = json!({"id":"t1","expectedUpdatedAt":"x"});
        assert_eq!(routine("record_delete", &args, r#"{"kind":"task","title":"Buy milk"}"#).as_deref(), Some("task-delete:t1"));
        assert!(routine("record_delete", &args, r#"{"kind":"memory","title":"Secret"}"#).is_none());
        assert!(routine("record_delete", &args, "").is_none());
    }
}
