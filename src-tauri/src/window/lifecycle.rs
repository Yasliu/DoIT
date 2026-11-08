//! Moving between the canvas and the dock: building, revealing, suspending and destroying their
//! webviews, and placing them through `placement`.

use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use super::geometry::{primary_screen, rect_of, screen_named, screen_of};
use super::placement::{
    canvas_placement, clamp_into, dock_home, dock_size, reshape, CanvasGeometry, CanvasPlacement, DockShape, Growth, Rect,
};
use super::state::{engine, Mode};
use super::{DockOpen, CANVAS, DOCK};
use crate::platform;
use crate::storage::StorageManager;

/// Identical browser arguments on EVERY window: WebView2 shares one browser/GPU process tree per
/// (user-data-folder + arguments) pair, so mismatching args would spawn a second tree.
pub const WEBVIEW_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --js-flags=--expose-gc --disable-background-networking --disk-cache-size=8388608 --in-process-gpu";

/// Forces a V8 garbage collection inside the page (needs --js-flags=--expose-gc).
fn flush_webview_memory(window: &WebviewWindow) {
    let _ = window.eval("try{if(window.gc){window.gc();}}catch(e){}");
}

fn place(window: &WebviewWindow, rect: Rect) {
    platform::set_window_bounds(window, rect.x, rect.y, rect.w as u32, rect.h as u32);
}

fn focus(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    platform::focus_window(window);
}

/// Saves how the canvas looks, so coming back from the dock restores it.
pub fn remember_canvas(app: &AppHandle) {
    let Some(canvas) = app.get_webview_window(CANVAS) else { return };
    let maximized = canvas.is_maximized().unwrap_or(false);
    // `set_size` takes the inner size, so remember that (the outer frame can be larger on Linux,
    // which grew the canvas on every trip through the dock).
    let rect = rect_of(&canvas).zip(canvas.inner_size().ok()).map(|(outer, inner)| Rect { w: inner.width as i32, h: inner.height as i32, ..outer });
    engine().canvas = Some(CanvasGeometry {
        maximized,
        fullscreen: canvas.is_fullscreen().unwrap_or(false),
        rect,
        screen: screen_of(&canvas).and_then(|s| s.name),
    });
    let _ = app.state::<StorageManager>().set_is_maximized(maximized);
}

/// Dock mode: the canvas webview is DESTROYED (after the page flushed pending saves), so the engine
/// reclaims its renderer and whole layout tree. It is rebuilt from the window config on demand.
fn suspend_canvas(app: &AppHandle) {
    let Some(canvas) = app.get_webview_window(CANVAS) else { return };
    let _ = canvas.hide();
    {
        let state = engine();
        if state.canvas_suspended || state.external_dirty {
            return;
        }
    }
    let _ = app.emit_to(CANVAS, "flush-pending", ());
    std::thread::sleep(Duration::from_millis(350));
    // The canvas came back in the meantime, or an external file has unsaved edits: leave it alone.
    if engine().mode == Mode::Canvas || engine().external_dirty {
        return;
    }
    flush_webview_memory(&canvas);
    platform::release_webview(&canvas);
    if canvas.destroy().is_ok() {
        engine().canvas_suspended = true;
    }
}

/// Rebuilds the (hidden) canvas window from its config; the page calls `canvas_ready` when mounted.
fn rebuild_canvas(app: &AppHandle) -> Option<WebviewWindow> {
    let config = app.config().app.windows.iter().find(|w| w.label == CANVAS)?.clone();
    let window = tauri::WebviewWindowBuilder::from_config(app, &config).ok()?.visible(false).build().ok()?;
    platform::prepare_webview(&window);
    engine().canvas_suspended = false;
    Some(window)
}

/// Shows the canvas and tears the dock webview down completely (frees its renderer).
fn reveal_canvas(app: &AppHandle) {
    if let Some(canvas) = app.get_webview_window(CANVAS) {
        focus(&canvas);
    }
    if let Some(dock) = app.get_webview_window(DOCK) {
        platform::release_webview(&dock);
        let _ = dock.destroy();
    }
}

/// The dock window, built hidden on demand (its page calls `dock_ready` once mounted).
fn ensure_dock(app: &AppHandle) -> Result<(WebviewWindow, bool), String> {
    if let Some(existing) = app.get_webview_window(DOCK) {
        return Ok((existing, false));
    }
    let window = tauri::WebviewWindowBuilder::new(app, DOCK, tauri::WebviewUrl::App("index.html?window=tray".into()))
        .title("DoIT Companion")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .resizable(platform::DOCK_WINDOW_RESIZABLE)
        .skip_taskbar(platform::TRAY_SKIPS_TASKBAR)
        .visible(false)
        .additional_browser_args(WEBVIEW_ARGS)
        .build()
        .map_err(|e| e.to_string())?;
    platform::prepare_webview(&window);
    Ok((window, true))
}

pub fn enter_dock(app: &AppHandle, open: DockOpen) -> Result<(), String> {
    let current = engine().mode;
    if let (Mode::Dock(_), Some(dock)) = (current, app.get_webview_window(DOCK)) {
        focus(&dock);
        return Ok(());
    }
    let canvas = app.get_webview_window(CANVAS).filter(|c| c.is_visible().unwrap_or(false));
    if canvas.is_some() {
        remember_canvas(app);
    }
    let (dock, created) = ensure_dock(app)?;
    let shape = if open.panel { DockShape::Panel } else { DockShape::Pill };
    let screen = canvas
        .as_ref()
        .and_then(screen_of)
        .or_else(|| screen_of(&dock))
        .or_else(|| primary_screen(app));
    {
        let mut state = engine();
        state.mode = Mode::Dock(shape);
        state.dock_start = shape;
        state.dock_screen = screen.as_ref().and_then(|s| s.name.clone());
        state.hold_moves(Duration::from_millis(350));
    }
    if let Some(screen) = &screen {
        place(&dock, dock_home(shape, screen));
    }
    if !created {
        let _ = dock.show();
        let _ = dock.set_always_on_top(true);
        platform::focus_window(&dock);
        let _ = dock.emit("set-expanded", open.panel);
        if let (true, Some(id)) = (open.panel, open.note) {
            let _ = dock.emit("open-note", id);
        }
    }
    suspend_canvas(app);
    Ok(())
}

/// The dock page mounted inside its hidden, pre-placed window: place it on the monitor it was opened
/// for, show it, and tell the page which shape to start in.
pub fn dock_ready(window: &WebviewWindow) -> DockShape {
    let (shape, screen_name) = {
        let mut state = engine();
        (state.dock_start, state.dock_screen.take())
    };
    let screen = screen_name.and_then(|name| screen_named(window, &name)).or_else(|| screen_of(window));
    if let Some(screen) = &screen {
        place(window, dock_home(shape, screen));
    }
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    platform::keep_wm_from_moving(window);
    platform::focus_window(window);
    shape
}

/// Changes the dock between pill and panel in place (the page hides its content meanwhile).
pub fn reshape_dock(app: &AppHandle, shape: DockShape) -> Result<Growth, String> {
    let dock = app.get_webview_window(DOCK).ok_or_else(|| "the dock is not open".to_string())?;
    let current = rect_of(&dock).ok_or_else(|| "the dock has no position".to_string())?;
    let screen = screen_of(&dock).or_else(|| primary_screen(app)).ok_or_else(|| "monitor not found".to_string())?;
    let (rect, growth) = reshape(current, dock_size(shape, &screen), &screen);
    {
        let mut state = engine();
        state.mode = Mode::Dock(shape);
        state.hold_moves(Duration::from_millis(250));
    }
    place(&dock, rect);
    let idle = shape == DockShape::Pill;
    if idle {
        flush_webview_memory(&dock);
    }
    platform::set_webview_memory_level(&dock, idle);
    Ok(growth)
}

/// After the OS moved the dock, pulls it back wholly onto the usable screen.
pub fn settle_dock(app: &AppHandle) {
    if engine().moves_held() {
        return;
    }
    let Some(dock) = app.get_webview_window(DOCK) else { return };
    let (Some(rect), Some(screen)) = (rect_of(&dock), screen_of(&dock).or_else(|| primary_screen(app))) else { return };
    let settled = clamp_into(rect, screen.work);
    if settled != rect {
        let _ = dock.set_position(tauri::PhysicalPosition::new(settled.x, settled.y));
    }
}

pub fn enter_canvas(app: &AppHandle) {
    if let (Mode::Canvas, Some(canvas)) = (engine().mode, app.get_webview_window(CANVAS)) {
        focus(&canvas);
        return;
    }
    let (canvas, rebuilt) = match app.get_webview_window(CANVAS) {
        Some(window) => (window, false),
        None => match rebuild_canvas(app) {
            Some(window) => (window, true),
            None => return,
        },
    };
    let screen = app
        .get_webview_window(DOCK)
        .as_ref()
        .and_then(screen_of)
        .or_else(|| screen_of(&canvas))
        .or_else(|| primary_screen(app));
    let saved = {
        let mut state = engine();
        state.mode = Mode::Canvas;
        state.canvas.clone()
    };
    match canvas_placement(saved.as_ref(), screen.as_ref()) {
        CanvasPlacement::Fullscreen { at } => {
            if let Some((x, y)) = at {
                let _ = canvas.set_position(tauri::PhysicalPosition::new(x, y));
            }
            let _ = canvas.set_fullscreen(true);
        }
        CanvasPlacement::Maximized { at } => {
            if let Some((x, y)) = at {
                let _ = canvas.set_position(tauri::PhysicalPosition::new(x, y));
            }
            let _ = canvas.maximize();
        }
        CanvasPlacement::Restore(rect) => set_rect(&canvas, rect),
        CanvasPlacement::Centered(rect) => {
            if !canvas.is_maximized().unwrap_or(false) && !canvas.is_fullscreen().unwrap_or(false) {
                set_rect(&canvas, rect);
            }
        }
        CanvasPlacement::Keep => {}
    }

    if rebuilt {
        // The page is loading in a fresh webview: reveal it when it reports ready, or after a timeout.
        engine().canvas_reveal_pending = true;
        std::thread::sleep(Duration::from_millis(3000));
        canvas_ready(app);
    } else {
        reveal_canvas(app);
    }
}

fn set_rect(window: &WebviewWindow, rect: Rect) {
    let _ = window.set_size(tauri::PhysicalSize::new(rect.w as u32, rect.h as u32));
    let _ = window.set_position(tauri::PhysicalPosition::new(rect.x, rect.y));
}

/// The canvas page mounted (or the reveal timeout passed): show it if a rebuilt canvas is waiting.
pub fn canvas_ready(app: &AppHandle) {
    let pending = std::mem::take(&mut engine().canvas_reveal_pending);
    if pending {
        reveal_canvas(app);
    }
}
