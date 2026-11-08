use tauri::State;

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
) -> Result<AppSettings, String> {
    storage.update_settings(patch)
}

#[tauri::command]
pub fn get_system_fonts() -> Vec<String> {
    crate::platform::system_fonts()
}
