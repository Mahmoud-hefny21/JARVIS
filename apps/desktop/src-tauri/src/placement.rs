//! One physical-pixel placement policy for every JARVIS window entry point.
use crate::{db::Result, NativeState};
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Manager, WebviewWindow};
use windows_sys::Win32::{
    Foundation::RECT,
    UI::WindowsAndMessaging::{GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER},
};

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
impl Rect {
    fn right(self) -> i64 {
        self.x as i64 + self.width as i64
    }
    fn bottom(self) -> i64 {
        self.y as i64 + self.height as i64
    }
    fn contains(self, other: Self) -> bool {
        other.x >= self.x
            && other.y >= self.y
            && other.right() <= self.right()
            && other.bottom() <= self.bottom()
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct Display {
    pub key: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(rename = "scaleFactor")]
    pub scale: f64,
    pub primary: bool,
    #[serde(rename = "workArea")]
    pub work: Rect,
    pub label: String,
}
impl Display {
    fn bounds(&self) -> Rect {
        Rect {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
        }
    }
}
#[derive(Default)]
pub struct State {
    busy: AtomicBool,
    dirty: AtomicBool,
    dragging: AtomicBool,
    key: Mutex<Option<String>>,
}

pub fn displays(window: &WebviewWindow) -> Result<Vec<Display>> {
    let primary = window
        .primary_monitor()
        .map_err(|_| "Cannot identify primary display")?;
    let mut monitors = window
        .available_monitors()
        .map_err(|_| "Cannot enumerate displays")?;
    monitors.sort_by_key(|m| (m.position().x, m.position().y));
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let p = m.position();
            let s = m.size();
            let work = m.work_area();
            let primary = primary.as_ref().is_some_and(|v| v.position() == p);
            Display {
                key: format!("{},{}", p.x, p.y),
                name: m
                    .name()
                    .cloned()
                    .unwrap_or_else(|| format!("Display {}", i + 1)),
                x: p.x,
                y: p.y,
                width: s.width,
                height: s.height,
                scale: m.scale_factor(),
                primary,
                work: Rect {
                    x: work.position.x,
                    y: work.position.y,
                    width: work.size.width,
                    height: work.size.height,
                },
                label: format!(
                    "Display {} · {}×{} · {}%{}",
                    i + 1,
                    s.width,
                    s.height,
                    (m.scale_factor() * 100.0).round(),
                    if primary { " · Primary" } else { "" }
                ),
            }
        })
        .collect())
}
fn selected<'a>(monitors: &'a [Display], key: &str) -> Result<&'a Display> {
    monitors
        .iter()
        .find(|m| m.key == key)
        .or_else(|| monitors.iter().find(|m| m.primary))
        .or(monitors.first())
        .ok_or_else(|| "No connected display".into())
}
fn resolve_selection(explicit: Option<&str>, current: Option<String>, saved: String) -> String {
    explicit.map(str::to_owned).or(current).unwrap_or(saved)
}
fn overlap_area(a: Rect, b: Rect) -> i64 {
    let width = (a.right().min(b.right()) - (a.x as i64).max(b.x as i64)).max(0);
    let height = (a.bottom().min(b.bottom()) - (a.y as i64).max(b.y as i64)).max(0);
    width * height
}
fn monitor_for_rect<'a>(
    monitors: &'a [Display],
    rect: Rect,
    preferred: &str,
) -> Result<&'a Display> {
    let center_x = rect.x as i64 + rect.width as i64 / 2;
    let center_y = rect.y as i64 + rect.height as i64 / 2;
    if let Some(monitor) = monitors.iter().find(|m| {
        center_x >= m.x as i64
            && center_x < m.bounds().right()
            && center_y >= m.y as i64
            && center_y < m.bounds().bottom()
    }) {
        return Ok(monitor);
    }
    let greatest = monitors
        .iter()
        .map(|m| overlap_area(rect, m.bounds()))
        .max()
        .unwrap_or(0);
    monitors
        .iter()
        .find(|m| overlap_area(rect, m.bounds()) == greatest && m.key == preferred)
        .or_else(|| {
            monitors
                .iter()
                .find(|m| overlap_area(rect, m.bounds()) == greatest)
        })
        .or_else(|| monitors.iter().find(|m| m.primary))
        .or(monitors.first())
        .ok_or_else(|| "No connected display".into())
}
// Negative virtual-desktop origins are already physical; never scale origins.
fn clamp(rect: Rect, area: Rect) -> Rect {
    let width = rect.width.min(area.width).max(1);
    let height = rect.height.min(area.height).max(1);
    Rect {
        x: (rect.x as i64).clamp(area.x as i64, area.right() - width as i64) as i32,
        y: (rect.y as i64).clamp(area.y as i64, area.bottom() - height as i64) as i32,
        width,
        height,
    }
}
// GetWindowRect/SetWindowPos must share a per-monitor-aware thread context.
#[link(name = "user32")]
extern "system" {
    fn SetThreadDpiAwarenessContext(context: isize) -> isize;
    fn GetAsyncKeyState(key: i32) -> i16;
}
fn left_button_down() -> bool {
    unsafe { GetAsyncKeyState(0x01) < 0 }
}
struct Dpi(isize);
impl Dpi {
    fn enter() -> Self {
        Self(unsafe { SetThreadDpiAwarenessContext(-4) })
    }
}
impl Drop for Dpi {
    fn drop(&mut self) {
        if self.0 != 0 {
            unsafe {
                SetThreadDpiAwarenessContext(self.0);
            }
        }
    }
}
fn actual(window: &WebviewWindow) -> Result<Rect> {
    let _dpi = Dpi::enter();
    let handle = window.hwnd().map_err(|_| "Window handle unavailable")?.0;
    let mut rect: RECT = unsafe { std::mem::zeroed() };
    if unsafe { GetWindowRect(handle as _, &mut rect) } == 0 {
        return Err("Cannot read actual window bounds".into());
    }
    Ok(Rect {
        x: rect.left,
        y: rect.top,
        width: (rect.right - rect.left).max(1) as u32,
        height: (rect.bottom - rect.top).max(1) as u32,
    })
}
fn set_outer(window: &WebviewWindow, rect: Rect) -> Result<()> {
    let _dpi = Dpi::enter();
    let handle = window.hwnd().map_err(|_| "Window handle unavailable")?.0;
    if unsafe {
        SetWindowPos(
            handle as _,
            std::ptr::null_mut(),
            rect.x,
            rect.y,
            rect.width as i32,
            rect.height as i32,
            SWP_NOACTIVATE | SWP_NOZORDER,
        )
    } == 0
    {
        return Err("Windows refused window placement".into());
    }
    Ok(())
}
fn preference(app: &tauri::AppHandle) -> String {
    app.state::<NativeState>()
        .db
        .lock()
        .ok()
        .and_then(|db| db.get_value("preferences").ok())
        .and_then(|s| s["monitorKey"].as_str().map(str::to_owned))
        .unwrap_or_else(|| "primary".into())
}
pub fn repair(app: &tauri::AppHandle) -> Result<()> {
    let window = app.get_webview_window("main").ok_or("Window unavailable")?;
    let state = app.state::<State>();
    if state.dragging.load(Ordering::SeqCst) {
        if left_button_down() {
            return Ok(());
        }
        state.dragging.store(false, Ordering::SeqCst);
        remember_manual_display(app)?;
    }
    if window.is_minimized().unwrap_or(false) {
        return Ok(());
    }
    if state.busy.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let result = (|| {
        let monitors = displays(&window)?;
        let current = state
            .key
            .lock()
            .map_err(|_| "Display selection unavailable")?
            .clone();
        let key = resolve_selection(None, current, preference(app));
        let monitor = selected(&monitors, &key)?;
        // Keep the requested identity, rather than replacing it with a temporary
        // fallback. Reconnecting that display must honor the saved selection.
        let fullscreen = window
            .is_fullscreen()
            .map_err(|_| "Cannot inspect fullscreen")?;
        let before = actual(&window)?;
        let target = if fullscreen {
            monitor.bounds()
        } else {
            clamp(before, monitor.work)
        };
        if before != target {
            set_outer(&window, target)?;
        }
        let after = actual(&window)?;
        if (fullscreen && after != monitor.bounds())
            || (!fullscreen && !monitor.work.contains(after))
        {
            return Err("Window bounds did not match selected display".into());
        }
        Ok(())
    })();
    state.busy.store(false, Ordering::SeqCst);
    result
}
pub fn open(app: &tauri::AppHandle, key: Option<&str>, fullscreen: Option<bool>) -> Result<()> {
    let window = app.get_webview_window("main").ok_or("Window unavailable")?;
    let state = app.state::<State>();
    if let Some(key) = key {
        if key.len() > 32
            || (key != "primary"
                && !key
                    .bytes()
                    .all(|b| b.is_ascii_digit() || b == b'-' || b == b','))
        {
            return Err("Invalid display selection".into());
        }
        *state
            .key
            .lock()
            .map_err(|_| "Display selection unavailable")? = Some(key.into());
    }
    window.unminimize().map_err(|_| "Cannot restore JARVIS")?;
    if let Some(fullscreen) = fullscreen {
        if fullscreen {
            let monitors = displays(&window)?;
            let current = state
                .key
                .lock()
                .map_err(|_| "Display selection unavailable")?
                .clone();
            let key = resolve_selection(key, current, preference(app));
            let monitor = selected(&monitors, &key)?;
            // Use an interior physical point, including on displays left of primary.
            window
                .set_fullscreen_on_monitor(tauri::PhysicalPosition::new(
                    monitor.x as f64 + monitor.width as f64 / 2.0,
                    monitor.y as f64 + monitor.height as f64 / 2.0,
                ))
                .map_err(|_| "Cannot enter fullscreen")?;
        } else {
            window
                .set_fullscreen(false)
                .map_err(|_| "Cannot exit fullscreen")?;
        }
    }
    repair(app)?;
    window.show().map_err(|_| "Cannot show JARVIS")?;
    window.set_focus().map_err(|_| "Cannot focus JARVIS")?;
    state.dirty.store(true, Ordering::SeqCst);
    Ok(())
}
pub fn changed(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<State>() {
        state.dirty.store(true, Ordering::SeqCst);
    }
}
pub fn moved(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<State>() {
        // Do not enumerate monitors or reposition the window on each WM_MOVE.
        state.dragging.store(true, Ordering::SeqCst);
    }
}
fn remember_manual_display(app: &tauri::AppHandle) -> Result<()> {
    let window = app.get_webview_window("main").ok_or("Window unavailable")?;
    if window.is_minimized().unwrap_or(false)
        || window
            .is_fullscreen()
            .map_err(|_| "Cannot inspect fullscreen")?
    {
        return Ok(());
    }
    let monitors = displays(&window)?;
    let rect = actual(&window)?;
    let state = app.state::<State>();
    let preferred = state
        .key
        .lock()
        .map_err(|_| "Display selection unavailable")?
        .clone()
        .unwrap_or_else(|| preference(app));
    let key = monitor_for_rect(&monitors, rect, &preferred)?.key.clone();
    *state
        .key
        .lock()
        .map_err(|_| "Display selection unavailable")? = Some(key.clone());

    // Persist once after the drag ends, never from the high-frequency move callback.
    let native = app.state::<NativeState>();
    let db = native.db.lock().map_err(|_| "Database unavailable")?;
    let mut settings = db.get_value("preferences")?;
    if settings["monitorKey"] != key {
        settings["monitorKey"] = json!(key);
        db.set_value("preferences", &settings)?;
    }
    Ok(())
}
pub fn select(app: &tauri::AppHandle, key: &str) {
    if let Some(state) = app.try_state::<State>() {
        if let Ok(mut selected) = state.key.lock() {
            *selected = Some(key.into());
        }
        state.dirty.store(true, Ordering::SeqCst);
    }
}
pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut topology = String::new();
        let mut ticks = 0;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(200));
            ticks += 1;
            let state = app.state::<State>();
            if state.dragging.load(Ordering::SeqCst) && !left_button_down() {
                state.dragging.store(false, Ordering::SeqCst);
                let _ = remember_manual_display(&app);
                state.dirty.store(true, Ordering::SeqCst);
            }
            if ticks % 10 == 0 {
                if !state.dragging.load(Ordering::SeqCst) {
                    if let Some(window) = app.get_webview_window("main") {
                        if let Ok(monitors) = displays(&window) {
                            let next = serde_json::to_string(&monitors).unwrap_or_default();
                            if next != topology {
                                topology = next;
                                state.dirty.store(true, Ordering::SeqCst);
                            }
                        }
                    }
                }
            }
            if state.dirty.swap(false, Ordering::SeqCst) {
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let _ = repair(&handle);
                });
            }
        }
    });
}
pub fn geometry(app: &tauri::AppHandle) -> Result<Value> {
    let window = app.get_webview_window("main").ok_or("Window unavailable")?;
    let monitors = displays(&window)?;
    let key = app
        .state::<State>()
        .key
        .lock()
        .map_err(|_| "Display selection unavailable")?
        .clone()
        .unwrap_or_else(|| preference(app));
    Ok(
        json!({"outer":actual(&window)?,"fullscreen":window.is_fullscreen().unwrap_or(false),"selected":selected(&monitors,&key)?,"monitors":monitors}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    fn display(x: i32, y: i32, width: u32, height: u32, scale: f64, primary: bool) -> Display {
        Display {
            key: format!("{x},{y}"),
            name: "test".into(),
            x,
            y,
            width,
            height,
            scale,
            primary,
            work: Rect {
                x,
                y,
                width,
                height: height - 40,
            },
            label: "test".into(),
        }
    }
    #[test]
    fn physical_single_dual_triple_and_disconnect() {
        let monitors = [
            display(-2560, -200, 2560, 1440, 1.0, false),
            display(0, 0, 1920, 1080, 1.5, true),
            display(1920, 150, 3840, 2160, 2.0, false),
        ];
        for count in 1..=3 {
            for monitor in &monitors[..count] {
                let r = clamp(
                    Rect {
                        x: -9000,
                        y: -9000,
                        width: 6000,
                        height: 4000,
                    },
                    monitor.work,
                );
                assert!(monitor.work.contains(r));
                assert_eq!(r.x, monitor.x);
                assert_eq!(r.y, monitor.y);
            }
        }
        assert_eq!(selected(&monitors[1..], "-2560,-200").unwrap().key, "0,0");
        assert!(selected(&[], "primary").is_err());
    }
    #[test]
    fn preserves_fitting_bounds_and_never_scales_negative_origins() {
        let monitor = display(-1920, 0, 1920, 1080, 1.5, false);
        let rect = Rect {
            x: -1800,
            y: 30,
            width: 1000,
            height: 700,
        };
        assert_eq!(clamp(rect, monitor.work), rect);
        let r = clamp(
            Rect {
                x: -100,
                y: 900,
                width: 1600,
                height: 1200,
            },
            monitor.work,
        );
        assert_eq!(r.x, -1600);
        assert_eq!(r.y, 0);
        assert!(monitor.work.contains(r));
    }
    #[test]
    fn manual_move_follows_window_center_across_negative_and_mixed_dpi_displays() {
        let monitors = [
            display(-1920, 0, 1920, 1080, 1.0, false),
            display(0, 0, 1280, 720, 1.5, true),
        ];
        let moved_left = Rect {
            x: -1700,
            y: 100,
            width: 900,
            height: 700,
        };
        assert_eq!(
            monitor_for_rect(&monitors, moved_left, "0,0").unwrap().key,
            "-1920,0"
        );
        let moved_right = Rect {
            x: -100,
            y: 30,
            width: 900,
            height: 700,
        };
        let target = monitor_for_rect(&monitors, moved_right, "-1920,0").unwrap();
        assert_eq!(target.key, "0,0");
        assert!(target.work.contains(clamp(moved_right, target.work)));
    }
    #[test]
    fn monitor_gap_uses_greatest_overlap_and_keeps_preferred_on_ties() {
        let monitors = [
            display(-1920, 0, 1800, 1080, 1.0, false),
            display(120, 0, 1280, 720, 1.5, true),
        ];
        let gap = Rect {
            x: -130,
            y: 40,
            width: 260,
            height: 80,
        };
        assert_eq!(
            monitor_for_rect(&monitors, gap, "-1920,0").unwrap().key,
            "-1920,0"
        );
        assert_eq!(
            monitor_for_rect(&monitors, gap, "120,0").unwrap().key,
            "120,0"
        );
    }
    #[test]
    fn fullscreen_uses_explicit_target_then_current_window_then_saved_preference() {
        assert_eq!(
            resolve_selection(None, Some("-1920,0".into()), "0,0".into()),
            "-1920,0",
            "a manual move must win over the stale saved UI preference"
        );
        assert_eq!(
            resolve_selection(Some("0,0"), Some("-1920,0".into()), "primary".into()),
            "0,0",
            "an explicit monitor command must keep its requested target"
        );
        assert_eq!(
            resolve_selection(None, None, "-1920,0".into()),
            "-1920,0",
            "the persisted preference is used when no live selection exists"
        );
    }
}
