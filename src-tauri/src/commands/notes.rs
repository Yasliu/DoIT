use tauri::{AppHandle, Emitter, State};

use crate::models::{CategoryInfo, GridCoordinates, NoteItem};
use crate::storage::StorageManager;

#[tauri::command]
pub fn get_notes(storage: State<'_, StorageManager>) -> Result<Vec<NoteItem>, String> {
    storage.get_all_notes()
}

#[tauri::command]
pub fn save_note(
    note: NoteItem,
    storage: State<'_, StorageManager>,
    app: AppHandle,
) -> Result<NoteItem, String> {
    let saved = storage.upsert_note(note)?;
    let _ = app.emit("note-saved", &saved);
    Ok(saved)
}

#[tauri::command]
pub fn update_note_category(
    id: String,
    category: String,
    storage: State<'_, StorageManager>,
    app: AppHandle,
) -> Result<NoteItem, String> {
    let updated = storage.update_category(&id, &category)?;
    let _ = app.emit("note-saved", &updated);
    Ok(updated)
}

#[tauri::command]
pub fn update_note_coordinates(
    id: String,
    coords: GridCoordinates,
    storage: State<'_, StorageManager>,
    app: AppHandle,
) -> Result<NoteItem, String> {
    let updated = storage.update_coordinates(&id, coords)?;
    let _ = app.emit("note-saved", &updated);
    Ok(updated)
}

#[tauri::command]
pub fn delete_note(
    id: String,
    storage: State<'_, StorageManager>,
    app: AppHandle,
) -> Result<bool, String> {
    let removed = storage.delete_note(&id)?;
    if removed {
        let _ = app.emit("note-deleted", &id);
    }
    Ok(removed)
}

#[tauri::command]
pub fn get_categories(storage: State<'_, StorageManager>) -> Result<Vec<CategoryInfo>, String> {
    storage.get_categories()
}

#[tauri::command]
pub fn toggle_category_collapse(
    category: String,
    storage: State<'_, StorageManager>,
) -> Result<bool, String> {
    storage.toggle_category_collapse(&category)
}

#[tauri::command]
pub fn add_category(
    category: String,
    storage: State<'_, StorageManager>,
) -> Result<bool, String> {
    storage.add_category(&category)
}

#[tauri::command]
pub fn rename_category(
    category: String,
    new_name: String,
    storage: State<'_, StorageManager>,
    app: AppHandle,
) -> Result<Vec<NoteItem>, String> {
    let updated = storage.rename_category(&category, &new_name)?;
    for note in &updated {
        let _ = app.emit("note-saved", note);
    }
    let _ = app.emit("categories-changed", ());
    Ok(updated)
}

#[tauri::command]
pub fn delete_category(
    category: String,
    storage: State<'_, StorageManager>,
) -> Result<bool, String> {
    storage.delete_category(&category)
}
