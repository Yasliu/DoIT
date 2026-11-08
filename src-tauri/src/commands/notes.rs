use tauri::{AppHandle, Emitter, State};

use crate::models::{GridCoordinates, NoteItem, Shelf};
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

/// Tells every window the shelves changed (and which notes moved with them).
fn shelves_changed(app: &AppHandle, moved: &[NoteItem]) {
    for note in moved {
        let _ = app.emit("note-saved", note);
    }
    let _ = app.emit("shelves-changed", ());
}

#[tauri::command]
pub fn get_shelves(storage: State<'_, StorageManager>) -> Result<Vec<Shelf>, String> {
    storage.get_shelves()
}

#[tauri::command]
pub fn create_shelf(name: String, storage: State<'_, StorageManager>, app: AppHandle) -> Result<bool, String> {
    let created = storage.create_shelf(&name)?;
    shelves_changed(&app, &[]);
    Ok(created)
}

#[tauri::command]
pub fn rename_shelf(name: String, new_name: String, storage: State<'_, StorageManager>, app: AppHandle) -> Result<Vec<NoteItem>, String> {
    let moved = storage.rename_shelf(&name, &new_name)?;
    shelves_changed(&app, &moved);
    Ok(moved)
}

#[tauri::command]
pub fn delete_shelf(name: String, storage: State<'_, StorageManager>, app: AppHandle) -> Result<Vec<NoteItem>, String> {
    let moved = storage.delete_shelf(&name)?;
    shelves_changed(&app, &moved);
    Ok(moved)
}

#[tauri::command]
pub fn reorder_shelves(names: Vec<String>, storage: State<'_, StorageManager>, app: AppHandle) -> Result<(), String> {
    storage.reorder_shelves(&names)?;
    shelves_changed(&app, &[]);
    Ok(())
}

#[tauri::command]
pub fn set_shelf_icon(name: String, icon: Option<String>, storage: State<'_, StorageManager>, app: AppHandle) -> Result<(), String> {
    storage.set_shelf_icon(&name, icon)?;
    shelves_changed(&app, &[]);
    Ok(())
}

#[tauri::command]
pub fn set_shelf_collapsed(name: String, collapsed: bool, storage: State<'_, StorageManager>, app: AppHandle) -> Result<(), String> {
    storage.set_shelf_collapsed(&name, collapsed)?;
    shelves_changed(&app, &[]);
    Ok(())
}
