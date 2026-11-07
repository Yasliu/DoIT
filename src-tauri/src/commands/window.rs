use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, Window};

use crate::models::QuadrantInfo;
use crate::platform;
use crate::storage::StorageManager;
use crate::window::geometry::{clamp_to_monitor, get_window_active_monitor, position_tray_on_monitor, tray_panel_logical, TRAY_PANEL_H, TRAY_PANEL_W};
use crate::window::lifecycle::{flush_webview_memory, open_canvas_mode_inner, open_tray_mode_inner, reveal_canvas};
use crate::window::state::*;

#[tauri::command]
pub fn toggle_window_minimize(window: Window) -> Result<(), String> {
    if window.label() == "main" {
        if let Ok(is_max) = window.is_maximized() {
            let app = window.app_handle();
            let storage = app.state::<StorageManager>();
            let _ = storage.set_is_maximized(is_max);
        }
    }
    window.minimize().map_err(|e| e.to_string())
}


#[tauri::command]
pub fn canvas_ready(app: AppHandle) {
    if MAIN_SHOW_PENDING.swap(false, Ordering::SeqCst) {
        reveal_canvas(&app);
    }
}

#[tauri::command]
pub fn set_external_dirty(dirty: bool) {
    EXTERNAL_DIRTY.store(dirty, Ordering::SeqCst);
}

#[tauri::command]
pub fn open_tray_mode(
    app: AppHandle,
    has_active_note: Option<bool>,
    note_id: Option<String>,
) -> Result<(), String> {
    let should_expand = has_active_note.unwrap_or(false);
    TRAY_START_EXPANDED.store(should_expand, Ordering::SeqCst);
    // window creation must never run on the main/UI thread of a command
    std::thread::spawn(move || {
        let _ = open_tray_mode_inner(&app, should_expand, note_id);
    });
    Ok(())
}

/// Called by the tray page after mount: reveals the (already positioned) window.
#[tauri::command]
pub fn tray_ready(window: tauri::WebviewWindow) -> String {
    let start_expanded = TRAY_START_EXPANDED.load(Ordering::SeqCst);
    let target_name = TARGET_TRAY_MONITOR_NAME.lock().unwrap().take();
    let mon = if let Some(ref name) = target_name {
        window.available_monitors().ok().and_then(|mons| {
            mons.into_iter().find(|m| m.name() == Some(name))
        })
    } else {
        None
    }.or_else(|| get_window_active_monitor(&window));

    if let Some(ref m) = mon {
        position_tray_on_monitor(&window, m, start_expanded);
    }
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    platform::keep_wm_from_moving(&window);
    platform::focus_window(&window);
    if start_expanded {
        "panel".to_string()
    } else {
        "pill".to_string()
    }
}

/// Mutates the one tray frame between "panel" (380x480) and "pill" (180x44), keeping the
/// bottom-right corner anchored. The frontend hides its content while this runs.
#[tauri::command]
pub fn set_tray_mode(app: AppHandle, mode: String) -> Result<QuadrantInfo, String> {
    let tray = app
        .get_webview_window("tray")
        .ok_or_else(|| "tray window is not open".to_string())?;
    let pos = tray.outer_position().map_err(|e| e.to_string())?;
    let size = tray.outer_size().map_err(|e| e.to_string())?;
    let scale = tray.scale_factor().unwrap_or(1.0);

    let (lw, lh) = if mode == "pill" {
        (200.0, 52.0)
    } else {
        get_window_active_monitor(&tray)
            .map(|m| tray_panel_logical(&m))
            .unwrap_or((TRAY_PANEL_W, TRAY_PANEL_H))
    };
    let w = (lw * scale).round() as i32;
    let h = (lh * scale).round() as i32;

    let monitor = tray.current_monitor().ok().flatten()
        .or_else(|| get_window_active_monitor(&tray))
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "monitor not found".to_string())?;
    let screen_dim = monitor.size();
    let m_pos = monitor.position();

    // Dock position coordinate vectors (x, y) relative directly against screen thresholds
    // Decide with the frame's CENTRE (not its top-left): a tall panel docked at the bottom has its top-left in the
    // upper half, which used to collapse the bar to the middle of the screen instead of the bottom corner.
    let rel_x = pos.x + size.width as i32 / 2 - m_pos.x;
    let rel_y = pos.y + size.height as i32 / 2 - m_pos.y;
    let width = screen_dim.width as i32;
    let height = screen_dim.height as i32;

    // Left Boundary: x < (width / 3) -> Force Horizontal Growth to the RIGHT
    // Right Boundary: x > (width / 3 * 2) -> Force Horizontal Growth to the LEFT
    // Center Cluster: (width / 3) <= x <= (width / 3 * 2) -> Keep Horizontal Center
    let (grow_x, target_x) = if rel_x < (width / 3) {
        ("right", pos.x)
    } else if rel_x > (width / 3 * 2) {
        ("left", pos.x + size.width as i32 - w)
    } else {
        let center_x = pos.x + (size.width as i32 / 2);
        ("center", center_x - (w / 2))
    };

    // Top Boundary: y < (height / 2) -> Force Vertical Growth DOWNWARDS
    // Bottom Boundary: y >= (height / 2) -> Force Vertical Growth UPWARDS
    let (grow_y, target_y) = if rel_y < (height / 2) {
        ("down", pos.y)
    } else {
        ("up", pos.y + size.height as i32 - h)
    };

    let (x, y) = clamp_to_monitor(&tray, &app, target_x, target_y, w, h);

    lock_window_transition(250);
    platform::set_window_bounds(&tray, x, y, w as u32, h as u32);
    if mode == "pill" {
        flush_webview_memory(&tray);
        platform::set_webview_memory_level(&tray, true);
    } else {
        platform::set_webview_memory_level(&tray, false);
    }
    Ok(QuadrantInfo {
        grow_x: grow_x.to_string(),
        grow_y: grow_y.to_string(),
    })
}

#[tauri::command]
pub fn open_canvas_mode(app: AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        open_canvas_mode_inner(&app);
    });
    Ok(())
}

#[tauri::command]
pub fn start_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

/// Starts dragging the dock window, grabbed at (`grab_x`, `grab_y`) logical px from its top-left.
/// Returns `true` when the app runs the drag (the page calls `end_dock_drag` on release) and
/// `false` when the OS move loop already ran it to completion.
#[tauri::command]
pub fn begin_dock_drag(window: tauri::WebviewWindow, grab_x: f64, grab_y: f64) -> bool {
    crate::window::drag::begin(&window, (grab_x, grab_y))
}

#[tauri::command]
pub fn end_dock_drag(app: AppHandle) -> Result<(), String> {
    crate::window::drag::end();
    save_tray_position(app)
}

#[tauri::command]
pub fn save_tray_position(app: AppHandle) -> Result<(), String> {
    if is_window_transitioning() {
        return Ok(());
    }
    if let Some(tray_win) = app.get_webview_window("tray") {
        if let Ok(pos) = tray_win.outer_position() {
            let win_size = tray_win.outer_size().unwrap_or(tauri::PhysicalSize::new(160, 64));
            let target_mon = get_window_active_monitor(&tray_win)
                .or_else(|| app.primary_monitor().ok().flatten());

            if let Some(mon) = target_mon {
                let scale = mon.scale_factor();
                let small_w = (160.0 * scale).round() as i32;

                let (work_l, work_t, work_r, work_b) = platform::work_area(&mon);
                let min_x = work_l + 8;
                let min_y = work_t + 8;
                let max_x = (work_r - win_size.width as i32 - 8).max(min_x);
                let max_y = (work_b - win_size.height as i32 - 8).max(min_y);

                let clamped_x = pos.x.clamp(min_x, max_x);
                let clamped_y = pos.y.clamp(min_y, max_y);

                // Desktop Screen Edge Constraints: Enforce physical screen blockage
                if clamped_x != pos.x || clamped_y != pos.y {
                    let _ = tray_win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(clamped_x, clamped_y)));
                }

                let clamped_pos = tauri::PhysicalPosition::new(clamped_x, clamped_y);
                let mut buf = PRE_STATE_BUFFER.lock().unwrap();
                if (win_size.width as i32) <= small_w + 40 {
                    buf.pill_physical_pos = Some(clamped_pos);
                    buf.expanded_physical_pos = None;
                } else {
                    buf.expanded_physical_pos = Some(clamped_pos);
                }
            }
        }
    }
    Ok(())
}

pub fn track_tray_window_moved(window: &Window, pos: tauri::PhysicalPosition<i32>) {
    if is_window_transitioning() {
        return;
    }
    let app = window.app_handle();
    if let Some(tray_win) = app.get_webview_window("tray") {
        let win_size = tray_win.outer_size().unwrap_or(tauri::PhysicalSize::new(160, 64));
        if let Some(mon) = get_window_active_monitor(&tray_win).or_else(|| app.primary_monitor().ok().flatten()) {
            let scale = mon.scale_factor();
            let small_w = (160.0 * scale).round() as i32;

            let mut buf = PRE_STATE_BUFFER.lock().unwrap();
            if (win_size.width as i32) <= small_w + 40 {
                buf.pill_physical_pos = Some(pos);
                buf.expanded_physical_pos = None;
            } else {
                buf.expanded_physical_pos = Some(pos);
            }
        }
    }
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    if let Some(main_win) = app.get_webview_window("main") {
        if let Ok(is_max) = main_win.is_maximized() {
            let storage = app.state::<StorageManager>();
            let _ = storage.set_is_maximized(is_max);
        }
    }
    app.exit(0);
}

#[tauri::command]
pub fn show_tray_context_menu(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};

    let maximize_item = MenuItemBuilder::with_id("maximize", "Maximize")
        .build(&app)
        .map_err(|e| e.to_string())?;
    let separator = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit DoIT")
        .build(&app)
        .map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(&app)
        .item(&maximize_item)
        .item(&separator)
        .item(&quit_item)
        .build()
        .map_err(|e| e.to_string())?;

    window.popup_menu(&menu).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_mini_window_mode(window: Window, mini: bool) -> Result<(), String> {
    if mini {
        let _ = window.set_size(tauri::LogicalSize::new(420.0, 360.0));
        let _ = window.set_always_on_top(true);
    } else {
        let _ = window.set_size(tauri::LogicalSize::new(1280.0, 840.0));
        let _ = window.set_always_on_top(false);
    }
    Ok(())
}
