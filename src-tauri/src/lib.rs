pub mod actions;
pub mod commands;
pub mod models;
pub mod platform;
pub mod storage;
pub mod window;

use actions::Action;
use commands::files::{file_from_args, LaunchFile};
use storage::StorageManager;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/tray_rgba.bin");

/// Tauri's default async runtime starts one worker per CPU core (16 idle threads on a 16-core
/// laptop, each with its own allocator arena). DoIT's async commands are a handful of file
/// pickers, so two workers are plenty.
fn use_small_async_runtime() {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("async runtime");
    tauri::async_runtime::set(runtime.handle().clone());
    // Lives for the whole process; dropping it would stop every async command.
    std::mem::forget(runtime);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    platform::init();
    use_small_async_runtime();

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
            let path = file_from_args(&argv);
            if window::in_canvas() {
                window::show_canvas(app);
                if let Some(p) = path {
                    let _ = app.emit("open-external-file", p);
                }
            } else {
                // The canvas may have to be rebuilt: park the path so the fresh page picks it up on mount.
                if let Some(p) = path {
                    if let Ok(mut slot) = app.state::<LaunchFile>().0.lock() {
                        *slot = Some(p);
                    }
                }
                window::show_canvas(app);
            }
        }))
        .manage(storage_manager)
        .manage(LaunchFile(std::sync::Mutex::new(launch_file)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(window::on_window_event)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "maximize" | "show" => window::show_canvas(app),
            "quit" => window::quit(app),
            _ => {}
        })
        .setup(move |app| {
            // Reaching setup means no instance was running, so there is nothing to quit.
            if launch_action == Some(Action::Quit) {
                app.handle().exit(0);
                return Ok(());
            }
            commands::settings::allow_note_images(app.handle(), &app.state::<StorageManager>());
            let canvas = window::open_canvas(app.handle())?;
            if app.state::<StorageManager>().get_is_maximized() {
                let _ = canvas.maximize();
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
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => window::show_canvas(app),
                    "tray" => window::show_dock(app, window::DockOpen::default()),
                    "quit" => window::quit(app),
                    _ => {}
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
            commands::notes::get_shelves,
            commands::notes::create_shelf,
            commands::notes::rename_shelf,
            commands::notes::delete_shelf,
            commands::notes::reorder_shelves,
            commands::notes::set_shelf_icon,
            commands::notes::set_shelf_collapsed,
            commands::files::save_attachment,
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
            commands::window::open_tray_mode,
            commands::window::open_canvas_mode,
            commands::window::tray_ready,
            commands::window::set_pill_look,
            commands::window::set_tray_mode,
            commands::window::canvas_ready,
            commands::window::set_external_dirty,
            commands::window::begin_dock_drag,
            commands::window::end_dock_drag,
            commands::window::save_tray_position,
            commands::window::restart_app,
            commands::window::quit_app,
            commands::window::show_tray_context_menu
        ])
        .build(tauri::generate_context!())
        .expect("error while building DoIT")
        .run(|app, event| {
            // Note files are written in the background; let the last edits land before exiting.
            if let tauri::RunEvent::Exit = event {
                app.state::<StorageManager>().flush_writes();
            }
        });
}
