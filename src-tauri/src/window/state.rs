//! The window engine's memory: which mode DoIT is in and what it needs to come back from it.

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use super::placement::{CanvasGeometry, DockShape, PillAnchor};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Canvas,
    Dock(DockShape),
}

pub struct Engine {
    pub mode: Mode,
    /// The canvas as it was when DoIT last left it; restored on the way back.
    pub canvas: Option<CanvasGeometry>,
    /// The canvas webview was destroyed for the dock and has to be rebuilt.
    pub canvas_suspended: bool,
    /// Identifies the latest trip from the canvas to the dock; a delayed retire checks it is still current.
    pub canvas_departure: u64,
    /// A rebuilt canvas is waiting for its page to report ready before it is shown.
    pub canvas_reveal_pending: bool,
    /// An externally opened file has unsaved edits: never destroy the canvas then.
    pub external_dirty: bool,
    /// Where a freshly built panel opens: on this monitor's home spot, or grown out of the pill at
    /// `dock_anchor`; and the note it opens on.
    pub dock_screen: Option<String>,
    pub dock_anchor: Option<PillAnchor>,
    pub dock_note: Option<String>,
    /// The dock webview's page has mounted and listens for `set-expanded`.
    pub dock_page_ready: bool,
    /// Bumped by every dock change; a delayed job runs only if nothing changed since it was queued.
    pub dock_generation: u64,
    /// Until then the app itself is moving the dock, so moves are not the user's.
    hold_until: Option<Instant>,
}

static ENGINE: Mutex<Engine> = Mutex::new(Engine {
    mode: Mode::Canvas,
    canvas: None,
    canvas_suspended: false,
    canvas_departure: 0,
    canvas_reveal_pending: false,
    external_dirty: false,
    dock_screen: None,
    dock_anchor: None,
    dock_note: None,
    dock_page_ready: false,
    dock_generation: 0,
    hold_until: None,
});

pub fn engine() -> MutexGuard<'static, Engine> {
    ENGINE.lock().unwrap_or_else(|e| e.into_inner())
}

impl Engine {
    pub fn hold_moves(&mut self, duration: Duration) {
        self.hold_until = Some(Instant::now() + duration);
    }

    pub fn moves_held(&self) -> bool {
        self.hold_until.is_some_and(|until| Instant::now() < until)
    }
}
