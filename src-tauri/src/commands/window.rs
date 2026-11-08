//! Window and mode commands. Each one only translates the page's request for `window`.

use tauri::{AppHandle, WebviewWindow, Window};

use crate::models::QuadrantInfo;
use crate::window::{self, DockOpen, DockShape};

#[tauri::command]
pub fn toggle_window_minimize(window: Window) -> Result<(), String> {
    window::minimize(&window)
}

#[tauri::command]
pub fn canvas_ready(app: AppHandle) {
    window::canvas_ready(&app);
}

#[tauri::command]
pub fn set_external_dirty(dirty: bool) {
    window::set_external_dirty(dirty);
}

#[tauri::command]
pub fn open_tray_mode(app: AppHandle, has_active_note: Option<bool>, note_id: Option<String>) {
    window::show_dock(&app, DockOpen { panel: has_active_note.unwrap_or(false), note: note_id });
}

#[tauri::command]
pub fn open_canvas_mode(app: AppHandle) {
    window::show_canvas(&app);
}

#[derive(serde::Serialize)]
pub struct DockReady {
    shape: &'static str,
    note: Option<String>,
}

/// Called by the dock page after mount: reveals the (already positioned) window.
#[tauri::command]
pub fn tray_ready(window: WebviewWindow) -> DockReady {
    let (shape, note) = window::dock_ready(&window);
    DockReady { shape: shape.as_str(), note }
}

#[tauri::command]
pub fn set_pill_look(look: window::PillLook) {
    window::set_pill_look(look);
}

/// Changes the dock between "panel" and "pill"; the page hides its content while this runs.
#[tauri::command]
pub fn set_tray_mode(app: AppHandle, mode: String) -> Result<QuadrantInfo, String> {
    let shape = if mode == "pill" { DockShape::Pill } else { DockShape::Panel };
    let growth = window::reshape_dock(&app, shape)?;
    Ok(QuadrantInfo { grow_x: growth.grow_x.to_string(), grow_y: growth.grow_y.to_string() })
}

#[tauri::command]
pub fn begin_dock_drag(window: WebviewWindow, grab_x: f64, grab_y: f64) -> bool {
    window::begin_dock_drag(&window, (grab_x, grab_y))
}

#[tauri::command]
pub fn end_dock_drag(app: AppHandle) {
    window::end_dock_drag(&app);
}

#[tauri::command]
pub fn ensure_dock_topmost(app: AppHandle) {
    window::ensure_dock_topmost(&app);
}

#[tauri::command]
pub fn save_tray_position(app: AppHandle) {
    window::settle_dock(&app);
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    window::quit(&app);
}

#[tauri::command]
pub fn show_tray_context_menu(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let menu = window::dock_menu(&app).map_err(|e| e.to_string())?;
    window.popup_menu(&menu).map_err(|e| e.to_string())
}
