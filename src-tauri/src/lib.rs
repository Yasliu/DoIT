pub mod actions;
pub mod commands;
pub mod models;
pub mod platform;
pub mod storage;
pub mod window;

use actions::Action;
use commands::files::{file_from_args, LaunchFile};
use commands::window::{open_canvas_mode, open_tray_mode};
use storage::StorageManager;
use window::state::{MainWindowState, SAVED_MAIN_WINDOW_STATE};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/tray_rgba.bin");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    platform::init();

    let storage_manager = StorageManager::new();

    let argv = std::env::args().collect::<Vec<_>>();
    let launch_file = file_from_args(&argv);
    let launch_action = Action::from_args(&argv);

    tauri::Builder::default()
        // Must be first: a second launch (e.g. double-clicking another .md) is forwarded to this instance
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(action) = Action::from_args(&argv) {
                action.perform(app);
                return;
            }
            let main_visible = app
                .get_webview_window("main")
                .map(|w| w.is_visible().unwrap_or(false))
                .unwrap_or(false);
            let path = file_from_args(&argv);
            if !main_visible {
                // canvas may have to be rebuilt: park the path so the fresh page picks it up on mount
                if let Some(ref p) = path {
                    if let Ok(mut slot) = app.state::<LaunchFile>().0.lock() {
                        *slot = Some(p.clone());
                    }
                }
                let _ = open_canvas_mode(app.clone());
            } else {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.unminimize();
                    platform::focus_window(&main);
                }
                if let Some(p) = path {
                    let _ = app.emit("open-external-file", p);
                }
            }
        }))
        .manage(storage_manager)
        .manage(LaunchFile(std::sync::Mutex::new(launch_file)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| {
            let label = window.label().to_string();

            if let tauri::WindowEvent::Moved(pos) = event {
                if label == "tray" {
                    commands::window::track_tray_window_moved(window, *pos);
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

                        // X button on main: if dock_on_close is true, switch to floating docking mode; else exit
                        let storage = app.state::<StorageManager>();
                        if storage.get_dock_on_close() {
                            let _ = open_tray_mode(app.clone(), None, None);
                        } else {
                            app.exit(0);
                        }
                    } else if platform::has_tray() {
                        // Window-manager close (Alt+F4, the dock's Quit) on the pill/panel: hide it;
                        // the tray icon brings it back.
                        if let Some(win) = app.get_webview_window(&label) {
                            let _ = win.hide();
                        }
                    } else {
                        // No tray icon to come back from (stock GNOME): hiding would leave an
                        // invisible process, so quit as the user asked.
                        commands::window::quit_app(app.clone());
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
        .setup(move |app| {
            // Reaching setup means no instance was running, so there is nothing to quit.
            if launch_action == Some(Action::Quit) {
                app.handle().exit(0);
                return Ok(());
            }
            // Force absolute transparency on window background wrapper layer
            // Launch Window State Persistence Engine: Restore maximize state
            if let Some(main_win) = app.get_webview_window("main") {
                platform::prepare_webview(&main_win);
                let _ = main_win.set_decorations(false);
                let storage = app.state::<StorageManager>();
                if storage.get_is_maximized() {
                    let _ = main_win.maximize();
                }
            }
            // Native Windows taskbar notification tray icon
            let show_item = MenuItem::with_id(app, "show", "Open Canvas", true, None::<&str>)?;
            let tray_item = MenuItem::with_id(app, "tray", "Switch to Docking Mode", true, None::<&str>)?;
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
                        "tray" => open_tray_mode(app.clone(), None, None),
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
                        Action::Toggle.perform(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::notes::get_notes,
            commands::notes::save_note,
            commands::notes::update_note_category,
            commands::notes::update_note_coordinates,
            commands::notes::delete_note,
            commands::notes::get_categories,
            commands::notes::add_category,
            commands::notes::delete_category,
            commands::notes::rename_category,
            commands::notes::toggle_category_collapse,
            commands::files::take_launch_file,
            commands::files::open_external_file,
            commands::files::save_external_file,
            commands::files::select_storage_directory,
            commands::files::export_data,
            commands::files::import_data,
            commands::files::import_single_markdown_file,
            commands::files::scan_markdown_folder,
            commands::files::pick_and_scan_folder,
            commands::files::import_folder_as_shelf,
            commands::settings::get_settings,
            commands::settings::get_default_storage_path,
            commands::settings::update_settings,
            commands::settings::get_system_fonts,
            commands::window::toggle_window_minimize,
            commands::window::set_mini_window_mode,
            commands::window::open_tray_mode,
            commands::window::open_canvas_mode,
            commands::window::tray_ready,
            commands::window::set_tray_mode,
            commands::window::canvas_ready,
            commands::window::set_external_dirty,
            commands::window::start_drag,
            commands::window::begin_dock_drag,
            commands::window::end_dock_drag,
            commands::window::save_tray_position,
            commands::window::restart_app,
            commands::window::quit_app,
            commands::window::show_tray_context_menu
        ])
        .run(tauri::generate_context!())
        .expect("error while running DoIT tauri application");
}
