//! Windows adapter: Win32 calls, WebView2 and the registry.

use std::path::PathBuf;

pub fn init() {}

pub const TRAY_SKIPS_TASKBAR: bool = true;

pub const DOCK_WINDOW_RESIZABLE: bool = false;

/// Windows' own move loop runs the drag; `save_tray_position` clamps the result.
pub fn dock_drag_by_app(_window: &tauri::WebviewWindow) -> bool {
    false
}

pub fn keep_wm_from_moving(_window: &tauri::WebviewWindow) {}

/// The notification area is always there.
pub fn has_tray() -> bool {
    true
}

pub fn focus_window(window: &tauri::WebviewWindow) {
    let _ = window.set_focus();
}

pub fn config_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|app_data| PathBuf::from(app_data).join("DoIT"))
}

pub fn monitor_of_window(window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    #[repr(C)]
    struct RECT { left: i32, top: i32, right: i32, bottom: i32 }
    #[repr(C)]
    struct MONITORINFO { cb_size: u32, rc_monitor: RECT, rc_work: RECT, dw_flags: u32 }

    unsafe extern "system" {
        fn MonitorFromWindow(hwnd: *mut std::ffi::c_void, dw_flags: u32) -> *mut std::ffi::c_void;
        fn GetMonitorInfoW(h_monitor: *mut std::ffi::c_void, lpmi: *mut MONITORINFO) -> i32;
    }

    if let Ok(hwnd) = window.hwnd() {
        let h_mon = unsafe { MonitorFromWindow(hwnd.0, 2 /* MONITOR_DEFAULTTONEAREST */) };
        if !h_mon.is_null() {
            let mut mi = MONITORINFO {
                cb_size: std::mem::size_of::<MONITORINFO>() as u32,
                rc_monitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
                rc_work: RECT { left: 0, top: 0, right: 0, bottom: 0 },
                dw_flags: 0,
            };
            if unsafe { GetMonitorInfoW(h_mon, &mut mi) } != 0 {
                if let Ok(monitors) = window.available_monitors() {
                    for mon in monitors {
                        let mp = mon.position();
                        if mp.x == mi.rc_monitor.left && mp.y == mi.rc_monitor.top {
                            return Some(mon);
                        }
                    }
                }
            }
        }
    }
    None
}

pub fn work_area(monitor: &tauri::Monitor) -> (i32, i32, i32, i32) {
    #[repr(C)]
    struct RECT {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[repr(C)]
    struct POINT {
        x: i32,
        y: i32,
    }
    #[repr(C)]
    struct MONITORINFO {
        cb_size: u32,
        rc_monitor: RECT,
        rc_work: RECT,
        dw_flags: u32,
    }

    unsafe extern "system" {
        fn MonitorFromPoint(pt: POINT, dw_flags: u32) -> *mut std::ffi::c_void;
        fn GetMonitorInfoW(h_monitor: *mut std::ffi::c_void, lpmi: *mut MONITORINFO) -> i32;
    }

    let m_pos = monitor.position();
    let m_size = monitor.size();
    let center = POINT {
        x: m_pos.x + (m_size.width as i32) / 2,
        y: m_pos.y + (m_size.height as i32) / 2,
    };

    unsafe {
        let h_mon = MonitorFromPoint(center, 2 /* MONITOR_DEFAULTTONEAREST */);
        if !h_mon.is_null() {
            let mut mi = MONITORINFO {
                cb_size: std::mem::size_of::<MONITORINFO>() as u32,
                rc_monitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
                rc_work: RECT { left: 0, top: 0, right: 0, bottom: 0 },
                dw_flags: 0,
            };
            if GetMonitorInfoW(h_mon, &mut mi) != 0 {
                return (mi.rc_work.left, mi.rc_work.top, mi.rc_work.right, mi.rc_work.bottom);
            }
        }
    }

    (m_pos.x, m_pos.y, m_pos.x + m_size.width as i32, m_pos.y + m_size.height as i32 - 48)
}

pub fn set_window_bounds(window: &tauri::WebviewWindow, x: i32, y: i32, w: u32, h: u32) {
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
        const HWND_TOPMOST: *mut std::ffi::c_void = -1isize as *mut std::ffi::c_void;
        const SWP_NOACTIVATE: u32 = 0x0010;
        unsafe {
            SetWindowPos(
                hwnd.0,
                HWND_TOPMOST,
                x,
                y,
                w as i32,
                h as i32,
                SWP_NOACTIVATE,
            );
        }
        return;
    }
    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(w, h)));
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)));
}

/// Re-asserts HWND_TOPMOST and always_on_top status on the window.
/// Called after moves, drags, focus changes, or mode switches so other apps cannot push the dock behind.
pub fn ensure_always_on_top(window: &tauri::WebviewWindow) {
    let _ = window.set_always_on_top(true);
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
        const HWND_TOPMOST: *mut std::ffi::c_void = -1isize as *mut std::ffi::c_void;
        const SWP_NOSIZE: u32 = 0x0001;
        const SWP_NOMOVE: u32 = 0x0002;
        const SWP_NOACTIVATE: u32 = 0x0010;
        unsafe {
            SetWindowPos(
                hwnd.0,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
}

/// Asks WebView2 to trim its working set (ICoreWebView2_19::MemoryUsageTargetLevel).
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

/// WebView2 is tuned at creation through `additionalBrowserArgs` / `WEBVIEW_ARGS`.
pub fn prepare_webview(_window: &tauri::WebviewWindow) {}

/// Destroying the window already releases WebView2's renderer.
pub fn release_webview(_window: &tauri::WebviewWindow) {}

pub fn documents_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(|profile| PathBuf::from(profile).join("Documents"))
}

pub fn system_fonts() -> Vec<String> {
    let mut fonts = std::collections::BTreeSet::new();

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
