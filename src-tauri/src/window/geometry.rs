//! The Tauri side of placement: which monitor a window is on, as a `Screen`, and its current rect.

use tauri::{AppHandle, Monitor, Window};

use super::placement::{Rect, Screen};
use crate::platform;

fn to_screen(monitor: &Monitor) -> Screen {
    let (pos, size) = (monitor.position(), monitor.size());
    let (left, top, right, bottom) = platform::work_area(monitor);
    Screen {
        name: monitor.name().cloned(),
        area: Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 },
        work: Rect { x: left, y: top, w: right - left, h: bottom - top },
        scale: monitor.scale_factor(),
    }
}

/// The window's outer rect in physical px.
pub fn rect_of(window: &Window) -> Option<Rect> {
    let (pos, size) = (window.outer_position().ok()?, window.outer_size().ok()?);
    Some(Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 })
}

/// The monitor the window is on: the OS's own answer where it has one, else the monitor under the
/// window's centre, else the one it overlaps most, else the primary.
pub fn screen_of(window: &Window) -> Option<Screen> {
    if let Some(monitor) = platform::monitor_of_window(window).or_else(|| window.current_monitor().ok().flatten()) {
        return Some(to_screen(&monitor));
    }
    let monitors = window.available_monitors().unwrap_or_default();
    let screens: Vec<Screen> = monitors.iter().map(to_screen).collect();
    if let Some(rect) = rect_of(window) {
        let center = (rect.x + rect.w / 2, rect.y + rect.h / 2);
        if let Some(screen) = screens.iter().find(|s| s.area.contains(center)) {
            return Some(screen.clone());
        }
        let overlap = |s: &Screen| {
            let w = rect.right().min(s.area.right()) - rect.x.max(s.area.x);
            let h = rect.bottom().min(s.area.bottom()) - rect.y.max(s.area.y);
            if w > 0 && h > 0 { w as i64 * h as i64 } else { 0 }
        };
        if let Some(best) = screens.iter().filter(|s| overlap(s) > 0).max_by_key(|s| overlap(s)) {
            return Some(best.clone());
        }
    }
    window.primary_monitor().ok().flatten().map(|m| to_screen(&m))
}

pub fn screen_named(window: &Window, name: &str) -> Option<Screen> {
    window.available_monitors().ok()?.iter().find(|m| m.name().is_some_and(|n| n == name)).map(to_screen)
}

pub fn primary_screen(app: &AppHandle) -> Option<Screen> {
    app.primary_monitor().ok().flatten().map(|m| to_screen(&m))
}

/// The usable area of every connected monitor.
pub fn work_areas(window: &Window) -> Vec<Rect> {
    window.available_monitors().unwrap_or_default().iter().map(|m| to_screen(m).work).collect()
}
