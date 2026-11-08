//! Linux/macOS adapter. Tuned for Linux desktops (GTK, WebKitGTK, XDG); macOS gets generic fallbacks.

use std::path::PathBuf;

/// GNOME's Wayland compositor ignores client-requested window positions and always-on-top, and
/// the dock-mode pill needs both, so run through XWayland when it is available. An explicit
/// `GDK_BACKEND`, or `DOIT_NATIVE_WAYLAND=1`, keeps the user's choice.
///
/// Leave WebKitGTK's DMA-BUF renderer on, even on NVIDIA where turning it off measured faster: the
/// fallback path then repaints only the damaged region of our transparent window, so everything
/// but the area under the pointer vanished.
pub fn init() {
    #[cfg(target_os = "linux")]
    {
        let var = |name| std::env::var_os(name).is_some();
        if var("WAYLAND_DISPLAY") && var("DISPLAY") && !var("GDK_BACKEND") && !var("DOIT_NATIVE_WAYLAND") {
            // SAFETY: called first in `run()`, before Tauri, GTK or any other thread exists.
            unsafe { std::env::set_var("GDK_BACKEND", "x11") };
        }
    }
}

/// Many Linux desktops (stock GNOME) show no tray icons, so keep dock mode visible in the dock.
pub const TRAY_SKIPS_TASKBAR: bool = false;

/// Whether a StatusNotifier host (KDE, GNOME's AppIndicator extension, most other panels) is
/// showing tray icons right now; Tauri's Linux tray icon is invisible without one.
pub fn has_tray() -> bool {
    #[cfg(target_os = "linux")]
    {
        use gio::glib::{ToVariant, VariantTy};
        let Ok(bus) = gio::bus_get_sync(gio::BusType::Session, None::<&gio::Cancellable>) else {
            return false;
        };
        bus.call_sync(
            Some("org.kde.StatusNotifierWatcher"),
            "/StatusNotifierWatcher",
            "org.freedesktop.DBus.Properties",
            "Get",
            Some(&("org.kde.StatusNotifierWatcher", "IsStatusNotifierHostRegistered").to_variant()),
            Some(VariantTy::new("(v)").expect("valid type")),
            gio::DBusCallFlags::NONE,
            500,
            None::<&gio::Cancellable>,
        )
        .ok()
        .and_then(|reply| reply.child_value(0).as_variant())
        .and_then(|value| value.get::<bool>())
        .unwrap_or(false)
    }
    #[cfg(not(target_os = "linux"))]
    false
}

/// `$XDG_CONFIG_HOME/DoIT`, else `~/.config/DoIT`.
pub fn config_dir() -> Option<PathBuf> {
    if cfg!(not(target_os = "linux")) {
        return None;
    }
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
    Some(base.join("DoIT"))
}

pub fn monitor_of_window(_window: &tauri::Window) -> Option<tauri::Monitor> {
    None
}

/// GDK's per-monitor workarea (mutter publishes it as `_GTK_WORKAREAS`): the monitor minus the
/// top bar and any dock that reserves space. Under native Wayland it is the whole monitor.
pub fn work_area(monitor: &tauri::Monitor) -> (i32, i32, i32, i32) {
    let area = monitor.work_area();
    let (x, y) = (area.position.x, area.position.y);
    (x, y, x + area.size.width as i32, y + area.size.height as i32)
}

/// Mutter's focus-stealing prevention ignores a focus request without a fresh X user timestamp: the
/// window stayed behind with a "DoIT is ready" notification whenever a shortcut, the dock or a second
/// launch raised it. Stamp the window with the current server time so it counts as user-initiated.
pub fn focus_window(window: &tauri::Window) {
    #[cfg(target_os = "linux")]
    {
        let target = window.clone();
        let _ = window.run_on_main_thread(move || {
            use gtk::glib::Cast;
            use gtk::prelude::{GtkWindowExt, WidgetExt};
            let Ok(gtk_window) = target.gtk_window() else { return };
            let x11 = gtk_window.window().and_then(|w| w.downcast::<gdkx11::X11Window>().ok());
            match x11 {
                Some(x11) => {
                    let now = gdkx11::functions::x11_get_server_time(&x11);
                    x11.set_user_time(now);
                    gtk_window.present_with_time(now);
                }
                None => gtk_window.present(),
            }
        });
    }
    #[cfg(not(target_os = "linux"))]
    let _ = window.set_focus();
}

/// Mutter lets a window being moved slide off the screen, so under X11 the app moves the dock
/// window itself during a drag (see `window::drag`). A native Wayland compositor ignores client
/// positions (and GDK cannot report the cursor there), so it keeps running the drag.
pub fn dock_drag_by_app(_window: &tauri::Window) -> bool {
    cfg!(target_os = "linux")
        && (std::env::var("GDK_BACKEND").is_ok_and(|b| b == "x11") || std::env::var_os("WAYLAND_DISPLAY").is_none())
}

/// Takes "move" out of the window's Motif functions, so mutter refuses its own move gestures
/// (Super+drag, Alt+F7, the window menu) that could carry the dock window off the screen.
/// Moves the app requests itself still go through.
pub fn keep_wm_from_moving(window: &tauri::Window) {
    #[cfg(target_os = "linux")]
    {
        let target = window.clone();
        let _ = window.run_on_main_thread(move || {
            use gtk::gdk::WMFunction;
            use gtk::prelude::WidgetExt;
            let Ok(gtk_window) = target.gtk_window() else { return };
            if let Some(gdk_window) = gtk_window.window() {
                // With ALL set, the other bits list the functions to take away.
                gdk_window.set_functions(WMFunction::ALL | WMFunction::MOVE);
            }
        });
    }
    #[cfg(not(target_os = "linux"))]
    let _ = window;
}

/// GTK only honours programmatic resizes of resizable windows, so the dock frame is built resizable
/// here and `set_window_bounds` pins its size through geometry hints instead.
pub const DOCK_WINDOW_RESIZABLE: bool = cfg!(target_os = "linux");

/// Pins min = max size hints to the target, so the window manager keeps the frame at exactly this
/// size and the edges cannot be dragged. Tao would queue the move and the resize separately (the
/// window manager could then see the move at the old size and push the window back on screen), so
/// both happen in one main-thread pass. A mapped window also gets them through GDK directly, because
/// GTK sends hints only in a later idle pass and skips a move to the position it last requested.
pub fn set_window_bounds(window: &tauri::Window, x: i32, y: i32, w: u32, h: u32) {
    #[cfg(target_os = "linux")]
    {
        let target = window.clone();
        let scale = window.scale_factor().unwrap_or(1.0);
        let logical = move |v: i32| (v as f64 / scale).round() as i32;
        let (x, y, w, h) = (logical(x), logical(y), logical(w as i32), logical(h as i32));
        let _ = window.run_on_main_thread(move || {
            use gtk::gdk::{Geometry, Gravity, WindowHints};
            use gtk::prelude::{GtkWindowExt, WidgetExt};
            let Ok(gtk_window) = target.gtk_window() else { return };
            let fixed = Geometry::new(w, h, w, h, 0, 0, 0, 0, 0.0, 0.0, Gravity::NorthWest);
            gtk_window.set_geometry_hints(None::<&gtk::Widget>, Some(&fixed), WindowHints::MIN_SIZE | WindowHints::MAX_SIZE);
            gtk_window.resize(w, h);
            gtk_window.move_(x, y);
            // GTK flushes its hints in a later idle pass; on a mapped window send them first, then
            // the move and size as one request.
            if gtk_window.is_visible() {
                if let Some(gdk_window) = gtk_window.window() {
                    gdk_window.set_geometry_hints(&fixed, WindowHints::MIN_SIZE | WindowHints::MAX_SIZE);
                    gdk_window.move_resize(x, y, w, h);
                }
            }
        });
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(w, h)));
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)));
    }
}

/// WebKitGTK has no runtime working-set hint like WebView2's. Dock mode frees the canvas by
/// destroying its webview instead (see `release_webview`).
pub fn set_webview_memory_level(_window: &tauri::WebviewWindow, _low: bool) {}

/// The WebKitGTK counterpart of the WebView2 cache flags: the default web-browser cache model keeps
/// large memory caches, a back/forward cache and spare web processes for fast navigation, none of
/// which a local one-page-per-window app uses. The context is shared, so repeating this is harmless.
pub fn prepare_webview(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "linux")]
    let _ = window.with_webview(|webview| {
        use webkit2gtk::{CacheModel, WebContextExt, WebViewExt};
        if let Some(context) = webview.inner().context() {
            context.set_cache_model(CacheModel::DocumentViewer);
        }
    });
    #[cfg(not(target_os = "linux"))]
    let _ = window;
}

/// Destroying the GTK window does not end the page's WebKitWebProcess (something still holds the
/// WebKitWebView), so every canvas <-> dock switch leaked one ~280 MB process. End it explicitly.
pub fn release_webview(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "linux")]
    let _ = window.with_webview(|webview| {
        use webkit2gtk::WebViewExt;
        webview.inner().terminate_web_process();
    });
    #[cfg(not(target_os = "linux"))]
    let _ = window;
}

/// Only WebView2 takes browser arguments.
pub const BROWSER_ARGS: &str = "";

/// glibc keeps freed heap pages for reuse; after a webview closes (a few MB of UI-side state) hand
/// them back to the system instead.
pub fn trim_memory() {
    #[cfg(all(target_os = "linux", target_env = "gnu"))]
    // SAFETY: malloc_trim only releases free pages at the top of glibc's heaps.
    unsafe {
        libc::malloc_trim(0);
    }
}

#[cfg(target_os = "linux")]
thread_local! {
    /// The pill's drawing area and its latest frame, per window label. GTK objects live on the main
    /// thread only, so they are kept here rather than passed around.
    static PILLS: std::cell::RefCell<std::collections::HashMap<String, PillSurface>> = Default::default();
}

#[cfg(target_os = "linux")]
struct PillSurface {
    area: gtk::DrawingArea,
    frame: std::rc::Rc<std::cell::RefCell<Option<gtk::cairo::ImageSurface>>>,
}

/// Fills the plain window with a GTK drawing area that paints the latest frame and reports pointer
/// input on it. GTK keeps the pointer grabbed while a button is held, so moves and the release still
/// arrive when a drag leaves the window.
pub fn attach_pill(window: &tauri::Window, on_input: crate::platform::PillInputHandler) {
    #[cfg(target_os = "linux")]
    {
        let target = window.clone();
        let _ = window.run_on_main_thread(move || {
            use crate::platform::PillInput;
            use gtk::gdk::EventMask;
            use gtk::glib::Propagation;
            use gtk::prelude::{BoxExt, WidgetExt, WidgetExtManual};
            let Ok(vbox) = target.default_vbox() else { return };
            let area = gtk::DrawingArea::new();
            area.add_events(
                EventMask::BUTTON_PRESS_MASK
                    | EventMask::BUTTON_RELEASE_MASK
                    | EventMask::POINTER_MOTION_MASK
                    | EventMask::ENTER_NOTIFY_MASK
                    | EventMask::LEAVE_NOTIFY_MASK,
            );
            let frame: std::rc::Rc<std::cell::RefCell<Option<gtk::cairo::ImageSurface>>> = Default::default();
            let shown = frame.clone();
            area.connect_draw(move |_, cr| {
                cr.set_operator(gtk::cairo::Operator::Source);
                match shown.borrow().as_ref() {
                    Some(surface) => {
                        let _ = cr.set_source_surface(surface, 0.0, 0.0);
                    }
                    None => cr.set_source_rgba(0.0, 0.0, 0.0, 0.0),
                }
                let _ = cr.paint();
                Propagation::Stop
            });
            let on_input = std::rc::Rc::new(on_input);
            let input = on_input.clone();
            area.connect_button_press_event(move |_, e| {
                let (x, y) = e.position();
                match e.button() {
                    1 => input(PillInput::Press(x, y)),
                    3 => input(PillInput::Menu),
                    _ => {}
                }
                Propagation::Stop
            });
            let input = on_input.clone();
            area.connect_button_release_event(move |_, e| {
                if e.button() == 1 {
                    let (x, y) = e.position();
                    input(PillInput::Release(x, y));
                }
                Propagation::Stop
            });
            let input = on_input.clone();
            area.connect_motion_notify_event(move |_, e| {
                let (x, y) = e.position();
                input(PillInput::Move(x, y));
                Propagation::Stop
            });
            let input = on_input.clone();
            area.connect_enter_notify_event(move |_, _| {
                input(PillInput::Enter);
                Propagation::Proceed
            });
            let input = on_input;
            area.connect_leave_notify_event(move |_, _| {
                input(PillInput::Leave);
                Propagation::Proceed
            });
            vbox.pack_start(&area, true, true, 0);
            area.show();
            let label = target.label().to_string();
            let gone = label.clone();
            area.connect_destroy(move |_| {
                let _ = PILLS.try_with(|pills| pills.borrow_mut().remove(&gone));
            });
            PILLS.with(|pills| pills.borrow_mut().insert(label, PillSurface { area, frame }));
        });
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (window, on_input);
}

pub fn present_pill(window: &tauri::Window, frame: crate::platform::PillFrame) {
    #[cfg(target_os = "linux")]
    {
        let label = window.label().to_string();
        let _ = window.run_on_main_thread(move || {
            use gtk::prelude::WidgetExt;
            // cairo's ARGB32 is premultiplied BGRA in memory on little-endian machines.
            let mut bgra = frame.rgba;
            for px in bgra.chunks_exact_mut(4) {
                px.swap(0, 2);
            }
            let stride = frame.width as i32 * 4;
            let Ok(surface) =
                gtk::cairo::ImageSurface::create_for_data(bgra, gtk::cairo::Format::ARgb32, frame.width as i32, frame.height as i32, stride)
            else {
                return;
            };
            surface.set_device_scale(frame.scale, frame.scale);
            PILLS.with(|pills| {
                if let Some(pill) = pills.borrow().get(&label) {
                    *pill.frame.borrow_mut() = Some(surface);
                    pill.area.queue_draw();
                }
            });
        });
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (window, frame);
}

/// Font families from fontconfig, the same source WebKitGTK resolves CSS font names against.
pub fn system_fonts() -> Vec<String> {
    let Ok(output) = std::process::Command::new("fc-list").args(["--format", "%{family[0]}\\n", ":"]).output() else {
        return Vec::new();
    };
    let families: std::collections::BTreeSet<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|f| !f.is_empty() && !f.starts_with('.'))
        .map(String::from)
        .collect();
    families.into_iter().collect()
}

/// The XDG Documents folder (localised, e.g. `~/Dokumente`), else `~/Documents`.
pub fn documents_dir() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME")?);
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| home.join(".config"));
    std::fs::read_to_string(config.join("user-dirs.dirs"))
        .ok()
        .and_then(|dirs| xdg_user_dir(&dirs, "XDG_DOCUMENTS_DIR", &home))
        .or_else(|| Some(home.join("Documents")))
}

/// Reads one entry of a `user-dirs.dirs` file. Per the spec a value of plain `$HOME` means the
/// folder is disabled, which we treat as unset.
fn xdg_user_dir(dirs: &str, key: &str, home: &std::path::Path) -> Option<PathBuf> {
    let value = dirs.lines().find_map(|line| line.trim().strip_prefix(key)?.strip_prefix('='))?;
    let value = value.trim().trim_matches('"');
    let path = match value.strip_prefix("$HOME") {
        Some("") | Some("/") => return None,
        Some(rest) => home.join(rest.trim_start_matches('/')),
        None if value.starts_with('/') => PathBuf::from(value),
        None => return None,
    };
    Some(path)
}

#[cfg(test)]
mod tests {
    use super::xdg_user_dir;
    use std::path::{Path, PathBuf};

    #[test]
    fn reads_the_localised_documents_folder_and_ignores_a_disabled_one() {
        let home = Path::new("/home/ana");
        let dirs = "# written by xdg-user-dirs-update\nXDG_DESKTOP_DIR=\"$HOME/Schreibtisch\"\nXDG_DOCUMENTS_DIR=\"$HOME/Dokumente\"\n";
        assert_eq!(xdg_user_dir(dirs, "XDG_DOCUMENTS_DIR", home), Some(PathBuf::from("/home/ana/Dokumente")));
        assert_eq!(xdg_user_dir("XDG_DOCUMENTS_DIR=\"$HOME/\"", "XDG_DOCUMENTS_DIR", home), None);
        assert_eq!(xdg_user_dir("XDG_DOCUMENTS_DIR=\"/data/docs\"", "XDG_DOCUMENTS_DIR", home), Some(PathBuf::from("/data/docs")));
    }
}
