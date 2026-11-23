//! Window and mode commands. Each one only translates the page's request for `window`.

use tauri::{AppHandle, State, WebviewWindow, Window};

use crate::models::QuadrantInfo;
use crate::storage::StorageManager;
use crate::window::{self, DockOpen, DockShape};

#[tauri::command]
pub fn toggle_window_minimize(window: Window) -> Result<(), String> {
    window::minimize(&window)
}

/// Maps the canvas unseen. Returns whether it will be maximized, which resizes it once it is mapped.
#[tauri::command]
pub fn canvas_loading(app: AppHandle, storage: State<'_, StorageManager>) -> bool {
    window::canvas_loading(&app);
    storage.get_is_maximized()
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
pub fn set_tray_mode(app: AppHandle, mode: String, note_id: Option<String>) -> Result<QuadrantInfo, String> {
    let shape = if mode == "pill" { DockShape::Pill } else { DockShape::Panel };
    if shape == DockShape::Pill || note_id.is_some() {
        window::set_dock_note(note_id);
    }
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
    window::restart(&app);
}

/// The same string for every page of this run of DoIT and a new one after each launch, so pages
/// can tell a design picked for this run from one saved for the next.
#[tauri::command]
pub fn launch_id() -> String {
    static ID: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    ID.get_or_init(|| {
        let since = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
        format!("{}-{}", std::process::id(), since.as_nanos())
    })
    .clone()
}

#[derive(Clone, serde::Serialize)]
pub struct UpdateProgress {
    received: u64,
    total: Option<u64>,
}

/// Downloads and verifies the update the page's check found (`rid`, the plugin's handle for it), so
/// what installs is what the page offered, and keeps it for `install_update`. The error is a
/// sentence to show.
#[tauri::command]
pub async fn download_update(
    webview: tauri::Webview,
    rid: tauri::ResourceId,
    on_progress: tauri::ipc::Channel<UpdateProgress>,
) -> Result<(), String> {
    use tauri::Manager;
    let update = webview
        .resources_table()
        .get::<tauri_plugin_updater::Update>(rid)
        .map_err(|_| "This update is no longer available. Check for updates again.".to_string())?;
    crate::updates::download(&update, |received, total| {
        let _ = on_progress.send(UpdateProgress { received, total });
    })
    .await
}

/// The version of an update already downloaded in this run, so a rebuilt page offers a restart.
#[tauri::command]
pub fn downloaded_update() -> Option<String> {
    crate::updates::downloaded_version()
}

/// Saves everything, installs the downloaded update if it is `version`, and restarts DoIT into it.
/// Returns only if the install failed (Linux: once the restart is scheduled).
#[tauri::command]
pub async fn install_update(app: AppHandle, version: String) -> Result<(), String> {
    let saving = app.clone();
    tauri::async_runtime::spawn_blocking(move || window::save_everything(&saving))
        .await
        .map_err(|e| e.to_string())?;
    crate::updates::install(&version).await?;
    window::restart(&app);
    Ok(())
}

/// The page saved everything it held after a `flush-pending` request.
#[tauri::command]
pub fn flush_done(window: WebviewWindow) {
    window::flush_answered(&window);
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
