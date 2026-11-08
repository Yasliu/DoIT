//! Dragging the dock window (pill or panel) without ever letting it leave the screen.
//!
//! Where `platform::dock_drag_by_app` allows it, the app moves the window itself: it follows the
//! cursor and passes every step through `keep_on_screen`, so the window stays wholly on the
//! combined screen area while the button is held, not only after release. Elsewhere the OS move
//! loop runs the drag and the position is clamped afterwards (`settle_dock`).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use super::geometry::work_areas;
use super::placement::keep_on_screen;
use crate::platform;

/// Bumped by every begin and end; a follow loop runs only while it still holds its own value.
static DRAG_GENERATION: AtomicU64 = AtomicU64::new(0);

/// About two steps per 60 Hz frame, so the window keeps up with the cursor.
const FOLLOW_INTERVAL: Duration = Duration::from_millis(8);

/// Starts a drag that grabbed the window at `grab` (logical px from its top-left). Returns `true`
/// when the app runs the drag (call `end` on release), `false` when the OS ran it to completion.
pub fn begin(window: &tauri::WebviewWindow, grab: (f64, f64)) -> bool {
    if !platform::dock_drag_by_app(window) {
        let _ = window.start_dragging();
        return false;
    }
    let generation = DRAG_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let window = window.clone();
    std::thread::spawn(move || {
        let scale = window.scale_factor().unwrap_or(1.0);
        let grab = ((grab.0 * scale).round() as i32, (grab.1 * scale).round() as i32);
        let Ok(size) = window.outer_size() else { return };
        let size = (size.width as i32, size.height as i32);
        let screens = work_areas(&window);
        let mut last = window.outer_position().ok().map(|p| (p.x, p.y));
        while DRAG_GENERATION.load(Ordering::SeqCst) == generation {
            if let Ok(cursor) = window.cursor_position() {
                let pointer = (cursor.x.round() as i32, cursor.y.round() as i32);
                let next = keep_on_screen((pointer.0 - grab.0, pointer.1 - grab.1), size, &screens, pointer);
                if last != Some(next) {
                    let _ = window.set_position(tauri::PhysicalPosition::new(next.0, next.1));
                    last = Some(next);
                }
            }
            std::thread::sleep(FOLLOW_INTERVAL);
        }
    });
    true
}

/// Stops the drag started by `begin`, if any.
pub fn end() {
    DRAG_GENERATION.fetch_add(1, Ordering::SeqCst);
}
