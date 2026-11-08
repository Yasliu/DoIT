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
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetCurrentPackageFullName(
                package_full_name_length: *mut u32,
                package_full_name: *mut u16,
            ) -> i32;
        }
        let mut length: u32 = 0;
        let result = unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) };
        // 15700 is APPMODEL_ERROR_NO_PACKAGE.
        // Any other return (such as 122 ERROR_INSUFFICIENT_BUFFER or 0 ERROR_SUCCESS) means
        // the app is executing inside an MSIX / AppX package identity (e.g. Microsoft Store).
        result != 15700
    }
    #[cfg(not(windows))]
    {
        false
    }
}
