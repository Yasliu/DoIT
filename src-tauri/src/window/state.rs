//! The window engine's memory: which mode DoIT is in and what it needs to come back from it.

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use super::placement::{CanvasGeometry, DockShape, PillAnchor, Rect};

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
    /// A dock webview is being constructed and has not finished mounting yet.
    pub dock_page_building: bool,
    /// Bumped by every dock change; a delayed job runs only if nothing changed since it was queued.
    pub dock_generation: u64,
    /// The last place the app itself put a dock window, until a scale change consumes it.
    pub dock_placed: Option<(DockShape, Rect)>,
    /// Until then the app itself is moving the dock, so moves are not the user's.
    hold_until: Option<Instant>,
}

static ENGINE: Mutex<Engine> = Mutex::new(Engine::new());

pub fn engine() -> MutexGuard<'static, Engine> {
    ENGINE.lock().unwrap_or_else(|e| e.into_inner())
}

/// What a click on the pill turned into.
#[derive(Debug, PartialEq, Eq)]
pub enum PillClick {
    /// The dock is on its way back to the canvas: nothing to open.
    Ignore,
    /// The page has mounted behind the pill: tell it to expand.
    Expand,
    /// The page is still loading; it shows itself as the panel when it mounts.
    AwaitPage,
    /// There is no page: build one, which shows itself as the panel when it mounts.
    BuildPage,
}

/// Where a dock page that just mounted shows the panel: grown out of the pill at `anchor`, or at the
/// home spot of the monitor named `screen`; and the note it opens on.
pub struct PanelOpening {
    pub screen: Option<String>,
    pub anchor: Option<PillAnchor>,
    pub note: Option<String>,
}

impl Engine {
    const fn new() -> Self {
        Self {
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
            dock_page_building: false,
            dock_generation: 0,
            dock_placed: None,
            hold_until: None,
        }
    }

    /// Claims the build slot for the dock webview, returning `false` if a build is already in flight.
    pub fn begin_dock_build(&mut self) -> bool {
        if self.dock_page_building {
            return false;
        }
        self.dock_page_building = true;
        true
    }

    /// The pill was clicked (or the quick-note shortcut pressed) while the dock's page `page_exists`.
    /// If that page has not mounted yet, records that it must open as the panel, on `note`.
    /// Deciding and recording share one lock with `dock_page_mounted`, so a page mounting meanwhile
    /// is either told to expand or opens as the panel. Before, it could get neither, and the pill
    /// ignored every click after that.
    pub fn click_pill(&mut self, page_exists: bool, anchor: Option<PillAnchor>, note: Option<String>) -> PillClick {
        if self.mode == Mode::Canvas {
            return PillClick::Ignore;
        }
        // Not gated on the mode being the pill: the pill takes clicks only while it is on screen, so a
        // click means the panel is not showing, whatever an earlier click expected.
        if page_exists && self.dock_page_ready {
            return PillClick::Expand;
        }
        self.mode = Mode::Dock(DockShape::Panel);
        self.dock_anchor = anchor;
        self.dock_screen = None;
        if note.is_some() {
            self.dock_note = note;
        }
        self.dock_generation += 1;
        if page_exists || self.dock_page_building { PillClick::AwaitPage } else { PillClick::BuildPage }
    }

    /// The dock's page mounted. `Some` when it must show as the panel; `None` keeps it hidden behind
    /// the pill.
    pub fn dock_page_mounted(&mut self) -> Option<PanelOpening> {
        self.dock_page_ready = true;
        self.dock_page_building = false;
        let opening = PanelOpening { screen: self.dock_screen.take(), anchor: self.dock_anchor.take(), note: self.dock_note.clone() };
        (self.mode == Mode::Dock(DockShape::Panel)).then_some(opening)
    }

    pub fn hold_moves(&mut self, duration: Duration) {
        self.hold_until = Some(Instant::now() + duration);
    }

    pub fn moves_held(&self) -> bool {
        self.hold_until.is_some_and(|until| Instant::now() < until)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pill_with_loading_page() -> Engine {
        Engine { mode: Mode::Dock(DockShape::Pill), ..Engine::new() }
    }

    #[test]
    fn a_click_while_the_page_mounts_opens_the_panel_whichever_comes_first() {
        let mut click_first = pill_with_loading_page();
        assert_eq!(click_first.click_pill(true, None, Some("latest".into())), PillClick::AwaitPage);
        let opening = click_first.dock_page_mounted().expect("the page shows itself as the panel");
        assert_eq!(opening.note.as_deref(), Some("latest"), "on the note the shortcut asked for");

        let mut page_first = pill_with_loading_page();
        assert!(page_first.dock_page_mounted().is_none(), "the page stays hidden behind the pill");
        assert_eq!(page_first.click_pill(true, None, None), PillClick::Expand);
    }

    #[test]
    fn the_pill_still_opens_the_panel_after_a_click_whose_panel_never_showed() {
        // An earlier click expected the panel, but its page had already mounted behind the pill.
        let mut engine = Engine { mode: Mode::Dock(DockShape::Panel), dock_page_ready: true, ..Engine::new() };
        assert_eq!(engine.click_pill(true, None, None), PillClick::Expand);
    }

    #[test]
    fn a_click_while_the_page_is_building_awaits_instead_of_rebuilding() {
        let mut engine = pill_with_loading_page();
        assert!(engine.begin_dock_build());
        assert!(!engine.begin_dock_build(), "second concurrent build is rejected");
        assert_eq!(engine.click_pill(false, None, Some("quick".into())), PillClick::AwaitPage);
        let opening = engine.dock_page_mounted().expect("panel opens when the in-flight build finishes");
        assert_eq!(opening.note.as_deref(), Some("quick"));
        assert!(!engine.dock_page_building);
        assert!(engine.dock_page_ready);
    }

    #[test]
    fn the_pill_reopens_the_last_note_after_the_panel_page_was_retired() {
        let mut engine = Engine {
            mode: Mode::Dock(DockShape::Pill),
            dock_note: Some("note-42".into()),
            ..Engine::new()
        };
        assert_eq!(engine.click_pill(false, None, None), PillClick::BuildPage);
        let opening = engine.dock_page_mounted().expect("rebuilt page opens as panel");
        assert_eq!(opening.note.as_deref(), Some("note-42"));
    }
}
