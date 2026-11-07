//! Window lifecycle: ONE live webview at a time.
//!   canvas mode : only "main" renders (full React canvas)
//!   tray mode   : only "tray" renders (single frame that mutates between the panel and the
//!                 floating pill via native set_size); "main" is destroyed so the webview can
//!                 reclaim its whole layout tree, and rebuilt from config on demand.
//!
//! The `#[tauri::command]` entry points live in `commands::window`; this module is the engine.

pub mod drag;
pub mod geometry;
pub mod lifecycle;
pub mod state;
