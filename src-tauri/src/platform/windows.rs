//! Windows adapter: Win32 calls, WebView2 and the registry.

use std::path::PathBuf;

pub fn init() {}

pub const TRAY_SKIPS_TASKBAR: bool = true;

pub const DOCK_WINDOW_RESIZABLE: bool = false;

/// Windows' own move loop runs the drag; `save_tray_position` clamps the result.
pub fn dock_drag_by_app(_window: &tauri::Window) -> bool {
    false
}

pub fn keep_wm_from_moving(_window: &tauri::Window) {}

/// The notification area is always there.
pub fn has_tray() -> bool {
    true
}

pub fn focus_window(window: &tauri::Window) {
    let _ = window.set_focus();
}

pub fn config_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|app_data| PathBuf::from(app_data).join(super::DATA_FOLDER))
}

pub fn monitor_of_window(window: &tauri::Window) -> Option<tauri::Monitor> {
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

pub fn set_window_bounds(window: &tauri::Window, x: i32, y: i32, w: u32, h: u32) {
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
pub fn ensure_always_on_top(window: &tauri::Window) {
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

/// WebView2 shares one browser/GPU process tree per (user-data-folder + arguments) pair, so every
/// webview must get exactly these. `--expose-gc` lets the app collect garbage before idling or closing
/// a page; `--in-process-gpu` folds the GPU process into the browser process.
pub const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --js-flags=--expose-gc --disable-background-networking --disk-cache-size=8388608 --in-process-gpu";

/// WebView2 is tuned at creation through `BROWSER_ARGS`.
pub fn prepare_webview(_window: &tauri::WebviewWindow) {}

/// WebView2 loads in a hidden window, so it simply stays hidden until it is ready.
pub fn map_invisibly(_window: &tauri::Window) {}

pub fn make_visible(_window: &tauri::Window) {}

/// Destroying the window already releases WebView2's renderer.
pub fn release_webview(_window: &tauri::WebviewWindow) {}

/// The Windows heap gives freed pages back on its own.
pub fn trim_memory() {}

mod pill {
    //! The native pill on Windows: a layered window whose pixels come from `UpdateLayeredWindow`
    //! (per-pixel alpha, so the transparent margin is also click-through), with mouse input read
    //! from a window subclass.

    use std::cell::Cell;
    use std::ffi::c_void;
    use std::ptr::{null, null_mut};

    use crate::platform::{PillFrame, PillInput, PillInputHandler};

    type Hwnd = *mut c_void;
    type SubclassProc = unsafe extern "system" fn(Hwnd, u32, usize, isize, usize, usize) -> isize;

    #[repr(C)]
    struct TrackMouseEventArgs {
        cb_size: u32,
        dw_flags: u32,
        hwnd_track: Hwnd,
        dw_hover_time: u32,
    }

    #[repr(C)]
    struct BitmapInfoHeader {
        size: u32,
        width: i32,
        height: i32,
        planes: u16,
        bit_count: u16,
        compression: u32,
        size_image: u32,
        x_pels_per_meter: i32,
        y_pels_per_meter: i32,
        clr_used: u32,
        clr_important: u32,
    }

    #[repr(C)]
    struct BitmapInfo {
        header: BitmapInfoHeader,
        colors: [u32; 1],
    }

    #[repr(C)]
    struct Size {
        cx: i32,
        cy: i32,
    }

    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[repr(C)]
    struct BlendFunction {
        op: u8,
        flags: u8,
        source_constant_alpha: u8,
        alpha_format: u8,
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetWindowLongPtrW(hwnd: Hwnd, index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: Hwnd, index: i32, value: isize) -> isize;
        fn TrackMouseEvent(args: *mut TrackMouseEventArgs) -> i32;
        fn SetCapture(hwnd: Hwnd) -> Hwnd;
        fn ReleaseCapture() -> i32;
        fn GetDpiForWindow(hwnd: Hwnd) -> u32;
        fn GetCursorPos(point: *mut Point) -> i32;
        fn ScreenToClient(hwnd: Hwnd, point: *mut Point) -> i32;
        fn GetDC(hwnd: Hwnd) -> *mut c_void;
        fn ReleaseDC(hwnd: Hwnd, dc: *mut c_void) -> i32;
        fn UpdateLayeredWindow(
            hwnd: Hwnd,
            dst_dc: *mut c_void,
            dst_point: *const Point,
            size: *const Size,
            src_dc: *mut c_void,
            src_point: *const Point,
            key: u32,
            blend: *const BlendFunction,
            flags: u32,
        ) -> i32;
    }

    #[link(name = "gdi32")]
    unsafe extern "system" {
        fn CreateCompatibleDC(dc: *mut c_void) -> *mut c_void;
        fn CreateDIBSection(dc: *mut c_void, info: *const BitmapInfo, usage: u32, bits: *mut *mut c_void, section: *mut c_void, offset: u32) -> *mut c_void;
        fn SelectObject(dc: *mut c_void, object: *mut c_void) -> *mut c_void;
        fn DeleteObject(object: *mut c_void) -> i32;
        fn DeleteDC(dc: *mut c_void) -> i32;
    }

    #[link(name = "comctl32")]
    unsafe extern "system" {
        fn SetWindowSubclass(hwnd: Hwnd, proc: SubclassProc, id: usize, data: usize) -> i32;
        fn RemoveWindowSubclass(hwnd: Hwnd, proc: SubclassProc, id: usize) -> i32;
        fn DefSubclassProc(hwnd: Hwnd, msg: u32, wparam: usize, lparam: isize) -> isize;
    }

    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_LAYERED: isize = 0x0008_0000;
    const WM_NCDESTROY: u32 = 0x0082;
    const WM_MOUSEMOVE: u32 = 0x0200;
    const WM_LBUTTONDOWN: u32 = 0x0201;
    const WM_LBUTTONUP: u32 = 0x0202;
    const WM_RBUTTONUP: u32 = 0x0205;
    const WM_EXITSIZEMOVE: u32 = 0x0232;
    const WM_MOUSELEAVE: u32 = 0x02A3;
    const TME_LEAVE: u32 = 0x2;
    const ULW_ALPHA: u32 = 0x2;
    const AC_SRC_ALPHA: u8 = 0x1;
    const SUBCLASS_ID: usize = 0xD017;

    struct Hook {
        on_input: PillInputHandler,
        tracking: Cell<bool>,
    }

    fn scale(hwnd: Hwnd) -> f64 {
        match unsafe { GetDpiForWindow(hwnd) } {
            0 => 1.0,
            dpi => dpi as f64 / 96.0,
        }
    }

    /// Client coordinates (physical px) packed in an lParam, as logical px.
    fn point(hwnd: Hwnd, lparam: isize) -> (f64, f64) {
        let x = (lparam & 0xFFFF) as u16 as i16 as f64;
        let y = ((lparam >> 16) & 0xFFFF) as u16 as i16 as f64;
        let s = scale(hwnd);
        (x / s, y / s)
    }

    unsafe extern "system" fn proc(hwnd: Hwnd, msg: u32, wparam: usize, lparam: isize, id: usize, data: usize) -> isize {
        // SAFETY: `data` is the `Hook` boxed in `attach`, freed only below on WM_NCDESTROY.
        let hook = unsafe { &*(data as *const Hook) };
        let input = &hook.on_input;
        match msg {
            WM_MOUSEMOVE => {
                if !hook.tracking.get() {
                    let mut args = TrackMouseEventArgs {
                        cb_size: std::mem::size_of::<TrackMouseEventArgs>() as u32,
                        dw_flags: TME_LEAVE,
                        hwnd_track: hwnd,
                        dw_hover_time: 0,
                    };
                    unsafe { TrackMouseEvent(&mut args) };
                    hook.tracking.set(true);
                    input(PillInput::Enter);
                }
                let (x, y) = point(hwnd, lparam);
                input(PillInput::Move(x, y));
            }
            WM_MOUSELEAVE => {
                hook.tracking.set(false);
                input(PillInput::Leave);
            }
            WM_LBUTTONDOWN => {
                unsafe { SetCapture(hwnd) };
                let (x, y) = point(hwnd, lparam);
                input(PillInput::Press(x, y));
            }
            WM_LBUTTONUP => {
                unsafe { ReleaseCapture() };
                let (x, y) = point(hwnd, lparam);
                input(PillInput::Release(x, y));
            }
            // Windows' own move loop swallowed the button release: the drag it ran is over.
            WM_EXITSIZEMOVE => {
                let mut at = Point { x: 0, y: 0 };
                unsafe {
                    GetCursorPos(&mut at);
                    ScreenToClient(hwnd, &mut at);
                }
                let s = scale(hwnd);
                input(PillInput::Release(at.x as f64 / s, at.y as f64 / s));
            }
            WM_RBUTTONUP => input(PillInput::Menu),
            WM_NCDESTROY => {
                unsafe { RemoveWindowSubclass(hwnd, proc, id) };
                let result = unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) };
                drop(unsafe { Box::from_raw(data as *mut Hook) });
                return result;
            }
            _ => {}
        }
        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

    /// Makes the window layered. The windowing library rewrites a window's extended styles when its
    /// state changes, which can drop this flag again, so every frame re-asserts it.
    unsafe fn keep_layered(hwnd: Hwnd) {
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            if style & WS_EX_LAYERED == 0 {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED);
            }
        }
    }

    pub fn attach(window: &tauri::Window, on_input: PillInputHandler) {
        let Ok(hwnd) = window.hwnd() else { return };
        let hwnd = hwnd.0 as isize;
        let _ = window.run_on_main_thread(move || {
            let hwnd = hwnd as Hwnd;
            let hook = Box::into_raw(Box::new(Hook { on_input, tracking: Cell::new(false) }));
            // SAFETY: plain Win32 calls on a window this thread owns; `hook` lives until WM_NCDESTROY.
            unsafe {
                keep_layered(hwnd);
                if SetWindowSubclass(hwnd, proc, SUBCLASS_ID, hook as usize) == 0 {
                    drop(Box::from_raw(hook));
                }
            }
        });
    }

    pub fn present(window: &tauri::Window, frame: PillFrame) {
        let Ok(hwnd) = window.hwnd() else { return };
        let hwnd = hwnd.0 as isize;
        let _ = window.run_on_main_thread(move || {
            let hwnd = hwnd as Hwnd;
            let (w, h) = (frame.width as i32, frame.height as i32);
            let info = BitmapInfo {
                header: BitmapInfoHeader {
                    size: std::mem::size_of::<BitmapInfoHeader>() as u32,
                    width: w,
                    height: -h, // top-down rows, like the frame
                    planes: 1,
                    bit_count: 32,
                    compression: 0,
                    size_image: 0,
                    x_pels_per_meter: 0,
                    y_pels_per_meter: 0,
                    clr_used: 0,
                    clr_important: 0,
                },
                colors: [0],
            };
            // SAFETY: GDI objects are created, used and released within this block; `bits` points at
            // w * h * 4 bytes owned by the DIB section until DeleteObject.
            unsafe {
                keep_layered(hwnd);
                let screen = GetDC(null_mut());
                let memory = CreateCompatibleDC(screen);
                let mut bits: *mut c_void = null_mut();
                let bitmap = CreateDIBSection(memory, &info, 0, &mut bits, null_mut(), 0);
                if !bitmap.is_null() && !bits.is_null() {
                    let previous = SelectObject(memory, bitmap);
                    let target = std::slice::from_raw_parts_mut(bits as *mut u8, frame.rgba.len());
                    // GDI wants premultiplied BGRA.
                    for (dst, src) in target.chunks_exact_mut(4).zip(frame.rgba.chunks_exact(4)) {
                        dst.copy_from_slice(&[src[2], src[1], src[0], src[3]]);
                    }
                    let size = Size { cx: w, cy: h };
                    let origin = Point { x: 0, y: 0 };
                    let blend = BlendFunction { op: 0, flags: 0, source_constant_alpha: 255, alpha_format: AC_SRC_ALPHA };
                    UpdateLayeredWindow(hwnd, screen, null(), &size, memory, &origin, 0, &blend, ULW_ALPHA);
                    SelectObject(memory, previous);
                    DeleteObject(bitmap);
                }
                DeleteDC(memory);
                ReleaseDC(null_mut(), screen);
            }
        });
    }
}

pub fn attach_pill(window: &tauri::Window, on_input: crate::platform::PillInputHandler) {
    pill::attach(window, on_input);
}

pub fn present_pill(window: &tauri::Window, frame: crate::platform::PillFrame) {
    pill::present(window, frame);
}

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
