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
//! - `ensure_always_on_top(window)`: put the dock back above other apps; call after moves and focus
//!   changes, which can push it behind.
//! - `set_window_bounds(window, x, y, w, h)`: move + resize the dock window in one step, without
//!   flicker. The user cannot resize it afterwards.
//! - `dock_drag_by_app(window)`: whether the app moves the dock window itself during a drag
//!   (clamped to the screens every step, see `window::drag`) instead of the OS move loop.
//! - `keep_wm_from_moving(window)`: stop the window manager's own move gestures on the dock
//!   window, which could carry it off-screen. Call once it is shown.
//! - `map_invisibly(window)`: map a window that must not be seen yet, so its page can paint (a
//!   window mapped visibly before its first paint shows black). `make_visible(window)` ends that.
//! - `BROWSER_ARGS`: engine arguments every webview is built with (only WebView2 takes any).
//! - `set_webview_memory_level(window, low)`: hint the webview to trim memory while idle.
//! - `prepare_webview(window)`: one-off engine tuning for each newly built webview window.
//! - `release_webview(window)`: free the page's engine resources; call right before `destroy()`.
//! - `trim_memory()`: hand freed heap pages back to the system (after a webview closed).
//!
//! The webview items are used only by `window::webview`, which calls them in the right order.
//! - `attach_pill(window, on_input)`: turn a plain window into the native dock pill's surface and
//!   report pointer input on it. `present_pill(window, frame)`: show a rendered frame on it.
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

/// Pointer input on the native pill, in logical px from the window's top-left.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PillInput {
    Enter,
    Leave,
    Press(f64, f64),
    Move(f64, f64),
    Release(f64, f64),
    /// The secondary button: open the pill's context menu.
    Menu,
}

/// One rendered pill frame: premultiplied RGBA rows, `width` x `height` physical px, for a window
/// at `scale` (physical px per logical px).
pub struct PillFrame {
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub rgba: Vec<u8>,
}

pub type PillInputHandler = Box<dyn Fn(PillInput) + Send + Sync>;

pub use os::{
    attach_pill, present_pill, ensure_always_on_top,
    config_dir, dock_drag_by_app, documents_dir, focus_window, has_tray, init, keep_wm_from_moving, monitor_of_window, prepare_webview, release_webview,
    make_visible, map_invisibly, set_webview_memory_level, set_window_bounds,
    system_fonts, trim_memory, work_area,
    BROWSER_ARGS, DOCK_WINDOW_RESIZABLE, TRAY_SKIPS_TASKBAR,
};
