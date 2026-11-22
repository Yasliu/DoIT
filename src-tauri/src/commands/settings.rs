use tauri::{AppHandle, Manager, State};

use crate::actions::Slot;
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
    change_shortcut(&app, &storage, Slot::QuickNote, keys)
}

/// The same for the shortcut that shows or hides the dock panel.
#[tauri::command]
pub fn set_dock_shortcut(keys: String, storage: State<'_, StorageManager>, app: AppHandle) -> Result<AppSettings, String> {
    change_shortcut(&app, &storage, Slot::Dock, keys)
}

fn change_shortcut(app: &AppHandle, storage: &StorageManager, slot: Slot, keys: String) -> Result<AppSettings, String> {
    let current = storage.get_settings()?;
    let (field, other) = match slot {
        Slot::QuickNote => ("quick_note_shortcut", &current.dock_shortcut),
        Slot::Dock => ("dock_shortcut", &current.quick_note_shortcut),
    };
    crate::actions::set_shortcut(app, slot, &keys, other)?;
    let mut patch = serde_json::Map::new();
    patch.insert(field.into(), serde_json::Value::String(keys));
    storage.update_settings(patch)
}

#[derive(serde::Serialize)]
pub struct ShortcutStatus {
    /// Whether the shortcuts DoIT sets work from other apps: through the OS, or (Wayland) through
    /// the desktop's own shortcut settings. Where neither, Settings explains how to bind the flags.
    supported: bool,
    /// Why a saved shortcut is not working, if DoIT could not take it back when it started.
    quick_note_error: Option<String>,
    dock_error: Option<String>,
}

#[tauri::command]
pub fn shortcut_status() -> ShortcutStatus {
    ShortcutStatus {
        supported: crate::platform::global_shortcuts_work() || crate::platform::desktop_shortcuts_work(),
        quick_note_error: crate::actions::shortcut_error(Slot::QuickNote),
        dock_error: crate::actions::shortcut_error(Slot::Dock),
    }
}

/// Lets the webview load the images next to the notes, wherever the notes folder is.
pub fn allow_note_images(app: &AppHandle, storage: &StorageManager) {
    if let Ok(dir) = storage.notes_dir() {
        let _ = std::fs::create_dir_all(&dir);
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
