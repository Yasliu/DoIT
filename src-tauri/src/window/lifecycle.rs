//! Moving between the canvas, the pill and the panel: showing and hiding their windows, building and
//! retiring webviews, and placing everything through `placement`.
//!
//! Which surface is live in each mode:
//! - Canvas: the canvas webview. The pill window and the dock webview do not exist.
//! - Dock(Pill): the native pill only. The dock webview stays hidden for `PANEL_KEEPALIVE` after the
//!   panel closes (so reopening is instant), then is retired. Hovering the pill builds it hidden
//!   the same way, so the click that follows finds it ready.
//! - Dock(Panel): the dock webview. The pill window is hidden.

use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, Window};

use super::flush;
use super::geometry::{primary_screen, rect_of, screen_named, screen_of};
use super::placement::{
    canvas_placement, clamp_into, dock_home, dock_size, reshape, CanvasGeometry, CanvasPlacement, DockShape, Growth, Rect, Screen,
};
use super::pill;
use super::state::{engine, Mode};
use super::webview::{self, Surface};
use super::{DockOpen, CANVAS, DOCK};
use crate::platform;
use crate::storage::StorageManager;

/// How long a closed panel's webview is kept (hidden) before it is retired.
const PANEL_KEEPALIVE: Duration = Duration::from_secs(20);
/// How long the canvas stays alive (hidden) behind the pill, so a quick trip back is instant.
const CANVAS_KEEPALIVE: Duration = Duration::from_secs(20);

fn plain(window: &WebviewWindow) -> Window {
    window.as_ref().window()
}

fn place(window: &Window, rect: Rect) {
    platform::set_window_bounds(window, rect.x, rect.y, rect.w as u32, rect.h as u32);
}

fn focus(window: &Window) {
    let _ = window.unminimize();
    let _ = window.show();
    platform::focus_window(window);
}

fn screen_or_primary(app: &AppHandle, window: Option<&Window>) -> Option<Screen> {
    window.and_then(screen_of).or_else(|| primary_screen(app))
}

/// Saves how the canvas looks, so coming back from the dock restores it.
pub fn remember_canvas(app: &AppHandle) {
    let Some(canvas) = app.get_webview_window(CANVAS) else { return };
    let canvas = plain(&canvas);
    let maximized = canvas.is_maximized().unwrap_or(false);
    // `set_size` takes the inner size, so remember that (the outer frame can be larger on Linux,
    // which grew the canvas on every trip through the dock).
    let rect = rect_of(&canvas)
        .zip(canvas.inner_size().ok())
        .map(|(outer, inner)| Rect { w: inner.width as i32, h: inner.height as i32, ..outer });
    engine().canvas = Some(CanvasGeometry {
        maximized,
        fullscreen: canvas.is_fullscreen().unwrap_or(false),
        rect,
        screen: screen_of(&canvas).and_then(|s| s.name),
    });
    let _ = app.state::<StorageManager>().set_is_maximized(maximized);
}

/// Dock mode: the canvas webview is DESTROYED (after the page flushed pending saves), so the engine
/// reclaims its renderer and whole layout tree. It is rebuilt on the way back. Behind the pill it
/// lives for `CANVAS_KEEPALIVE` first; the panel retires it at once, to keep to one page.
fn suspend_canvas(app: &AppHandle, keep_alive: bool) {
    let Some(canvas) = app.get_webview_window(CANVAS) else { return };
    let _ = canvas.hide();
    let departure = {
        let mut state = engine();
        if state.canvas_suspended || state.external_dirty {
            return;
        }
        state.canvas_departure += 1;
        state.canvas_departure
    };
    flush::pages(app, &[CANVAS]);
    if keep_alive {
        std::thread::sleep(CANVAS_KEEPALIVE);
        if engine().canvas_departure != departure {
            return;
        }
    }
    retire_canvas(app);
}

/// Destroys the hidden canvas, unless it came back or an external file has unsaved edits.
fn retire_canvas(app: &AppHandle) {
    let Some(canvas) = app.get_webview_window(CANVAS) else { return };
    if engine().mode == Mode::Canvas || engine().external_dirty {
        return;
    }
    if webview::retire(&canvas) {
        engine().canvas_suspended = true;
    }
}

/// Rebuilds the (hidden) canvas; its page calls `canvas_ready` when mounted.
fn rebuild_canvas(app: &AppHandle) -> Option<WebviewWindow> {
    let window = webview::open(app, Surface::Canvas, false).ok()?;
    engine().canvas_suspended = false;
    Some(window)
}

/// Shows the canvas and tears the dock down completely: pill window, panel webview and all.
fn reveal_canvas(app: &AppHandle) {
    if let Some(canvas) = app.get_webview_window(CANVAS) {
        focus(&plain(&canvas));
        platform::make_visible(&plain(&canvas));
    }
    if let Some(dock) = app.get_webview_window(DOCK) {
        webview::retire(&dock);
    }
    pill::close(app);
}

fn pill_actions() -> pill::Actions {
    pill::Actions {
        open_panel: open_panel_from_pill,
        hovered: prepare_panel,
        begin_drag: super::drag::begin,
        end_drag: |app| {
            super::drag::end();
            settle_pill(app);
        },
        open_menu: open_pill_menu,
    }
}

fn show_pill(app: &AppHandle, rect: Rect) {
    let _ = pill::show(app, rect, pill_actions());
}

pub fn enter_dock(app: &AppHandle, open: DockOpen) -> Result<(), String> {
    if let Mode::Dock(shape) = engine().mode {
        let live = match shape {
            DockShape::Pill => pill::window(app),
            DockShape::Panel => app.get_webview_window(DOCK).map(|w| plain(&w)),
        };
        if let Some(window) = live {
            focus(&window);
            return Ok(());
        }
    }
    let canvas = app.get_webview_window(CANVAS).map(|c| plain(&c)).filter(|c| c.is_visible().unwrap_or(false));
    if canvas.is_some() {
        remember_canvas(app);
    }
    let shape = if open.panel { DockShape::Panel } else { DockShape::Pill };
    let screen = screen_or_primary(app, canvas.as_ref());
    {
        let mut state = engine();
        state.mode = Mode::Dock(shape);
        state.dock_screen = screen.as_ref().and_then(|s| s.name.clone());
        state.dock_note = open.note.clone();
        state.dock_anchor = None;
        state.dock_generation += 1;
        state.hold_moves(Duration::from_millis(350));
    }
    let home = screen.as_ref().map(|s| dock_home(shape, s));
    match shape {
        // The pill needs no webview at all.
        DockShape::Pill => {
            if let Some(home) = home {
                show_pill(app, home);
            }
        }
        DockShape::Panel => match app.get_webview_window(DOCK) {
            // The page calls `dock_ready` once it has loaded, which places and shows the window.
            None => open_dock_page(app)?,
            Some(dock) => {
                if let Some(home) = home {
                    place(&plain(&dock), home);
                }
                webview::idle(&dock, false);
                focus(&plain(&dock));
                platform::ensure_always_on_top(&plain(&dock));
                let _ = dock.emit("set-expanded", true);
                if let Some(id) = open.note {
                    let _ = dock.emit("open-note", id);
                }
            }
        },
    }
    suspend_canvas(app, shape == DockShape::Pill);
    Ok(())
}

/// The dock page mounted: shows the panel where it belongs and tells the page which shape it is in
/// and which note to open. A page that reloads while the dock is a pill stays hidden.
pub fn dock_ready(window: &WebviewWindow) -> (DockShape, Option<String>) {
    let app = window.app_handle();
    let (mode, screen_name, anchor, note) = {
        let mut state = engine();
        state.dock_page_ready = true;
        (state.mode, state.dock_screen.take(), state.dock_anchor.take(), state.dock_note.take())
    };
    if mode != Mode::Dock(DockShape::Panel) {
        return (DockShape::Pill, None);
    }
    let dock = plain(window);
    let screen = screen_name.and_then(|name| screen_named(&dock, &name)).or_else(|| screen_or_primary(app, Some(&dock)));
    if let Some(screen) = &screen {
        let rect = match anchor {
            // Opened from the pill: grow out of it.
            Some(pill) => reshape(pill, dock_size(DockShape::Panel, screen), screen).0,
            None => dock_home(DockShape::Panel, screen),
        };
        place(&dock, rect);
    }
    let _ = dock.show();
    platform::ensure_always_on_top(&dock);
    platform::keep_wm_from_moving(&dock);
    platform::focus_window(&dock);
    pill::hide(app);
    (DockShape::Panel, note)
}

/// Builds the dock's webview, hidden; its page reports in through `dock_ready`.
fn open_dock_page(app: &AppHandle) -> Result<(), String> {
    engine().dock_page_ready = false;
    webview::open(app, Surface::Dock, false).map(|_| ())
}

/// The pointer is on the pill, so a click is likely: start the panel's page now, hidden, and retire
/// it again like any kept panel if no click comes. Not while the canvas is alive: at most one page.
fn prepare_panel(app: &AppHandle) {
    let generation = {
        let state = engine();
        if state.mode != Mode::Dock(DockShape::Pill) {
            return;
        }
        state.dock_generation
    };
    if app.get_webview_window(DOCK).is_some() || app.get_webview_window(CANVAS).is_some() {
        return;
    }
    if open_dock_page(app).is_ok() {
        retire_panel_later(app, generation);
    }
}

/// Makes the panel the dock's shape, growing out of the pill, once its page shows it.
fn expect_panel_from_pill(app: &AppHandle) {
    let mut state = engine();
    state.mode = Mode::Dock(DockShape::Panel);
    state.dock_anchor = pill::window(app).and_then(|w| rect_of(&w));
    state.dock_screen = None;
    state.dock_generation += 1;
}

/// The pill was clicked: open the panel, reusing a kept webview or building one.
fn open_panel_from_pill(app: &AppHandle) {
    if engine().mode != Mode::Dock(DockShape::Pill) {
        return;
    }
    retire_canvas(app);
    match app.get_webview_window(DOCK) {
        // The kept page expands itself and calls `reshape_dock(Panel)`.
        Some(dock) if engine().dock_page_ready => {
            let _ = dock.emit("set-expanded", true);
        }
        // The hover's page is still loading: `dock_ready` shows it as the panel.
        Some(_) => expect_panel_from_pill(app),
        None => {
            expect_panel_from_pill(app);
            if open_dock_page(app).is_err() {
                engine().mode = Mode::Dock(DockShape::Pill);
            }
        }
    }
}

/// The page switches the dock between pill and panel: the panel grows out of the pill (and shrinks
/// back into it), each keeping the corner nearest the screen edge.
pub fn reshape_dock(app: &AppHandle, shape: DockShape) -> Result<Growth, String> {
    let dock = app.get_webview_window(DOCK).ok_or_else(|| "the dock is not open".to_string())?;
    let panel = plain(&dock);
    let pill_window = pill::window(app).filter(|_| pill::is_visible(app));
    let from = match shape {
        DockShape::Panel => pill_window.as_ref().unwrap_or(&panel),
        DockShape::Pill => &panel,
    };
    let current = rect_of(from).ok_or_else(|| "the dock has no position".to_string())?;
    let screen = screen_or_primary(app, Some(from)).ok_or_else(|| "monitor not found".to_string())?;
    let (rect, growth) = reshape(current, dock_size(shape, &screen), &screen);
    let generation = {
        let mut state = engine();
        state.mode = Mode::Dock(shape);
        state.dock_generation += 1;
        state.hold_moves(Duration::from_millis(250));
        state.dock_generation
    };
    match shape {
        DockShape::Panel => {
            place(&panel, rect);
            webview::idle(&dock, false);
            let _ = panel.show();
            platform::ensure_always_on_top(&panel);
            platform::focus_window(&panel);
            pill::hide(app);
        }
        DockShape::Pill => {
            show_pill(app, rect);
            let _ = panel.hide();
            webview::idle(&dock, true);
            retire_panel_later(app, generation);
        }
    }
    Ok(growth)
}

/// Retires the hidden panel webview unless the panel reopened (or anything else moved the dock on).
fn retire_panel_later(app: &AppHandle, generation: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(PANEL_KEEPALIVE);
        let still_idle = |queued: u64| {
            let state = engine();
            state.dock_generation == queued && state.mode == Mode::Dock(DockShape::Pill)
        };
        if !still_idle(generation) {
            return;
        }
        if let Some(dock) = app.get_webview_window(DOCK) {
            flush::pages(&app, &[DOCK]);
            if still_idle(generation) {
                webview::retire(&dock);
            }
        }
    });
}

fn settle(app: &AppHandle, window: &Window) {
    if !engine().moves_held() {
        if let (Some(rect), Some(screen)) = (rect_of(window), screen_or_primary(app, Some(window))) {
            let settled = clamp_into(rect, screen.work);
            if settled != rect {
                place(window, settled);
            }
        }
    }
    platform::ensure_always_on_top(window);
}

/// After the OS moved the panel, pulls it back wholly onto the usable screen.
pub fn settle_dock(app: &AppHandle) {
    if let Some(dock) = app.get_webview_window(DOCK) {
        settle(app, &plain(&dock));
    }
}

fn settle_pill(app: &AppHandle) {
    if let Some(window) = pill::window(app) {
        settle(app, &window);
    }
}

fn open_pill_menu(app: &AppHandle, window: &Window) {
    let (handle, window) = (app.clone(), window.clone());
    let _ = app.run_on_main_thread(move || {
        if let Ok(menu) = super::dock_menu(&handle) {
            let _ = window.popup_menu(&menu);
        }
    });
}

pub fn enter_canvas(app: &AppHandle) {
    if let (Mode::Canvas, Some(canvas)) = (engine().mode, app.get_webview_window(CANVAS)) {
        focus(&plain(&canvas));
        return;
    }
    let (canvas, rebuilt) = match app.get_webview_window(CANVAS) {
        Some(window) => (window, false),
        None => match rebuild_canvas(app) {
            Some(window) => (window, true),
            None => return,
        },
    };
    let canvas_window = plain(&canvas);
    let dock_window = match engine().mode {
        Mode::Dock(DockShape::Pill) => pill::window(app),
        _ => app.get_webview_window(DOCK).map(|w| plain(&w)),
    };
    let screen = dock_window.as_ref().and_then(screen_of).or_else(|| screen_or_primary(app, Some(&canvas_window)));
    let saved = {
        let mut state = engine();
        state.mode = Mode::Canvas;
        state.dock_generation += 1;
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
        reveal_canvas_when_ready(app);
    } else {
        reveal_canvas(app);
    }
}

fn set_rect(window: &WebviewWindow, rect: Rect) {
    let _ = window.set_size(tauri::PhysicalSize::new(rect.w as u32, rect.h as u32));
    let _ = window.set_position(tauri::PhysicalPosition::new(rect.x, rect.y));
}

/// The page is loading in a fresh webview: reveal it when it reports ready, or after a timeout.
pub fn reveal_canvas_when_ready(app: &AppHandle) {
    engine().canvas_reveal_pending = true;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(3000));
        canvas_ready(&app);
    });
}

/// The canvas's page has begun loading: map its window, still invisible, so the page can paint.
pub fn canvas_loading(app: &AppHandle) {
    if !engine().canvas_reveal_pending {
        return;
    }
    if let Some(canvas) = app.get_webview_window(CANVAS) {
        platform::map_invisibly(&plain(&canvas));
    }
}

/// The canvas page has painted or mounted (or the reveal timeout passed): show it if it is waiting.
pub fn canvas_ready(app: &AppHandle) {
    let pending = std::mem::take(&mut engine().canvas_reveal_pending);
    if pending {
        reveal_canvas(app);
    }
}
