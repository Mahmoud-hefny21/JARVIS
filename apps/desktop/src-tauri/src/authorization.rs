//! Ephemeral, bounded capabilities; routine user tasks and confirmed high-impact plans.
use crate::db::Result;
use serde_json::Value;
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

pub const ACTIONS: &[&str] = &[
    "speech_install",
    "codex_disconnect",
    "record_put",
    "record_delete",
    "settings_save",
    "system_action",
    "app_window_control",
    "installed_app_open",
    "open_website",
    "browser_page_read",
    "browser_page_scroll",
    "browser_link_activate",
    "browser_control",
    "skill_save",
    "project_revoke",
    "open_project",
    "credential_set",
    "google_disconnect",
    "gmail_send",
    "google_event_save",
    "backup_create",
    "project_write",
    "project_copy",
    "automation_save",
    "automation_delete",
];
#[derive(Clone)]
pub struct Pending {
    pub action: String,
    pub args: Value,
    pub snapshot: String,
    pub summary: String,
    pub task: Option<String>,
    expires: Instant,
}
#[derive(Default)]
pub struct Broker {
    pending: HashMap<String, Pending>,
    tasks: HashMap<String, Task>,
}
#[derive(Clone, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Scope {
    pub action: String,
    pub resource: String,
}
struct Task {
    scopes: Vec<Scope>,
    expires: Instant,
    remaining: usize,
}
impl Broker {
    pub fn begin_task(&mut self, scopes: Vec<Scope>) -> Result<String> {
        self.tasks
            .retain(|_, t| t.expires > Instant::now() && t.remaining > 0);
        if scopes.is_empty()
            || scopes.len() > 32
            || self.tasks.len() >= 8
            || scopes.iter().any(|s| {
                !ACTIONS.contains(&s.action.as_str())
                    || s.resource.is_empty()
                    || s.resource.len() > 2100
            })
        {
            return Err("Invalid or excessive user task scope".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.tasks.insert(
            id.clone(),
            Task {
                scopes,
                expires: Instant::now() + Duration::from_secs(180),
                remaining: 32,
            },
        );
        Ok(id)
    }
    pub fn authorize(&self, task: &str, action: &str, resource: &str) -> Result<()> {
        self.tasks
            .get(task)
            .filter(|t| {
                t.expires > Instant::now()
                    && t.remaining > 0
                    && t.scopes
                        .iter()
                        .any(|s| s.action == action && s.resource == resource)
            })
            .map(|_| ())
            .ok_or_else(|| "User task expired, cancelled or outside its scope".into())
    }
    pub fn bind(&mut self, id: &str, task: String) -> Result<()> {
        self.pending.get_mut(id).ok_or("Plan unavailable")?.task = Some(task);
        Ok(())
    }
    pub fn cancel_task(&mut self, id: &str) {
        self.tasks.remove(id);
        self.pending.retain(|_, p| p.task.as_deref() != Some(id));
    }
    pub fn prepare(
        &mut self,
        action: String,
        args: Value,
        snapshot: String,
        summary: String,
    ) -> Result<String> {
        self.pending.retain(|_, p| p.expires > Instant::now());
        if !ACTIONS.contains(&action.as_str())
            || !args.is_object()
            || args.to_string().len() > 200_000
        {
            return Err("Action is not supported or exceeds limits".into());
        }
        if self.pending.len() >= 16 {
            return Err("Too many pending approvals; cancel an existing plan".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.pending.insert(
            id.clone(),
            Pending {
                action,
                args,
                snapshot,
                summary,
                task: None,
                expires: Instant::now() + Duration::from_secs(180),
            },
        );
        Ok(id)
    }
    pub fn get(&self, id: &str) -> Result<Pending> {
        self.pending
            .get(id)
            .filter(|p| p.expires > Instant::now())
            .cloned()
            .ok_or("Approval expired, cancelled or already used".into())
    }
    pub fn consume(&mut self, id: &str) -> Result<Pending> {
        // Remove before executing: a failed operation must also require fresh approval.
        let p = self
            .pending
            .remove(id)
            .ok_or("Approval expired, cancelled or already used")?;
        if p.expires <= Instant::now() {
            return Err("Approval expired; review a fresh plan".into());
        }
        if let Some(id) = &p.task {
            let task = self
                .tasks
                .get_mut(id)
                .filter(|t| t.expires > Instant::now() && t.remaining > 0)
                .ok_or("User task expired or cancelled")?;
            task.remaining -= 1;
        }
        Ok(p)
    }
    pub fn cancel(&mut self, id: &str) {
        self.pending.remove(id);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn routine_tasks_are_scoped_bounded_cancelled_and_ephemeral() {
        let mut broker = Broker::default();
        let task = broker
            .begin_task(vec![Scope {
                action: "app_window_control".into(),
                resource: "app:chrome".into(),
            }])
            .unwrap();
        assert!(broker
            .authorize(&task, "app_window_control", "app:chrome")
            .is_ok());
        assert!(broker
            .authorize(&task, "app_window_control", "app:vscode")
            .is_err());
        assert!(Broker::default()
            .authorize(&task, "app_window_control", "app:chrome")
            .is_err());
        let id = broker
            .prepare(
                "app_window_control".into(),
                json!({}),
                String::new(),
                String::new(),
            )
            .unwrap();
        broker.bind(&id, task.clone()).unwrap();
        broker.cancel_task(&task);
        assert!(broker.consume(&id).is_err());
        let task = broker
            .begin_task(vec![Scope {
                action: "settings_save".into(),
                resource: "preferences".into(),
            }])
            .unwrap();
        broker.tasks.get_mut(&task).unwrap().remaining = 0;
        assert!(broker
            .authorize(&task, "settings_save", "preferences")
            .is_err());
        broker.tasks.get_mut(&task).unwrap().remaining = 1;
        broker.tasks.get_mut(&task).unwrap().expires = Instant::now() - Duration::from_secs(1);
        assert!(broker
            .authorize(&task, "settings_save", "preferences")
            .is_err());
    }
    #[test]
    fn window_controls_use_scoped_single_use_approval() {
        let mut broker = Broker::default();
        let args = json!({"application":"chrome","operation":"move","monitorKey":"0,0"});
        let id = broker
            .prepare(
                "app_window_control".into(),
                args.clone(),
                String::new(),
                "Move test window".into(),
            )
            .unwrap();
        assert_eq!(broker.consume(&id).unwrap().args, args);
        assert!(broker.consume(&id).is_err());
    }
    #[test]
    fn installed_app_launch_scope_is_exact() {
        let mut broker = Broker::default();
        let app_id = "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App";
        let task = broker
            .begin_task(vec![Scope {
                action: "installed_app_open".into(),
                resource: format!("installed-app:{app_id}"),
            }])
            .unwrap();
        assert!(broker
            .authorize(
                &task,
                "installed_app_open",
                &format!("installed-app:{app_id}")
            )
            .is_ok());
        assert!(broker
            .authorize(
                &task,
                "installed_app_open",
                "installed-app:Different.App!Main"
            )
            .is_err());
        assert!(broker
            .authorize(&task, "system_action", "app:shutdown")
            .is_err());
    }
    #[test]
    fn capabilities_are_scoped_bounded_single_use_and_cancellable() {
        let mut b = Broker::default();
        assert!(b
            .prepare("shell".into(), json!({}), "".into(), "".into())
            .is_err());
        let id = b
            .prepare(
                "record_delete".into(),
                json!({"id":"original"}),
                "before".into(),
                "Delete original".into(),
            )
            .unwrap();
        assert_eq!(b.get(&id).unwrap().args["id"], "original");
        assert_eq!(b.consume(&id).unwrap().snapshot, "before");
        assert!(b.consume(&id).is_err());
        let id = b
            .prepare(
                "system_action".into(),
                json!({"action":"chrome"}),
                "".into(),
                "".into(),
            )
            .unwrap();
        b.cancel(&id);
        assert!(b.get(&id).is_err());
        let id = b
            .prepare("system_action".into(), json!({}), "".into(), "".into())
            .unwrap();
        b.pending.get_mut(&id).unwrap().expires = Instant::now() - Duration::from_secs(1);
        assert!(b.consume(&id).is_err());
    }
}
