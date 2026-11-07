//! Everything that differs between operating systems lives behind this module.
//!
//! Callers use only what is re-exported here. Each OS supplies one adapter with the same
//! functions; add a new platform by adding an adapter, never by sprinkling `#[cfg]` elsewhere.
//!
//! - `init()`: runs first thing in `run()`, before Tauri or GTK start.
//! - `TRAY_SKIPS_TASKBAR`: hide the dock-mode window from the taskbar/dock. Off where there may be
//!   no tray icon, so the dock stays a way back to the app.
//! - `has_tray()`: whether a tray icon is visible right now, i.e. whether a hidden window can be
//!   brought back from it.
//! - `DOCK_WINDOW_RESIZABLE`: build the dock window resizable (needed where only resizable windows
//!   accept programmatic resizes; `set_window_bounds` then keeps the size fixed).
//! - `config_dir()`: folder for DoIT's own settings.json (`None` = fall back to the cwd).
//! - `monitor_of_window(window)`: the OS's own answer to "which monitor is this window on?"
//!   (`None` = let the caller fall back to Tauri's geometry-based guess).
//! - `work_area(monitor)`: usable screen rect `(left, top, right, bottom)` in physical px,
//!   i.e. the monitor minus taskbars/panels.
//! - `focus_window(window)`: raise and focus a window the user asked for (shortcut, dock, relaunch).
//! - `set_window_bounds(window, x, y, w, h)`: move + resize the dock window in one step, without
//!   flicker. The user cannot resize it afterwards.
//! - `dock_drag_by_app(window)`: whether the app moves the dock window itself during a drag
//!   (clamped to the screens every step, see `window::drag`) instead of the OS move loop.
//! - `keep_wm_from_moving(window)`: stop the window manager's own move gestures on the dock
//!   window, which could carry it off-screen. Call once it is shown.
//! - `set_webview_memory_level(window, low)`: hint the webview to trim memory while idle.
//! - `prepare_webview(window)`: one-off engine tuning for each newly built webview window.
//! - `release_webview(window)`: free the page's engine resources; call right before `destroy()`.
//! - `documents_dir()`: the user's Documents folder (default parent of the notes folder).
//! - `system_fonts()`: installed font family names, sorted and deduplicated.

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use windows as os;

#[cfg(not(windows))]
mod unix;
#[cfg(not(windows))]
use unix as os;

pub use os::{
    config_dir, dock_drag_by_app, documents_dir, ensure_always_on_top, focus_window, has_tray, init, keep_wm_from_moving, monitor_of_window, prepare_webview, release_webview,
    set_webview_memory_level, set_window_bounds,
    system_fonts, work_area,
    DOCK_WINDOW_RESIZABLE, TRAY_SKIPS_TASKBAR,
};
