//! Building, idling and retiring DoIT's two webviews. Engine-specific memory rules (shared browser
//! arguments, garbage collection, releasing the page's process, trimming the heap) sit behind three
//! verbs, so the rest of `window` never has to call them in the right order itself.

use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::platform;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Surface {
    Canvas,
    Dock,
}

impl Surface {
    pub const fn label(self) -> &'static str {
        match self {
            Self::Canvas => "main",
            Self::Dock => "tray",
        }
    }
}

/// Builds the surface's window and webview. Both are always built here, from code, so every webview
/// gets the same browser arguments (on Windows a mismatch would start a second WebView2 process tree).
pub fn open(app: &AppHandle, surface: Surface, visible: bool) -> Result<WebviewWindow, String> {
    let builder = match surface {
        Surface::Canvas => WebviewWindowBuilder::new(app, surface.label(), WebviewUrl::App("index.html".into()))
            .title("DoIT")
            .inner_size(1440.0, 900.0)
            .min_inner_size(900.0, 620.0)
            .shadow(true)
            .resizable(true),
        Surface::Dock => WebviewWindowBuilder::new(app, surface.label(), WebviewUrl::App("index.html?window=tray".into()))
            .title("DoIT Companion")
            .shadow(false)
            .always_on_top(true)
            .resizable(platform::DOCK_WINDOW_RESIZABLE)
            .skip_taskbar(platform::TRAY_SKIPS_TASKBAR),
    };
    let window = builder
        .decorations(false)
        .transparent(true)
        .visible(visible)
        .additional_browser_args(platform::BROWSER_ARGS)
        .build()
        .map_err(|e| e.to_string())?;
    platform::prepare_webview(&window);
    Ok(window)
}

/// Lets an idle page give memory back (the pill), or asks for normal behaviour again.
pub fn idle(window: &WebviewWindow, idle: bool) {
    if idle {
        collect_garbage(window);
    }
    platform::set_webview_memory_level(window, idle);
}

/// Destroys the window and frees everything its page held. `false` if the window would not close.
pub fn retire(window: &WebviewWindow) -> bool {
    collect_garbage(window);
    platform::release_webview(window);
    let closed = window.destroy().is_ok();
    platform::trim_memory();
    closed
}

/// Forces a garbage collection inside the page (WebView2 exposes `gc` through its browser arguments).
fn collect_garbage(window: &WebviewWindow) {
    let _ = window.eval("try{if(window.gc){window.gc();}}catch(e){}");
}
