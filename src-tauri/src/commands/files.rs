use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::models::{FolderImport, NoteItem, ScanSummary};
use crate::storage::StorageManager;

/// Runs a native picker off the async workers (it blocks until the user answers). `None` means the
/// user cancelled.
async fn pick(dialog: impl FnOnce(rfd::FileDialog) -> Option<std::path::PathBuf> + Send + 'static) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || dialog(rfd::FileDialog::new()).map(|p| p.to_string_lossy().to_string()))
        .await
        .map_err(|e| e.to_string())
}

fn cancelled(what: &str) -> String {
    format!("User cancelled {what} selection")
}

#[tauri::command]
pub async fn select_storage_directory() -> Result<Option<String>, String> {
    pick(|d| d.set_title("Select DoIT Notes Markdown Directory").pick_folder()).await
}

#[tauri::command]
pub fn export_data(storage: State<'_, StorageManager>) -> Result<String, String> {
    storage.export_raw_json()
}

#[tauri::command]
pub fn import_data(json: String, storage: State<'_, StorageManager>) -> Result<bool, String> {
    storage.import_raw_json(&json)
}

#[tauri::command]
pub async fn import_single_markdown_file(
    file_path: Option<String>,
    storage: State<'_, StorageManager>,
    app: AppHandle,
) -> Result<NoteItem, String> {
    let target_path = match file_path {
        Some(p) if !p.trim().is_empty() => p,
        _ => pick(|d| d.add_filter("Markdown (*.md)", &["md"]).set_title("Open DoIT Note").pick_file())
            .await?
            .ok_or_else(|| cancelled("file"))?,
    };

    let note = storage.import_single_file(&target_path)?;
    let _ = app.emit("note-saved", &note);
    Ok(note)
}

#[tauri::command]
pub fn scan_markdown_folder(
    folder_path: Option<String>,
    storage: State<'_, StorageManager>,
) -> Result<ScanSummary, String> {
    storage.scan_folder(folder_path.as_deref())
}

#[tauri::command]
pub async fn pick_and_scan_folder(
    storage: State<'_, StorageManager>,
) -> Result<ScanSummary, String> {
    let folder_path = pick(|d| d.set_title("Select Folder to Scan DoIT Notes").pick_folder())
        .await?
        .ok_or_else(|| cancelled("folder"))?;

    storage.scan_folder(Some(&folder_path))
}

/// Picks a folder and imports its notes as one shelf, named `shelf` or, if that is empty, after the
/// folder.
#[tauri::command]
pub async fn import_folder_as_shelf(
    shelf: Option<String>,
    storage: State<'_, StorageManager>,
) -> Result<FolderImport, String> {
    let folder = pick(|d| d.set_title("Choose a folder to import as a shelf").pick_folder())
        .await?
        .ok_or_else(|| cancelled("folder"))?;
    storage.import_folder_as_shelf(&folder, shelf.as_deref())
}

/// Path passed on the command line when the OS launched DoIT for a .md / .txt file
pub struct LaunchFile(pub Mutex<Option<String>>);

pub fn file_from_args(args: &[String]) -> Option<String> {
    args.iter().skip(1).find_map(|a| {
        let p = std::path::Path::new(a);
        let ext = p.extension()?.to_str()?.to_ascii_lowercase();
        if matches!(ext.as_str(), "md" | "markdown" | "txt") && p.is_file() {
            Some(a.clone())
        } else {
            None
        }
    })
}

#[tauri::command]
pub fn take_launch_file(state: State<'_, LaunchFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

#[tauri::command]
pub fn open_external_file(path: String, storage: State<'_, StorageManager>) -> Result<NoteItem, String> {
    storage.open_external(&path)
}

#[tauri::command]
pub fn save_external_file(note: NoteItem, storage: State<'_, StorageManager>) -> Result<NoteItem, String> {
    storage.save_external(note)
}
