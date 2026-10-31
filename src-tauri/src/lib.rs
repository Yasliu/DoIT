pub mod models;
pub mod storage;
pub mod commands;

use commands::*;
use storage::StorageManager;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/tray_rgba.bin");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let storage_manager = StorageManager::new();

    tauri::Builder::default()
        .manage(storage_manager)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| {
            let label = window.label().to_string();

            if let tauri::WindowEvent::Moved(pos) = event {
                if label == "tray" {
                    crate::commands::track_tray_window_moved(window, *pos);
                }
            }

            if let tauri::WindowEvent::Resized(_) = event {
                if label == "main" {
                    if let Ok(is_min) = window.is_minimized() {
                        if !is_min {
                            if let Ok(is_max) = window.is_maximized() {
                                let app = window.app_handle();
                                let storage = app.state::<StorageManager>();
                                let _ = storage.set_is_maximized(is_max);
                            }
                        }
                    }
                }
            }

            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Always prevent native close — we manage visibility ourselves
                api.prevent_close();

                let app = window.app_handle().clone();

                // Run on a background thread to avoid blocking the event callback
                std::thread::spawn(move || {
                    if label == "main" {
                        // Save main window exact state before switching to tray
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

                            let storage = app.state::<StorageManager>();
                            let _ = storage.set_is_maximized(is_maximized);

                            *SAVED_MAIN_WINDOW_STATE.lock().unwrap() = Some(MainWindowState {
                                is_maximized,
                                is_fullscreen,
                                position,
                                size,
                                monitor_name,
                            });
                        }

                        // X button on main → switch to floating tray companion on the same monitor
                        let _ = open_tray_mode(app.clone());
                    } else {
                        // X button on tray companion / pill → just hide it
                        if let Some(win) = app.get_webview_window(&label) {
                            let _ = win.hide();
                        }
                    }
                });
            }
        })
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "maximize" | "show" => {
                    let _ = open_canvas_mode(app.clone());
                }
                "quit" => {
                    if let Some(main_win) = app.get_webview_window("main") {
                        if let Ok(is_max) = main_win.is_maximized() {
                            let storage = app.state::<StorageManager>();
                            let _ = storage.set_is_maximized(is_max);
                        }
                    }
                    app.exit(0);
                }
                _ => {}
            }
        })
        .setup(|app| {
            // Force absolute transparency on window background wrapper layer
            if let Some(tray_win) = app.get_webview_window("tray") {
                let _ = tray_win.set_decorations(false);
                let _ = tray_win.set_shadow(false);
            }
            // Launch Window State Persistence Engine: Restore maximize state
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.set_decorations(false);
                let storage = app.state::<StorageManager>();
                if storage.get_is_maximized() {
                    let _ = main_win.maximize();
                }
            }
            // Native Windows taskbar notification tray icon
            let show_item = MenuItem::with_id(app, "show", "Open Canvas", true, None::<&str>)?;
            let tray_item = MenuItem::with_id(app, "tray", "Switch to Desk Tray", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit DoIT", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &tray_item, &quit_item])?;

            let tray_image = Image::new(TRAY_ICON_BYTES, 32, 32);

            let _tray = TrayIconBuilder::with_id("doit-tray")
                .icon(tray_image)
                .tooltip("DoIT — click to toggle")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let _ = match event.id.as_ref() {
                        "show" => open_canvas_mode(app.clone()),
                        "tray" => open_tray_mode(app.clone()),
                        "quit" => {
                            app.exit(0);
                            Ok(())
                        }
                        _ => Ok(()),
                    };
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle().clone();
                        // Toggle: if main is visible → go to tray, else → go to canvas
                        let main_visible = app
                            .get_webview_window("main")
                            .map(|w| w.is_visible().unwrap_or(false))
                            .unwrap_or(false);

                        if main_visible {
                            let _ = open_tray_mode(app);
                        } else {
                            let _ = open_canvas_mode(app);
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_notes,
            save_note,
            update_note_category,
            update_note_coordinates,
            delete_note,
            get_categories,
            add_category,
            delete_category,
            rename_category,
            toggle_category_collapse,
            get_settings,
            get_default_storage_path,
            update_settings,
            select_storage_directory,
            export_data,
            import_data,
            import_single_markdown_file,
            scan_markdown_folder,
            pick_and_scan_folder,
            toggle_window_minimize,
            set_mini_window_mode,
            open_tray_mode,
            open_canvas_mode,
            resize_tray_window,
            sync_tray_window_height,
            sync_tray_window_bounds,
            snap_tray_window,
            set_tray_minimized,
            collapse_tray_to_pill,
            expand_tray_from_pill,
            start_drag,
            save_tray_position,
            restart_app,
            quit_app,
            show_tray_context_menu
        ])
        .run(tauri::generate_context!())
        .expect("error while running DoIT tauri application");
}
