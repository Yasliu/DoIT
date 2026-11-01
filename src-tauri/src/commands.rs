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
pub struct PreStatePositionBuffer {
    pub pill_physical_pos: Option<tauri::PhysicalPosition<i32>>,
    pub expanded_physical_pos: Option<tauri::PhysicalPosition<i32>>,
    pub main_physical_pos: Option<tauri::PhysicalPosition<i32>>,
    pub main_physical_size: Option<tauri::PhysicalSize<u32>>,
}

pub static PRE_STATE_BUFFER: Mutex<PreStatePositionBuffer> = Mutex::new(PreStatePositionBuffer {
    pill_physical_pos: None,
    expanded_physical_pos: None,
    main_physical_pos: None,
    main_physical_size: None,
});

pub static TRANSITION_LOCK_UNTIL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn current_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn lock_window_transition(duration_ms: u64) {
    TRANSITION_LOCK_UNTIL.store(current_timestamp_ms() + duration_ms, std::sync::atomic::Ordering::SeqCst);
}

pub fn is_window_transitioning() -> bool {
    current_timestamp_ms() < TRANSITION_LOCK_UNTIL.load(std::sync::atomic::Ordering::SeqCst)
}

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
    if window.label() == "main" {
        if let Ok(is_max) = window.is_maximized() {
            let app = window.app_handle();
            let storage = app.state::<StorageManager>();
            let _ = storage.set_is_maximized(is_max);
        }
    }
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

/// Panel size in logical px: roomy by default, but never taller/wider than the screen allows.
pub const TRAY_PANEL_W: f64 = 440.0;
pub const TRAY_PANEL_H: f64 = 620.0;

pub fn tray_panel_logical(monitor: &tauri::Monitor) -> (f64, f64) {
    let scale = monitor.scale_factor();
    let mw = monitor.size().width as f64 / scale;
    let mh = monitor.size().height as f64 / scale;
    (TRAY_PANEL_W.min(mw * 0.9), TRAY_PANEL_H.min(mh * 0.88))
}

pub fn position_tray_on_monitor(
    window: &tauri::WebviewWindow,
    monitor: &tauri::Monitor,
    expanded: bool,
) {
    let scale_factor = monitor.scale_factor();
    let m_pos = monitor.position(); // PhysicalPosition<i32> { x, y }
    let m_size = monitor.size();     // PhysicalSize<u32> { width, height }

    let small_w_phys = (180.0 * scale_factor).round() as i32;
    let small_h_phys = (44.0 * scale_factor).round() as i32;
    let (panel_w, panel_h) = tray_panel_logical(monitor);
    let expanded_w_phys = (panel_w * scale_factor).round() as i32;
    let expanded_h_phys = (panel_h * scale_factor).round() as i32;

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

        set_window_bounds_atomic(window, final_x, final_y, expanded_w_phys as u32, expanded_h_phys as u32);
    } else {
        drop(mem);

        let final_x = m_pos.x + active_pill_offset.x;
        let final_y = m_pos.y + active_pill_offset.y;

        set_window_bounds_atomic(window, final_x, final_y, small_w_phys as u32, small_h_phys as u32);
    }
}

#[cfg(windows)]
pub fn set_window_bounds_atomic(window: &tauri::WebviewWindow, x: i32, y: i32, w: u32, h: u32) {
    if let Ok(hwnd) = window.hwnd() {
        unsafe extern "system" {
            fn SetWindowPos(
                hwnd: *mut std::ffi::c_void,
                hwnd_insert_after: *mut std::ffi::c_void,
                x: i32,
                y: i32,
                cx: i32,
                cy: i32,
                flags: u32,
            ) -> i32;
        }
        const SWP_NOZORDER: u32 = 0x0004;
        const SWP_NOACTIVATE: u32 = 0x0010;
        const SWP_NOOWNERZORDER: u32 = 0x0200;
        unsafe {
            SetWindowPos(
                hwnd.0,
                std::ptr::null_mut(),
                x,
                y,
                w as i32,
                h as i32,
                SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
            );
        }
        return;
    }
    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(w, h)));
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)));
}

#[cfg(not(windows))]
pub fn set_window_bounds_atomic(window: &tauri::WebviewWindow, x: i32, y: i32, w: u32, h: u32) {
    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(w, h)));
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)));
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

// ---------------------------------------------------------------------------
// Window lifecycle: ONE live webview at a time.
//   canvas mode : only "main" renders (full React canvas)
//   tray mode   : only "tray" renders (single frame that mutates between the 380x480 panel and the
//                 180x44 floating bar via native set_size); "main" is swapped for a blank document
//                 so WebView2 can reclaim its whole layout tree.
// ---------------------------------------------------------------------------

use std::sync::atomic::{AtomicBool, Ordering};

/// Identical browser arguments on EVERY window: WebView2 shares one browser/GPU process tree per
/// (user-data-folder + arguments) pair, so mismatching args would spawn a second tree.
pub const WEBVIEW_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --js-flags=--expose-gc --disable-background-networking --disk-cache-size=8388608 --in-process-gpu";

pub static MAIN_SUSPENDED: AtomicBool = AtomicBool::new(false);
pub static MAIN_SHOW_PENDING: AtomicBool = AtomicBool::new(false);
/// Set by the frontend while an externally opened file has unsaved edits (never blank the canvas then)
pub static EXTERNAL_DIRTY: AtomicBool = AtomicBool::new(false);

/// Forces a V8 garbage collection inside the page (needs --js-flags=--expose-gc).
pub fn flush_webview_memory(window: &tauri::WebviewWindow) {
    let _ = window.eval("try{if(window.gc){window.gc();}}catch(e){}");
}

/// Asks WebView2 to trim its working set (ICoreWebView2_19::MemoryUsageTargetLevel).
#[cfg(windows)]
pub fn set_webview_memory_level(window: &tauri::WebviewWindow, low: bool) {
    let _ = window.with_webview(move |webview| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        };
        use windows_core::Interface;
        if let Ok(core) = webview.controller().CoreWebView2() {
            if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
                let level = if low {
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                } else {
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                };
                let _ = core19.SetMemoryUsageTargetLevel(level);
            }
        }
    });
}

#[cfg(not(windows))]
pub fn set_webview_memory_level(_window: &tauri::WebviewWindow, _low: bool) {}

/// Tray mode: the canvas webview is DESTROYED (after the frontend flushed pending saves), so WebView2
/// reclaims its renderer + whole layout tree. It is rebuilt from the window config on demand.
pub fn suspend_main(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let _ = main.hide();
    if MAIN_SUSPENDED.load(Ordering::SeqCst) || EXTERNAL_DIRTY.load(Ordering::SeqCst) {
        return;
    }
    let app2 = app.clone();
    std::thread::spawn(move || {
        let Some(main) = app2.get_webview_window("main") else {
            return;
        };
        let _ = app2.emit_to("main", "flush-pending", ());
        std::thread::sleep(std::time::Duration::from_millis(350));
        // canvas re-opened in the meantime (or an external file has unsaved edits): leave it alone
        if main.is_visible().unwrap_or(false) || EXTERNAL_DIRTY.load(Ordering::SeqCst) {
            return;
        }
        flush_webview_memory(&main);
        if main.destroy().is_ok() {
            MAIN_SUSPENDED.store(true, Ordering::SeqCst);
        }
    });
}

/// Rebuilds the (hidden) canvas window from its config; the page calls `canvas_ready` when mounted.
fn recreate_main(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    let cfg = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")?
        .clone();
    let window = tauri::WebviewWindowBuilder::from_config(app, &cfg)
        .ok()?
        .visible(false)
        .build()
        .ok()?;
    MAIN_SUSPENDED.store(false, Ordering::SeqCst);
    Some(window)
}
/// Shows the canvas and tears the tray webview down completely (frees its renderer).
fn reveal_canvas(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
    if let Some(tray) = app.get_webview_window("tray") {
        let _ = tray.destroy();
    }
}

#[tauri::command]
pub fn canvas_ready(app: AppHandle) {
    if MAIN_SHOW_PENDING.swap(false, Ordering::SeqCst) {
        reveal_canvas(&app);
    }
}

#[tauri::command]
pub fn set_external_dirty(dirty: bool) {
    EXTERNAL_DIRTY.store(dirty, Ordering::SeqCst);
}

/// Creates the single tray frame on demand (hidden until its page reports ready).
fn ensure_tray(app: &AppHandle) -> Result<(tauri::WebviewWindow, bool), String> {
    if let Some(existing) = app.get_webview_window("tray") {
        return Ok((existing, false));
    }
    let window = tauri::WebviewWindowBuilder::new(app, "tray", tauri::WebviewUrl::App("index.html?window=tray".into()))
        .title("DoIT Companion")
        .inner_size(TRAY_PANEL_W, TRAY_PANEL_H)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .visible(false)
        .additional_browser_args(WEBVIEW_ARGS)
        .build()
        .map_err(|e| e.to_string())?;
    Ok((window, true))
}

#[tauri::command]
pub fn open_tray_mode(app: AppHandle) -> Result<(), String> {
    // window creation must never run on the main/UI thread of a command
    std::thread::spawn(move || {
        let _ = open_tray_mode_inner(&app);
    });
    Ok(())
}

fn open_tray_mode_inner(app: &AppHandle) -> Result<(), String> {
    let main_win_opt = app.get_webview_window("main");

    let active_monitor = if let Some(ref main_win) = main_win_opt {
        if main_win.is_visible().unwrap_or(false) {
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

            let storage = app.state::<StorageManager>();
            let _ = storage.set_is_maximized(is_maximized);
            mon
        } else {
            None
        }
    } else {
        None
    };

    let (tray, created) = ensure_tray(app)?;

    let target_mon = active_monitor
        .or_else(|| get_window_active_monitor(&tray))
        .or_else(|| app.primary_monitor().ok().flatten());

    // Entering desk tray mode from the canvas always begins at the bottom right corner
    {
        let mut mem = TRAY_POSITION_STATE.lock().unwrap();
        mem.pill_offset = None;
        mem.expanded_offset = None;
        let mut buf = PRE_STATE_BUFFER.lock().unwrap();
        buf.pill_physical_pos = None;
        buf.expanded_physical_pos = None;
    }

    if let Some(mon) = target_mon {
        lock_window_transition(350);
        position_tray_on_monitor(&tray, &mon, true);
        if let Ok(pos) = tray.outer_position() {
            PRE_STATE_BUFFER.lock().unwrap().expanded_physical_pos = Some(pos);
        }
    }

    if created {
        // the page calls `tray_ready` once mounted, which shows the window (no blank flash)
    } else {
        let _ = tray.show();
        let _ = tray.set_always_on_top(true);
        let _ = tray.set_focus();
        let _ = tray.emit("set-expanded", true);
    }

    suspend_main(app);
    Ok(())
}

/// Called by the tray page after mount: reveals the (already positioned) window.
#[tauri::command]
pub fn tray_ready(window: tauri::WebviewWindow) -> String {
    // The frame is created on one monitor and then moved: Windows may have rescaled it (DPI change) during
    // that move, which left the very first panel too small. Re-apply the exact geometry now that it sits on
    // its final monitor.
    if let Some(mon) = get_window_active_monitor(&window) {
        position_tray_on_monitor(&window, &mon, true);
    }
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();
    "panel".to_string()
}

/// Mutates the one tray frame between "panel" (380x480) and "pill" (180x44), keeping the
/// bottom-right corner anchored. The frontend hides its content while this runs.
#[tauri::command]
pub fn set_tray_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let tray = app
        .get_webview_window("tray")
        .ok_or_else(|| "tray window is not open".to_string())?;
    let pos = tray.outer_position().map_err(|e| e.to_string())?;
    let size = tray.outer_size().map_err(|e| e.to_string())?;
    let scale = tray.scale_factor().unwrap_or(1.0);

    let (lw, lh) = if mode == "pill" {
        (180.0, 44.0)
    } else {
        get_window_active_monitor(&tray)
            .map(|m| tray_panel_logical(&m))
            .unwrap_or((TRAY_PANEL_W, TRAY_PANEL_H))
    };
    let w = (lw * scale).round() as i32;
    let h = (lh * scale).round() as i32;
    let right = pos.x + size.width as i32;
    let bottom = pos.y + size.height as i32;
    let (x, y) = clamp_to_monitor(&tray, &app, right - w, bottom - h, w, h);

    lock_window_transition(250);
    set_window_bounds_atomic(&tray, x, y, w as u32, h as u32);
    if mode == "pill" {
        flush_webview_memory(&tray);
        set_webview_memory_level(&tray, true);
    } else {
        set_webview_memory_level(&tray, false);
    }
    Ok(())
}

fn clamp_to_monitor(
    window: &tauri::WebviewWindow,
    app: &AppHandle,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
) -> (i32, i32) {
    if let Some(mon) = get_window_active_monitor(window).or_else(|| app.primary_monitor().ok().flatten()) {
        let m_pos = mon.position();
        let m_size = mon.size();
        let min_x = m_pos.x + 8;
        let min_y = m_pos.y + 8;
        let max_x = (m_pos.x + m_size.width as i32 - w - 8).max(min_x);
        let max_y = (m_pos.y + m_size.height as i32 - h - 8).max(min_y);
        (x.clamp(min_x, max_x), y.clamp(min_y, max_y))
    } else {
        (x, y)
    }
}

#[tauri::command]
pub fn open_canvas_mode(app: AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        open_canvas_mode_inner(&app);
    });
    Ok(())
}

fn open_canvas_mode_inner(app: &AppHandle) {
    let (main_win, recreated) = match app.get_webview_window("main") {
        Some(w) => (w, false),
        None => match recreate_main(app) {
            Some(w) => (w, true),
            None => return,
        },
    };
    let tray_opt = app.get_webview_window("tray");

    // Pre-State Lock: capture the tray position before it is destroyed
    if let Some(ref tray_win) = tray_opt {
        if let Ok(tray_pos) = tray_win.outer_position() {
            let win_size = tray_win.outer_size().unwrap_or(tauri::PhysicalSize::new(180, 44));
            let scale = get_window_active_monitor(tray_win).map(|m| m.scale_factor()).unwrap_or(1.0);
            let small_w = (160.0 * scale).round() as i32;
            let mut buf = PRE_STATE_BUFFER.lock().unwrap();
            if (win_size.width as i32) <= small_w + 40 {
                buf.pill_physical_pos = Some(tray_pos);
            } else {
                buf.expanded_physical_pos = Some(tray_pos);
            }
        }
    }

    let target_mon = tray_opt
        .as_ref()
        .and_then(get_window_active_monitor)
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

    if recreated {
        // the canvas page is loading in a fresh webview: reveal it when it reports ready (or after a safety timeout)
        MAIN_SHOW_PENDING.store(true, Ordering::SeqCst);
        let app2 = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(3000));
            if MAIN_SHOW_PENDING.swap(false, Ordering::SeqCst) {
                reveal_canvas(&app2);
            }
        });
    } else {
        reveal_canvas(app);
    }
}

#[tauri::command]
pub fn start_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_tray_position(app: AppHandle) -> Result<(), String> {
    if is_window_transitioning() {
        return Ok(());
    }
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

                let clamped_pos = tauri::PhysicalPosition::new(clamped_x, clamped_y);
                let mut buf = PRE_STATE_BUFFER.lock().unwrap();
                if (win_size.width as i32) <= small_w + 40 {
                    buf.pill_physical_pos = Some(clamped_pos);
                    buf.expanded_physical_pos = None;
                } else {
                    buf.expanded_physical_pos = Some(clamped_pos);
                }
            }
        }
    }
    Ok(())
}

pub fn track_tray_window_moved(window: &Window, pos: tauri::PhysicalPosition<i32>) {
    if is_window_transitioning() {
        return;
    }
    let app = window.app_handle();
    if let Some(tray_win) = app.get_webview_window("tray") {
        let win_size = tray_win.outer_size().unwrap_or(tauri::PhysicalSize::new(160, 64));
        if let Some(mon) = get_window_active_monitor(&tray_win).or_else(|| app.primary_monitor().ok().flatten()) {
            let scale = mon.scale_factor();
            let small_w = (160.0 * scale).round() as i32;

            let mut buf = PRE_STATE_BUFFER.lock().unwrap();
            if (win_size.width as i32) <= small_w + 40 {
                buf.pill_physical_pos = Some(pos);
                buf.expanded_physical_pos = None;
            } else {
                buf.expanded_physical_pos = Some(pos);
            }
        }
    }
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    if let Some(main_win) = app.get_webview_window("main") {
        if let Ok(is_max) = main_win.is_maximized() {
            let storage = app.state::<StorageManager>();
            let _ = storage.set_is_maximized(is_max);
        }
    }
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


#[tauri::command]
pub fn get_system_fonts() -> Vec<String> {
    let mut fonts = std::collections::BTreeSet::new();

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let registry_keys = [
            "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
            "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
        ];

        for key in registry_keys {
            if let Ok(output) = std::process::Command::new("reg")
                .args(["query", key])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                if output.status.success() {
                    let text = String::from_utf8_lossy(&output.stdout);
                    for line in text.lines() {
                        let trimmed = line.trim();
                        if trimmed.is_empty() || trimmed.starts_with("HKEY_") {
                            continue;
                        }
                        if let Some(pos) = trimmed.find("REG_SZ") {
                            let raw_name = trimmed[..pos].trim();
                            let mut name = raw_name;
                            for suffix in &[" (TrueType)", " (OpenType)", " (Variable)", " (All lanes)", " & "] {
                                if let Some(idx) = name.find(suffix) {
                                    name = &name[..idx];
                                }
                            }
                            let family = name
                                .trim_end_matches(" Bold Italic")
                                .trim_end_matches(" SemiBold Italic")
                                .trim_end_matches(" ExtraBold Italic")
                                .trim_end_matches(" Light Italic")
                                .trim_end_matches(" Semilight Italic")
                                .trim_end_matches(" Thin Italic")
                                .trim_end_matches(" Bold")
                                .trim_end_matches(" Italic")
                                .trim_end_matches(" Light")
                                .trim_end_matches(" Semilight")
                                .trim_end_matches(" Black")
                                .trim_end_matches(" Thin")
                                .trim_end_matches(" ExtraBold")
                                .trim_end_matches(" ExtraLight")
                                .trim_end_matches(" SemiBold")
                                .trim_end_matches(" Medium")
                                .trim_end_matches(" Heavy")
                                .trim_end_matches(" Regular")
                                .trim();

                            if !family.is_empty() && !family.starts_with('@') {
                                fonts.insert(family.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    fonts.into_iter().collect()
}
