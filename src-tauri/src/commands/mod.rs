//! The IPC surface: every `#[tauri::command]` the frontend can `invoke`, grouped by area.
//! Handlers stay thin and delegate to `storage`, `window` or `platform`.

pub mod files;
pub mod notes;
pub mod settings;
pub mod window;
