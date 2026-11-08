//! The window engine's memory: which mode DoIT is in and what it needs to come back from it.

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use super::placement::{CanvasGeometry, DockShape};

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
    /// A rebuilt canvas is waiting for its page to report ready before it is shown.
    pub canvas_reveal_pending: bool,
    /// An externally opened file has unsaved edits: never destroy the canvas then.
    pub external_dirty: bool,
    /// The shape and monitor a freshly built dock page opens in.
    pub dock_start: DockShape,
    pub dock_screen: Option<String>,
    /// Until then the app itself is moving the dock, so moves are not the user's.
    hold_until: Option<Instant>,
}

static ENGINE: Mutex<Engine> = Mutex::new(Engine {
    mode: Mode::Canvas,
    canvas: None,
    canvas_suspended: false,
    canvas_reveal_pending: false,
    external_dirty: false,
    dock_start: DockShape::Pill,
    dock_screen: None,
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
