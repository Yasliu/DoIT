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

#[derive(Clone, Debug, Default)]
pub struct TrayPositionState {
    pub pill_offset: Option<tauri::PhysicalPosition<i32>>,
    pub expanded_offset: Option<tauri::PhysicalPosition<i32>>,
    pub last_monitor_name: Option<String>,
}

pub static TRAY_POSITION_STATE: Mutex<TrayPositionState> = Mutex::new(TrayPositionState {
    pill_offset: None,
    expanded_offset: None,
    last_monitor_name: None,
});

pub static TRAY_COLLAPSED_POSITION: Mutex<Option<tauri::PhysicalPosition<i32>>> = Mutex::new(None);
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
pub fn get_default_storage_path() -> String {
    crate::models::default_note_storage_path()
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

pub fn get_window_active_monitor(window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    if let Ok(Some(mon)) = window.current_monitor() {
        return Some(mon);
    }

    if let (Ok(pos), Ok(sz)) = (window.outer_position(), window.outer_size()) {
        let center_x = pos.x + (sz.width as i32) / 2;
        let center_y = pos.y + (sz.height as i32) / 2;

        if let Ok(monitors) = window.available_monitors() {
            for mon in &monitors {
                let mp = mon.position();
                let ms = mon.size();
                if center_x >= mp.x
                    && center_x < mp.x + (ms.width as i32)
                    && center_y >= mp.y
                    && center_y < mp.y + (ms.height as i32)
                {
                    return Some(mon.clone());
                }
            }

            let mut best_overlap = 0i64;
            let mut best_mon = None;

            for mon in monitors {
                let mp = mon.position();
                let ms = mon.size();

                let x_overlap =
                    (pos.x + sz.width as i32).min(mp.x + ms.width as i32) - pos.x.max(mp.x);
                let y_overlap =
                    (pos.y + sz.height as i32).min(mp.y + ms.height as i32) - pos.y.max(mp.y);

                if x_overlap > 0 && y_overlap > 0 {
                    let overlap = (x_overlap as i64) * (y_overlap as i64);
                    if overlap > best_overlap {
                        best_overlap = overlap;
                        best_mon = Some(mon);
                    }
                }
            }

            if best_mon.is_some() {
                return best_mon;
            }
        }
    }

    window.primary_monitor().ok().flatten()
}

pub fn position_tray_on_monitor(
    window: &tauri::WebviewWindow,
    monitor: &tauri::Monitor,
    expanded: bool,
) {
    let scale_factor = monitor.scale_factor();
    let m_pos = monitor.position(); // PhysicalPosition<i32> { x, y }
    let m_size = monitor.size();     // PhysicalSize<u32> { width, height }

    let small_w_phys = (160.0 * scale_factor).round() as i32;
    let small_h_phys = (64.0 * scale_factor).round() as i32;
    let expanded_w_phys = (380.0 * scale_factor).round() as i32;
    let expanded_h_phys = (560.0 * scale_factor).round() as i32;

    let margin_x = (24.0 * scale_factor).round() as i32;
    let margin_y = (72.0 * scale_factor).round() as i32;

    let min_offset_x = 8;
    let min_offset_y = 8;
    let max_small_offset_x = (m_size.width as i32 - small_w_phys - 8).max(min_offset_x);
    let max_small_offset_y = (m_size.height as i32 - small_h_phys - 8).max(min_offset_y);

    let max_expanded_offset_x = (m_size.width as i32 - expanded_w_phys - 8).max(min_offset_x);
    let max_expanded_offset_y = (m_size.height as i32 - expanded_h_phys - 8).max(min_offset_y);

    let default_pill_offset_x = (m_size.width as i32 - small_w_phys - margin_x).clamp(min_offset_x, max_small_offset_x);
    let default_pill_offset_y = (m_size.height as i32 - small_h_phys - margin_y).clamp(min_offset_y, max_small_offset_y);

    let mut mem = TRAY_POSITION_STATE.lock().unwrap();

    let pill_offset = mem.pill_offset.unwrap_or(tauri::PhysicalPosition::new(default_pill_offset_x, default_pill_offset_y));
    let clamped_pill_x = pill_offset.x.clamp(min_offset_x, max_small_offset_x);
    let clamped_pill_y = pill_offset.y.clamp(min_offset_y, max_small_offset_y);
    let active_pill_offset = tauri::PhysicalPosition::new(clamped_pill_x, clamped_pill_y);
    mem.pill_offset = Some(active_pill_offset);
    mem.last_monitor_name = monitor.name().cloned();

    if expanded {
        let expanded_offset = if let Some(exp) = mem.expanded_offset {
            tauri::PhysicalPosition::new(
                exp.x.clamp(min_offset_x, max_expanded_offset_x),
                exp.y.clamp(min_offset_y, max_expanded_offset_y),
            )
        } else {
            // Anchor expanded tray adjacent to the pill
            let target_x = if active_pill_offset.x + expanded_w_phys > max_expanded_offset_x {
                (active_pill_offset.x + small_w_phys - expanded_w_phys).clamp(min_offset_x, max_expanded_offset_x)
            } else {
                active_pill_offset.x.clamp(min_offset_x, max_expanded_offset_x)
            };
            let target_y = if active_pill_offset.y + expanded_h_phys > max_expanded_offset_y {
                (active_pill_offset.y + small_h_phys - expanded_h_phys).clamp(min_offset_y, max_expanded_offset_y)
            } else {
                active_pill_offset.y.clamp(min_offset_y, max_expanded_offset_y)
            };
            tauri::PhysicalPosition::new(target_x, target_y)
        };

        mem.expanded_offset = Some(expanded_offset);
        drop(mem);

        let final_x = m_pos.x + expanded_offset.x;
        let final_y = m_pos.y + expanded_offset.y;

        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(expanded_w_phys as u32, expanded_h_phys as u32)));
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(final_x, final_y)));
    } else {
        drop(mem);

        let final_x = m_pos.x + active_pill_offset.x;
        let final_y = m_pos.y + active_pill_offset.y;

        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(small_w_phys as u32, small_h_phys as u32)));
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(final_x, final_y)));
    }
}

pub fn position_tray_window(app: &AppHandle, window: &tauri::WebviewWindow, expanded: bool) {
    let target_monitor = get_window_active_monitor(window)
        .or_else(|| {
            app.get_webview_window("main")
                .and_then(|w| get_window_active_monitor(&w))
        })
        .or_else(|| app.primary_monitor().ok().flatten());

    if let Some(mon) = target_monitor {
        position_tray_on_monitor(window, &mon, expanded);
    }
}

#[tauri::command]
pub fn open_tray_mode(app: AppHandle) -> Result<(), String> {
    let main_win_opt = app.get_webview_window("main");
    let tray_win_opt = app.get_webview_window("tray");

    let active_monitor = if let Some(ref main_win) = main_win_opt {
        let is_fullscreen = main_win.is_fullscreen().unwrap_or(false);
        let is_maximized = main_win.is_maximized().unwrap_or(false);
        let size = main_win.outer_size().ok();
        let position = main_win.outer_position().ok();
        let mon = get_window_active_monitor(main_win);
        let monitor_name = mon.as_ref().and_then(|m| m.name().cloned());

        *SAVED_MAIN_WINDOW_STATE.lock().unwrap() = Some(MainWindowState {
            is_maximized,
            is_fullscreen,
            position,
            size,
            monitor_name,
        });
        mon
    } else {
        None
    };

    let target_mon = active_monitor
        .or_else(|| tray_win_opt.as_ref().and_then(get_window_active_monitor))
        .or_else(|| app.primary_monitor().ok().flatten());

    // Mandatory: Entering desk tray mode from canvas/maximized MUST always begin at the bottom right corner
    {
        let mut mem = TRAY_POSITION_STATE.lock().unwrap();
        mem.pill_offset = None;
        mem.expanded_offset = None;
    }

    if let (Some(tray_win), Some(mon)) = (tray_win_opt, target_mon) {
        position_tray_on_monitor(&tray_win, &mon, false);

        let _ = tray_win.emit("set-expanded", false);
        let _ = tray_win.emit("spawn-indicator", ());
        let _ = tray_win.show();
        let _ = tray_win.set_always_on_top(true);
        let _ = tray_win.set_focus();
    }

    if let Some(main_win) = main_win_opt {
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
        let target_mon = get_window_active_monitor(&tray_win)
            .or_else(|| get_window_active_monitor(&main_win))
            .or_else(|| app.primary_monitor().ok().flatten());

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
        let target_monitor = get_window_active_monitor(&tray_win)
            .or_else(|| {
                app.get_webview_window("main")
                    .and_then(|w| get_window_active_monitor(&w))
            })
            .or_else(|| app.primary_monitor().ok().flatten());

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
            let win_size = tray_win.outer_size().unwrap_or(tauri::PhysicalSize::new(160, 64));
            let target_mon = get_window_active_monitor(&tray_win)
                .or_else(|| app.primary_monitor().ok().flatten());

            if let Some(mon) = target_mon {
                let m_pos = mon.position();
                let m_size = mon.size();
                let scale = mon.scale_factor();
                let small_w = (160.0 * scale).round() as i32;
                let small_h = (64.0 * scale).round() as i32;
                let _expanded_w = (380.0 * scale).round() as i32;
                let _expanded_h = (560.0 * scale).round() as i32;

                let min_x = m_pos.x + 8;
                let min_y = m_pos.y + 8;
                let max_x = (m_pos.x + m_size.width as i32 - win_size.width as i32 - 8).max(min_x);
                let max_y = (m_pos.y + m_size.height as i32 - win_size.height as i32 - 8).max(min_y);

                let clamped_x = pos.x.clamp(min_x, max_x);
                let clamped_y = pos.y.clamp(min_y, max_y);

                // Desktop Screen Edge Constraints: Enforce physical screen blockage
                if clamped_x != pos.x || clamped_y != pos.y {
                    let _ = tray_win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(clamped_x, clamped_y)));
                }

                let mut mem = TRAY_POSITION_STATE.lock().unwrap();
                let offset_x = clamped_x - m_pos.x;
                let offset_y = clamped_y - m_pos.y;

                if (win_size.width as i32) <= small_w + 30 {
                    mem.pill_offset = Some(tauri::PhysicalPosition::new(offset_x, offset_y));
                    *TRAY_COLLAPSED_POSITION.lock().unwrap() = Some(tauri::PhysicalPosition::new(clamped_x, clamped_y));
                } else {
                    mem.expanded_offset = Some(tauri::PhysicalPosition::new(offset_x, offset_y));
                    let max_small_x = (m_pos.x + m_size.width as i32 - small_w - 8).max(min_x);
                    let max_small_y = (m_pos.y + m_size.height as i32 - small_h - 8).max(min_y);
                    let anchor_x = (clamped_x + (win_size.width as i32 - small_w) / 2).clamp(min_x, max_small_x);
                    let anchor_y = (clamped_y + (win_size.height as i32 - small_h) / 2).clamp(min_y, max_small_y);
                    mem.pill_offset = Some(tauri::PhysicalPosition::new(anchor_x - m_pos.x, anchor_y - m_pos.y));
                    *TRAY_COLLAPSED_POSITION.lock().unwrap() = Some(tauri::PhysicalPosition::new(anchor_x, anchor_y));
                }
                mem.last_monitor_name = mon.name().cloned();
                *TRAY_WINDOW_CUSTOM_POSITION.lock().unwrap() = Some(tauri::PhysicalPosition::new(clamped_x, clamped_y));
            }
        }
    }
    Ok(())
}

pub fn track_tray_window_moved(window: &Window, pos: tauri::PhysicalPosition<i32>) {
    let app = window.app_handle();
    if let Some(tray_win) = app.get_webview_window("tray") {
        let win_size = tray_win.outer_size().unwrap_or(tauri::PhysicalSize::new(160, 64));
        if let Some(mon) = get_window_active_monitor(&tray_win).or_else(|| app.primary_monitor().ok().flatten()) {
            let m_pos = mon.position();
            let m_size = mon.size();
            let scale = mon.scale_factor();
            let small_w = (160.0 * scale).round() as i32;
            let small_h = (64.0 * scale).round() as i32;

            let min_x = m_pos.x + 8;
            let min_y = m_pos.y + 8;
            let max_x = (m_pos.x + m_size.width as i32 - win_size.width as i32 - 8).max(min_x);
            let max_y = (m_pos.y + m_size.height as i32 - win_size.height as i32 - 8).max(min_y);

            let clamped_x = pos.x.clamp(min_x, max_x);
            let clamped_y = pos.y.clamp(min_y, max_y);

            let mut mem = TRAY_POSITION_STATE.lock().unwrap();
            let offset_x = clamped_x - m_pos.x;
            let offset_y = clamped_y - m_pos.y;

            if (win_size.width as i32) <= small_w + 40 {
                mem.pill_offset = Some(tauri::PhysicalPosition::new(offset_x, offset_y));
                *TRAY_COLLAPSED_POSITION.lock().unwrap() = Some(tauri::PhysicalPosition::new(clamped_x, clamped_y));
            } else {
                mem.expanded_offset = Some(tauri::PhysicalPosition::new(offset_x, offset_y));
                let max_small_x = (m_pos.x + m_size.width as i32 - small_w - 8).max(min_x);
                let max_small_y = (m_pos.y + m_size.height as i32 - small_h - 8).max(min_y);
                let anchor_x = (clamped_x + (win_size.width as i32 - small_w) / 2).clamp(min_x, max_small_x);
                let anchor_y = (clamped_y + (win_size.height as i32 - small_h) / 2).clamp(min_y, max_small_y);
                mem.pill_offset = Some(tauri::PhysicalPosition::new(anchor_x - m_pos.x, anchor_y - m_pos.y));
                *TRAY_COLLAPSED_POSITION.lock().unwrap() = Some(tauri::PhysicalPosition::new(anchor_x, anchor_y));
            }
            mem.last_monitor_name = mon.name().cloned();
            *TRAY_WINDOW_CUSTOM_POSITION.lock().unwrap() = Some(tauri::PhysicalPosition::new(clamped_x, clamped_y));
        }
    }
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn show_tray_context_menu(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};

    let maximize_item = MenuItemBuilder::with_id("maximize", "Maximize")
        .build(&app)
        .map_err(|e| e.to_string())?;
    let separator = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit DoIT")
        .build(&app)
        .map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(&app)
        .item(&maximize_item)
        .item(&separator)
        .item(&quit_item)
        .build()
        .map_err(|e| e.to_string())?;

    window.popup_menu(&menu).map_err(|e| e.to_string())?;
    Ok(())
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
