//! DoIT's two modes and the windows that show them.
//!
//! - Canvas: the "main" window renders the full React canvas.
//! - Dock: the "tray" window, in one of two shapes: the pill (a small floating button) or the panel
//!   (note list and editor). ONE live webview at a time: entering the dock destroys the canvas
//!   webview (rebuilt on the way back), and returning to the canvas destroys the dock's.
//!
//! Callers name the mode they want and report what the pages and the OS did; where windows go
//! (`placement`, pure and tested) and when webviews are built or freed stays inside this module.
//! Mode switches run on their own thread: window creation must never block a command's thread.

mod drag;
mod geometry;
mod lifecycle;
mod placement;
mod state;

use tauri::{AppHandle, Manager, WebviewWindow, Window, WindowEvent};

pub use lifecycle::WEBVIEW_ARGS;
pub use placement::{DockShape, Growth};

use crate::platform;
use crate::storage::StorageManager;
use state::{engine, Mode};

const CANVAS: &str = "main";
const DOCK: &str = "tray";

/// How the dock opens from the canvas: as the pill, or as the panel (optionally on a note).
#[derive(Debug, Default, Clone)]
pub struct DockOpen {
    pub panel: bool,
    pub note: Option<String>,
}

pub fn in_canvas() -> bool {
    engine().mode == Mode::Canvas
}

/// Shows the canvas, rebuilding it if the dock destroyed it. In the canvas already: brings it forward.
pub fn show_canvas(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || lifecycle::enter_canvas(&app));
}

/// Switches to the dock. In the dock already: brings it forward as it is.
pub fn show_dock(app: &AppHandle, open: DockOpen) {
    let app = app.clone();
    std::thread::spawn(move || {
        let _ = lifecycle::enter_dock(&app, open);
    });
}

/// The canvas page mounted; reveals a rebuilt canvas that was waiting for it.
pub fn canvas_ready(app: &AppHandle) {
    lifecycle::canvas_ready(app);
}

/// The dock page mounted; shows its window and returns the shape the page starts in.
pub fn dock_ready(window: &WebviewWindow) -> DockShape {
    lifecycle::dock_ready(window)
}

/// Changes the dock between pill and panel, returning which way it grew.
pub fn reshape_dock(app: &AppHandle, shape: DockShape) -> Result<Growth, String> {
    lifecycle::reshape_dock(app, shape)
}

/// Starts dragging the dock, grabbed at `grab` (logical px from its top-left). `true` means the app
/// runs the drag and `end_dock_drag` must follow on release; `false` means the OS already ran it.
pub fn begin_dock_drag(window: &WebviewWindow, grab: (f64, f64)) -> bool {
    drag::begin(window, grab)
}

pub fn end_dock_drag(app: &AppHandle) {
    drag::end();
    lifecycle::settle_dock(app);
}

/// After the OS moved the dock: pulls it back wholly onto the usable screen.
pub fn settle_dock(app: &AppHandle) {
    lifecycle::settle_dock(app);
}

/// While an external file has unsaved edits the canvas is never destroyed for the dock.
pub fn set_external_dirty(dirty: bool) {
    engine().external_dirty = dirty;
}

pub fn minimize(window: &Window) -> Result<(), String> {
    if window.label() == CANVAS {
        remember_maximized(window.app_handle());
    }
    window.minimize().map_err(|e| e.to_string())
}

pub fn quit(app: &AppHandle) {
    remember_maximized(app);
    app.exit(0);
}

fn remember_maximized(app: &AppHandle) {
    if let Some(canvas) = app.get_webview_window(CANVAS) {
        if let Ok(maximized) = canvas.is_maximized() {
            let _ = app.state::<StorageManager>().set_is_maximized(maximized);
        }
    }
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::Resized(_) if window.label() == CANVAS => {
            if !window.is_minimized().unwrap_or(true) {
                if let Ok(maximized) = window.is_maximized() {
                    let _ = window.app_handle().state::<StorageManager>().set_is_maximized(maximized);
                }
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            // DoIT manages visibility itself: closing a window never destroys it here.
            api.prevent_close();
            let app = window.app_handle().clone();
            let label = window.label().to_string();
            std::thread::spawn(move || {
                if label == CANVAS {
                    // The canvas's close button docks, or quits if the user turned that off.
                    lifecycle::remember_canvas(&app);
                    if app.state::<StorageManager>().get_dock_on_close() {
                        let _ = lifecycle::enter_dock(&app, DockOpen::default());
                    } else {
                        app.exit(0);
                    }
                } else if platform::has_tray() {
                    // Window-manager close on the dock (Alt+F4, the dock's Quit): hide it; the tray
                    // icon brings it back.
                    if let Some(dock) = app.get_webview_window(&label) {
                        let _ = dock.hide();
                    }
                } else {
                    // No tray icon to come back from (stock GNOME): hiding would leave an invisible
                    // process, so quit as the user asked.
                    quit(&app);
                }
            });
        }
        _ => {}
    }
}
