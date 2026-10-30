use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, Window};
use crate::models::{AppSettings, CategoryInfo, GridCoordinates, NoteItem, ScanSummary};
use crate::storage::StorageManager;

#[derive(Clone, Debug)]
pub struct MainWindowState {
    pub is_maximized: bool,
    pub is_fullscreen: bool,
    pub position: Option<tauri::PhysicalPosition<i32>>,
    pub size: Option<tauri::PhysicalSize<u32>>,
    pub monitor_name: Option<String>,
}

pub static SAVED_MAIN_WINDOW_STATE: Mutex<Option<MainWindowState>> = Mutex::new(None);
pub static TRAY_WINDOW_CUSTOM_POSITION: Mutex<Option<tauri::PhysicalPosition<i32>>> = Mutex::new(None);

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
pub fn get_settings(storage: State<'_, StorageManager>) -> Result<AppSettings, String> {
    storage.get_settings()
}

#[tauri::command]
pub fn update_settings(
    settings: AppSettings,
    storage: State<'_, StorageManager>,
) -> Result<AppSettings, String> {
    storage.update_settings(settings)
}

#[tauri::command]
pub fn add_category(
    category: String,
    storage: State<'_, StorageManager>,
) -> Result<bool, String> {
    storage.add_category(&category)
}

#[tauri::command]
pub fn delete_category(
    category: String,
    storage: State<'_, StorageManager>,
) -> Result<bool, String> {
    storage.delete_category(&category)
}

#[tauri::command]
pub async fn select_storage_directory() -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let res = rfd::FileDialog::new()
            .set_title("Select DoIT Notes Markdown Directory")
            .pick_folder();
        let _ = tx.send(res.map(|p| p.to_string_lossy().to_string()));
    });
    rx.recv().map_err(|e| e.to_string())
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
        _ => {
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                let picked = rfd::FileDialog::new()
                    .add_filter("Markdown (*.md)", &["md"])
                    .set_title("Open DoIT Note")
                    .pick_file();
                let _ = tx.send(picked.map(|p| p.to_string_lossy().to_string()));
            });
            match rx.recv() {
                Ok(Some(path)) => path,
                Ok(None) => return Err("User cancelled file selection".to_string()),
                Err(e) => return Err(e.to_string()),
            }
        }
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
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let picked = rfd::FileDialog::new()
            .set_title("Select Folder to Scan DoIT Notes")
            .pick_folder();
        let _ = tx.send(picked.map(|p| p.to_string_lossy().to_string()));
    });
    let folder_path = match rx.recv() {
        Ok(Some(path)) => path,
        Ok(None) => return Err("User cancelled folder selection".to_string()),
        Err(e) => return Err(e.to_string()),
    };

    storage.scan_folder(Some(&folder_path))
}

#[tauri::command]
pub fn toggle_window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

pub fn position_tray_on_monitor(
    window: &tauri::WebviewWindow,
    monitor: &tauri::Monitor,
    expanded: bool,
) {
    let width_logical = if expanded { 380.0 } else { 160.0 };
    let height_logical = if expanded { 560.0 } else { 64.0 };

    let scale_factor = monitor.scale_factor();
    let m_pos = monitor.position(); // PhysicalPosition<i32> { x, y }
    let m_size = monitor.size();     // PhysicalSize<u32> { width, height }

    // Calculate physical dimensions for this specific monitor
    let phys_w = (width_logical * scale_factor).round() as u32;
    let phys_h = (height_logical * scale_factor).round() as u32;

    let max_x = m_pos.x + (m_size.width as i32) - (phys_w as i32);
    let max_y = m_pos.y + (m_size.height as i32) - (phys_h as i32);

    // Prefer window's current live OS position, then cached custom position, then default margin
    let current_live_pos = window.outer_position().ok();
    let custom_pos = {
        let guard = TRAY_WINDOW_CUSTOM_POSITION.lock().unwrap();
        *guard
    };

    let (target_x, target_y) = if let Some(live) = current_live_pos {
        (live.x, live.y)
    } else if let Some(pos) = custom_pos {
        (pos.x, pos.y)
    } else {
        // Default anchor: 24px from right edge, 72px from bottom edge (clearing taskbar)
        let margin_x = (24.0 * scale_factor).round() as i32;
        let margin_y = (72.0 * scale_factor).round() as i32;
        (max_x - margin_x, max_y - margin_y)
    };

    // Strict boundary clamping relative strictly to [m_pos.x, max_x] and [m_pos.y, max_y]
    // Prevents windows from ever defaulting, snapping, or warping across multi-screen display boundaries
    let clamped_x = target_x.clamp(m_pos.x, max_x.max(m_pos.x));
    let clamped_y = target_y.clamp(m_pos.y, max_y.max(m_pos.y));

    // Save clamped position to memory so future transitions know it
    *TRAY_WINDOW_CUSTOM_POSITION.lock().unwrap() = Some(tauri::PhysicalPosition::new(clamped_x, clamped_y));

    if expanded {
        // When expanding: move to destination position first, then expand dimensions
        let _ = window.set_position(tauri::PhysicalPosition::new(clamped_x, clamped_y));
        let _ = window.set_size(tauri::PhysicalSize::new(phys_w, phys_h));
    } else {
        // When minimizing: shrink dimensions first, then snap to anchor position
        let _ = window.set_size(tauri::PhysicalSize::new(phys_w, phys_h));
        let _ = window.set_position(tauri::PhysicalPosition::new(clamped_x, clamped_y));
    }
}

pub fn position_tray_window(app: &AppHandle, window: &tauri::WebviewWindow, expanded: bool) {
    let target_monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| {
            app.get_webview_window("main")
                .and_then(|w| w.current_monitor().ok().flatten())
        })
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(mon) = target_monitor {
        position_tray_on_monitor(window, &mon, expanded);
    }
}

#[tauri::command]
pub fn open_tray_mode(app: AppHandle) -> Result<(), String> {
    // Save main window exact display state (fullscreen, maximized, or custom dimensions)
    if let Some(main_win) = app.get_webview_window("main") {
        let is_fullscreen = main_win.is_fullscreen().unwrap_or(false);
        let is_maximized = main_win.is_maximized().unwrap_or(false);
        let size = main_win.outer_size().ok();
        let position = main_win.outer_position().ok();
        let monitor_name = main_win
            .current_monitor()
            .ok()
            .flatten()
            .and_then(|m| m.name().cloned());

        *SAVED_MAIN_WINDOW_STATE.lock().unwrap() = Some(MainWindowState {
            is_maximized,
            is_fullscreen,
            position,
            size,
            monitor_name,
        });
    }

    // Show tray FIRST before hiding main — ensures the app never
    // has zero visible windows (which would trigger Tauri's auto-exit)
    if let Some(tray_win) = app.get_webview_window("tray") {
        // When launching tray mode from canvas, anchor to main_win's current screen workspace
        let target_monitor = if let Some(main_win) = app.get_webview_window("main") {
            if main_win.is_visible().unwrap_or(false) {
                main_win.current_monitor().ok().flatten()
            } else {
                None
            }
        } else {
            None
        }
        .or_else(|| tray_win.current_monitor().ok().flatten())
        .or_else(|| tray_win.primary_monitor().ok().flatten());

        if let Some(mon) = target_monitor {
            position_tray_on_monitor(&tray_win, &mon, false);
        }

        let _ = tray_win.emit("set-expanded", false);
        let _ = tray_win.show();
        let _ = tray_win.set_always_on_top(true);
        let _ = tray_win.set_focus();
    }
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn open_canvas_mode(app: AppHandle) -> Result<(), String> {
    if let (Some(tray_win), Some(main_win)) = (
        app.get_webview_window("tray"),
        app.get_webview_window("main"),
    ) {
        let target_mon = tray_win
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| main_win.current_monitor().ok().flatten())
            .or_else(|| main_win.primary_monitor().ok().flatten());

        let saved = SAVED_MAIN_WINDOW_STATE.lock().unwrap().clone();

        if let Some(state) = saved {
            if state.is_fullscreen {
                if let Some(ref mon) = target_mon {
                    let m_pos = mon.position();
                    let _ = main_win.set_position(tauri::PhysicalPosition::new(m_pos.x, m_pos.y));
                }
                let _ = main_win.set_fullscreen(true);
            } else if state.is_maximized {
                if let Some(ref mon) = target_mon {
                    let m_pos = mon.position();
                    let _ = main_win.set_position(tauri::PhysicalPosition::new(m_pos.x, m_pos.y));
                }
                let _ = main_win.maximize();
            } else if let (Some(pos), Some(sz)) = (state.position, state.size) {
                let tray_mon_name = target_mon.as_ref().and_then(|m| m.name().cloned());
                if tray_mon_name != state.monitor_name && target_mon.is_some() {
                    let mon = target_mon.as_ref().unwrap();
                    let m_pos = mon.position();
                    let m_size = mon.size();
                    let w = sz.width.min(m_size.width);
                    let h = sz.height.min(m_size.height);
                    let x = m_pos.x + (m_size.width as i32 - w as i32) / 2;
                    let y = m_pos.y + (m_size.height as i32 - h as i32) / 2;
                    let _ = main_win.set_size(tauri::PhysicalSize::new(w, h));
                    let _ = main_win.set_position(tauri::PhysicalPosition::new(x, y));
                } else {
                    let _ = main_win.set_size(sz);
                    let _ = main_win.set_position(pos);
                }
            }
        } else if let Some(mon) = target_mon {
            if !main_win.is_maximized().unwrap_or(false) && !main_win.is_fullscreen().unwrap_or(false) {
                let m_pos = mon.position();
                let m_size = mon.size();
                let scale = mon.scale_factor();
                let main_w = (1440.0 * scale).min(m_size.width as f64 * 0.92) as u32;
                let main_h = (900.0 * scale).min(m_size.height as f64 * 0.90) as u32;
                let center_x = m_pos.x + (m_size.width as i32 - main_w as i32) / 2;
                let center_y = m_pos.y + (m_size.height as i32 - main_h as i32) / 2;
                let _ = main_win.set_size(tauri::PhysicalSize::new(main_w, main_h));
                let _ = main_win.set_position(tauri::PhysicalPosition::new(center_x, center_y));
            }
        }

        let _ = tray_win.hide();
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn resize_tray_window(app: AppHandle, expanded: bool) -> Result<(), String> {
    if let Some(tray_win) = app.get_webview_window("tray") {
        // When minimizing to smaller tile or expanding, explicitly query window.current_monitor()
        let target_monitor = tray_win
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| {
                app.get_webview_window("main")
                    .and_then(|w| w.current_monitor().ok().flatten())
            })
            .or_else(|| tray_win.primary_monitor().ok().flatten());

        if let Some(mon) = target_monitor {
            position_tray_on_monitor(&tray_win, &mon, expanded);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn start_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_tray_position(app: AppHandle) -> Result<(), String> {
    if let Some(tray_win) = app.get_webview_window("tray") {
        if let Ok(pos) = tray_win.outer_position() {
            *TRAY_WINDOW_CUSTOM_POSITION.lock().unwrap() = Some(pos);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn set_mini_window_mode(window: Window, mini: bool) -> Result<(), String> {
    if mini {
        let _ = window.set_size(tauri::LogicalSize::new(420.0, 360.0));
        let _ = window.set_always_on_top(true);
    } else {
        let _ = window.set_size(tauri::LogicalSize::new(1280.0, 840.0));
        let _ = window.set_always_on_top(false);
    }
    Ok(())
}
