use tauri::{AppHandle, Manager, State};

use crate::models::AppSettings;
use crate::storage::StorageManager;

#[tauri::command]
pub fn get_default_storage_path() -> String {
    crate::models::default_note_storage_path()
}

#[tauri::command]
pub fn get_settings(storage: State<'_, StorageManager>) -> Result<AppSettings, String> {
    storage.get_settings()
}

#[tauri::command]
/// `patch` holds only the fields the caller changed; the rest keep their saved values.
pub fn update_settings(
    patch: serde_json::Map<String, serde_json::Value>,
    storage: State<'_, StorageManager>,
    app: AppHandle,
) -> Result<AppSettings, String> {
    let settings = storage.update_settings(patch)?;
    allow_note_images(&app, &storage);
    Ok(settings)
}

/// Takes `keys` as the quick-note shortcut ("" turns it off) and saves it once the OS has accepted
/// it. The error is a sentence for the Settings screen.
#[tauri::command]
pub fn set_quick_note_shortcut(keys: String, storage: State<'_, StorageManager>, app: AppHandle) -> Result<AppSettings, String> {
    if !crate::platform::global_shortcuts_work() {
        return Err("This desktop doesn't let apps set shortcuts that work from other apps.".to_string());
    }
    crate::actions::set_quick_note_shortcut(&app, &keys)?;
    let mut patch = serde_json::Map::new();
    patch.insert("quick_note_shortcut".into(), serde_json::Value::String(keys));
    storage.update_settings(patch)
}

#[derive(serde::Serialize)]
pub struct QuickNoteShortcutStatus {
    /// Whether a shortcut DoIT registers works from other apps. Where it does not (Wayland),
    /// Settings explains how to bind `--quick-note` in the desktop's own settings instead.
    supported: bool,
    /// Why the saved shortcut is not working, if DoIT could not take it back when it started.
    error: Option<String>,
}

#[tauri::command]
pub fn quick_note_shortcut_status() -> QuickNoteShortcutStatus {
    QuickNoteShortcutStatus { supported: crate::platform::global_shortcuts_work(), error: crate::actions::quick_note_shortcut_error() }
}

/// Lets the webview load the images next to the notes, wherever the notes folder is.
pub fn allow_note_images(app: &AppHandle, storage: &StorageManager) {
    if let Ok(dir) = storage.notes_dir() {
        let _ = app.asset_protocol_scope().allow_directory(dir, true);
    }
}

#[tauri::command]
pub fn get_system_fonts() -> Vec<String> {
    crate::platform::system_fonts()
}

#[tauri::command]
pub fn is_ms_store_package() -> bool {
    crate::platform::is_store_package()
}
