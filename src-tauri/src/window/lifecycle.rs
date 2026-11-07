//! Creating, revealing, suspending and rebuilding the canvas and tray webviews.

use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};

use super::geometry::{get_window_active_monitor, position_tray_on_monitor, TRAY_PANEL_H, TRAY_PANEL_W};
use super::state::*;
use crate::platform;
use crate::storage::StorageManager;

/// Identical browser arguments on EVERY window: WebView2 shares one browser/GPU process tree per
/// (user-data-folder + arguments) pair, so mismatching args would spawn a second tree.
pub const WEBVIEW_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --js-flags=--expose-gc --disable-background-networking --disk-cache-size=8388608 --in-process-gpu";

/// Forces a V8 garbage collection inside the page (needs --js-flags=--expose-gc).
pub fn flush_webview_memory(window: &tauri::WebviewWindow) {
    let _ = window.eval("try{if(window.gc){window.gc();}}catch(e){}");
}

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
        platform::release_webview(&main);
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
    platform::prepare_webview(&window);
    MAIN_SUSPENDED.store(false, Ordering::SeqCst);
    Some(window)
}
/// Shows the canvas and tears the tray webview down completely (frees its renderer).
pub fn reveal_canvas(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        platform::focus_window(&main);
    }
    if let Some(tray) = app.get_webview_window("tray") {
        platform::release_webview(&tray);
        let _ = tray.destroy();
    }
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
        .resizable(platform::DOCK_WINDOW_RESIZABLE)
        .skip_taskbar(platform::TRAY_SKIPS_TASKBAR)
        .visible(false)
        .additional_browser_args(WEBVIEW_ARGS)
        .build()
        .map_err(|e| e.to_string())?;
    platform::prepare_webview(&window);
    Ok((window, true))
}

pub fn open_tray_mode_inner(
    app: &AppHandle,
    should_expand: bool,
    note_id: Option<String>,
) -> Result<(), String> {
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

    if let Some(ref mon) = target_mon {
        *TARGET_TRAY_MONITOR_NAME.lock().unwrap() = mon.name().cloned();
        lock_window_transition(350);
        position_tray_on_monitor(&tray, mon, should_expand);
        if let Ok(pos) = tray.outer_position() {
            if should_expand {
                PRE_STATE_BUFFER.lock().unwrap().expanded_physical_pos = Some(pos);
            } else {
                PRE_STATE_BUFFER.lock().unwrap().pill_physical_pos = Some(pos);
            }
        }
    }

    if created {
        // the page calls `tray_ready` once mounted, which shows the window (no blank flash)
    } else {
        let _ = tray.show();
        platform::ensure_always_on_top(&tray);
        platform::focus_window(&tray);
        let _ = tray.emit("set-expanded", should_expand);
        if should_expand {
            if let Some(id) = note_id {
                let _ = tray.emit("open-note", id);
            }
        }
    }

    suspend_main(app);
    Ok(())
}

pub fn open_canvas_mode_inner(app: &AppHandle) {
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
