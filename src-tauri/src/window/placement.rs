//! Where DoIT's windows go: pure maths over screen rectangles in physical px. Nothing here touches a
//! window, so every rule is tested directly.

use serde::Serialize;

/// Gap kept between the dock window and the edge of the usable screen area (physical px).
pub const SCREEN_MARGIN: i32 = 8;

/// The pill's window size in logical px (the drawn pill sits inside it with a little margin).
pub const PILL_SIZE: (f64, f64) = (200.0, 52.0);
/// The panel's preferred size in logical px; smaller screens get less (see `dock_size`).
const PANEL_SIZE: (f64, f64) = (440.0, 620.0);
/// The canvas's preferred size in logical px when it has no saved geometry.
const CANVAS_SIZE: (f64, f64) = (1440.0, 900.0);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    pub fn right(&self) -> i32 {
        self.x + self.w
    }

    pub fn bottom(&self) -> i32 {
        self.y + self.h
    }

    fn center(&self) -> (i32, i32) {
        (self.x + self.w / 2, self.y + self.h / 2)
    }

    pub fn contains(&self, (px, py): (i32, i32)) -> bool {
        px >= self.x && px < self.right() && py >= self.y && py < self.bottom()
    }

    fn distance_sq(&self, (px, py): (i32, i32)) -> i64 {
        let dx = (self.x - px).max(px - (self.right() - 1)).max(0) as i64;
        let dy = (self.y - py).max(py - (self.bottom() - 1)).max(0) as i64;
        dx * dx + dy * dy
    }
}

/// One monitor: its whole area, the part taskbars and panels leave free, and its scale factor.
#[derive(Clone, Debug, PartialEq)]
pub struct Screen {
    pub name: Option<String>,
    pub area: Rect,
    pub work: Rect,
    pub scale: f64,
}

impl Screen {
    fn px(&self, logical: f64) -> i32 {
        (logical * self.scale).round() as i32
    }
}

/// The dock's two shapes: the small floating pill, or the panel with the note list and editor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DockShape {
    Pill,
    Panel,
}

impl DockShape {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pill => "pill",
            Self::Panel => "panel",
        }
    }
}

/// The dock window's size for `shape` on `screen`. The panel never takes more than 90% x 88% of it.
pub fn dock_size(shape: DockShape, screen: &Screen) -> (i32, i32) {
    let (w, h) = match shape {
        DockShape::Pill => PILL_SIZE,
        DockShape::Panel => {
            let (screen_w, screen_h) = (screen.area.w as f64 / screen.scale, screen.area.h as f64 / screen.scale);
            (PANEL_SIZE.0.min(screen_w * 0.9), PANEL_SIZE.1.min(screen_h * 0.88))
        }
    };
    (screen.px(w), screen.px(h))
}

/// `rect` moved (never resized) so it sits wholly inside `work`, `SCREEN_MARGIN` from each edge.
pub fn clamp_into(rect: Rect, work: Rect) -> Rect {
    let min_x = work.x + SCREEN_MARGIN;
    let min_y = work.y + SCREEN_MARGIN;
    let max_x = (work.right() - rect.w - SCREEN_MARGIN).max(min_x);
    let max_y = (work.bottom() - rect.h - SCREEN_MARGIN).max(min_y);
    Rect { x: rect.x.clamp(min_x, max_x), y: rect.y.clamp(min_y, max_y), ..rect }
}

/// Where the dock appears when it opens from the canvas: the pill in the bottom-right corner of the
/// work area, the panel grown out of that pill (sharing its right and bottom edges).
pub fn dock_home(shape: DockShape, screen: &Screen) -> Rect {
    let (pill_w, pill_h) = dock_size(DockShape::Pill, screen);
    let pill = clamp_into(
        Rect {
            x: screen.work.right() - pill_w - screen.px(24.0),
            y: screen.work.bottom() - pill_h - screen.px(12.0),
            w: pill_w,
            h: pill_h,
        },
        screen.work,
    );
    if shape == DockShape::Pill {
        return pill;
    }
    let (w, h) = dock_size(DockShape::Panel, screen);
    let max_x = screen.work.right() - w - SCREEN_MARGIN;
    let max_y = screen.work.bottom() - h - SCREEN_MARGIN;
    let x = if pill.x + w > max_x { pill.right() - w } else { pill.x };
    let y = if pill.y + h > max_y { pill.bottom() - h } else { pill.y };
    clamp_into(Rect { x, y, w, h }, screen.work)
}

/// Which way the dock grew when it changed shape, so the page can animate from the right corner.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Growth {
    pub grow_x: &'static str,
    pub grow_y: &'static str,
}

/// The dock at `current` changing to a window of `size`: it grows away from the nearest screen edges
/// (from its left edge in the left third, its right edge in the right third, its centre between;
/// from its top in the upper half, its bottom in the lower half), then is pulled back on screen.
pub fn reshape(current: Rect, size: (i32, i32), screen: &Screen) -> (Rect, Growth) {
    let (w, h) = size;
    // Decide by the window's centre: a tall panel at the bottom has its top-left in the upper half.
    let (cx, cy) = current.center();
    let (rel_x, rel_y) = (cx - screen.area.x, cy - screen.area.y);
    let third = screen.area.w / 3;
    let (grow_x, x) = if rel_x < third {
        ("right", current.x)
    } else if rel_x > third * 2 {
        ("left", current.right() - w)
    } else {
        ("center", cx - w / 2)
    };
    let (grow_y, y) = if rel_y < screen.area.h / 2 { ("down", current.y) } else { ("up", current.bottom() - h) };
    (clamp_into(Rect { x, y, w, h }, screen.work), Growth { grow_x, grow_y })
}

/// Where the dock window may go while it is dragged: wholly inside the usable area (`screens`, one
/// per monitor) of the monitor under `pointer`, or the monitor nearest to it when the pointer is off
/// every screen. Dragging therefore carries the window onto another monitor, but never past the
/// outer edge of the combined screen area.
pub fn keep_on_screen(wanted: (i32, i32), size: (i32, i32), screens: &[Rect], pointer: (i32, i32)) -> (i32, i32) {
    let Some(screen) = screens
        .iter()
        .find(|s| s.contains(pointer))
        .or_else(|| screens.iter().min_by_key(|s| s.distance_sq(pointer)))
    else {
        return wanted;
    };
    let placed = clamp_into(Rect { x: wanted.0, y: wanted.1, w: size.0, h: size.1 }, *screen);
    (placed.x, placed.y)
}

/// How the canvas looked when the app left it for the dock.
#[derive(Clone, Debug, PartialEq)]
pub struct CanvasGeometry {
    pub maximized: bool,
    pub fullscreen: bool,
    pub rect: Option<Rect>,
    pub screen: Option<String>,
}

/// How to put the canvas back. `at` is the top-left of the monitor to maximise or fill.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CanvasPlacement {
    Fullscreen { at: Option<(i32, i32)> },
    Maximized { at: Option<(i32, i32)> },
    /// The saved size and position.
    Restore(Rect),
    /// No saved geometry: a centred default. Skip it if the window is already maximised.
    Centered(Rect),
    Keep,
}

/// Brings the canvas back on `screen` (the one the dock was on): maximised or fullscreen there if it
/// was before; at its old place if it is the same monitor; otherwise centred there, no larger than it.
pub fn canvas_placement(saved: Option<&CanvasGeometry>, screen: Option<&Screen>) -> CanvasPlacement {
    let at = screen.map(|s| (s.area.x, s.area.y));
    match (saved, screen) {
        (Some(saved), _) if saved.fullscreen => CanvasPlacement::Fullscreen { at },
        (Some(saved), _) if saved.maximized => CanvasPlacement::Maximized { at },
        (Some(CanvasGeometry { rect: Some(rect), screen: saved_on, .. }), Some(screen)) if *saved_on != screen.name => {
            CanvasPlacement::Restore(centered(rect.w.min(screen.area.w), rect.h.min(screen.area.h), screen))
        }
        (Some(CanvasGeometry { rect: Some(rect), .. }), _) => CanvasPlacement::Restore(*rect),
        (_, Some(screen)) => {
            let w = (screen.px(CANVAS_SIZE.0) as f64).min(screen.area.w as f64 * 0.92) as i32;
            let h = (screen.px(CANVAS_SIZE.1) as f64).min(screen.area.h as f64 * 0.90) as i32;
            CanvasPlacement::Centered(centered(w, h, screen))
        }
        _ => CanvasPlacement::Keep,
    }
}

fn centered(w: i32, h: i32, screen: &Screen) -> Rect {
    Rect { x: screen.area.x + (screen.area.w - w) / 2, y: screen.area.y + (screen.area.h - h) / 2, w, h }
}

#[cfg(test)]
mod tests {
    use super::*;

    // A 1920x1080 laptop with a 42px top bar, and a taller 1080x1920 portrait monitor to its right.
    const LAPTOP: Rect = Rect { x: 0, y: 42, w: 1920, h: 1038 };
    const PORTRAIT: Rect = Rect { x: 1920, y: 0, w: 1080, h: 1920 };
    const PILL: (i32, i32) = (200, 52);
    const M: i32 = SCREEN_MARGIN;

    /// A 2x laptop whose taskbar takes the bottom 96px.
    fn hidpi() -> Screen {
        let area = Rect { x: 0, y: 0, w: 2880, h: 1800 };
        Screen { name: Some("eDP-1".into()), area, work: Rect { h: 1704, ..area }, scale: 2.0 }
    }

    #[test]
    fn a_drag_never_leaves_the_screen_on_any_side() {
        let one = [LAPTOP];
        assert_eq!(keep_on_screen((-300, 500), PILL, &one, (5, 520)), (M, 500));
        assert_eq!(keep_on_screen((1850, 500), PILL, &one, (1919, 520)), (1920 - 200 - M, 500));
        assert_eq!(keep_on_screen((900, 0), PILL, &one, (950, 43)), (900, 42 + M));
        assert_eq!(keep_on_screen((900, 1070), PILL, &one, (950, 1079)), (900, 1080 - 52 - M));
        // The pointer can leave the screen while the button is held; the window stays put at the edge.
        assert_eq!(keep_on_screen((-5000, -5000), PILL, &one, (-4900, -4900)), (M, 42 + M));
        assert_eq!(keep_on_screen((700, 400), PILL, &one, (750, 420)), (700, 400));
        // The expanded panel near the bottom-right corner is pulled fully back in.
        assert_eq!(keep_on_screen((1700, 700), (440, 620), &one, (1800, 720)), (1920 - 440 - M, 1080 - 620 - M));
    }

    #[test]
    fn a_second_monitor_takes_the_window_but_not_past_its_own_edges() {
        let two = [LAPTOP, PORTRAIT];
        // Crossing onto the portrait monitor moves the window there, wholly on it.
        assert_eq!(keep_on_screen((1900, 600), PILL, &two, (1950, 620)), (1920 + M, 600));
        // The portrait monitor reaches lower than the laptop: fine there...
        assert_eq!(keep_on_screen((2200, 1700), PILL, &two, (2250, 1720)), (2200, 1700));
        // ...but past its right and bottom edges is still clamped.
        assert_eq!(keep_on_screen((2950, 1950), PILL, &two, (3100, 2000)), (3000 - 200 - M, 1920 - 52 - M));
        // Below the laptop, where no monitor is, the nearest screen (the laptop) keeps it.
        assert_eq!(keep_on_screen((800, 1500), PILL, &two, (850, 1500)), (800, 1080 - 52 - M));
    }

    #[test]
    fn the_dock_opens_above_the_taskbar_and_the_panel_grows_out_of_the_pill() {
        let screen = hidpi();
        let pill = dock_home(DockShape::Pill, &screen);
        assert_eq!(pill, Rect { x: 2880 - 400 - 48, y: 1704 - 104 - 24, w: 400, h: 104 });

        let panel = dock_home(DockShape::Panel, &screen);
        assert_eq!((panel.w, panel.h), (880, 1240));
        assert_eq!((panel.right(), panel.bottom()), (pill.right(), pill.bottom()));

        // Expanding the pill in place keeps its bottom-right corner, then opening it again lands home.
        let (grown, growth) = reshape(pill, (panel.w, panel.h), &screen);
        assert_eq!((grown, growth.grow_x, growth.grow_y), (panel, "left", "up"));
    }

    #[test]
    fn a_reshaped_dock_never_spills_off_a_short_screen() {
        // A pill parked top-left on a short screen grows right and down, but only as far as fits.
        let area = Rect { x: 0, y: 0, w: 1366, h: 768 };
        let screen = Screen { name: None, area, work: Rect { h: 728, ..area }, scale: 1.0 };
        let (w, h) = dock_size(DockShape::Panel, &screen);
        assert_eq!((w, h), (440, 620));
        let (grown, growth) = reshape(Rect { x: 20, y: 300, w: 200, h: 52 }, (w, h), &screen);
        assert_eq!((growth.grow_x, growth.grow_y), ("right", "down"));
        assert_eq!(grown, Rect { x: 20, y: 728 - 620 - M, w, h });
    }

    #[test]
    fn the_canvas_comes_back_where_it_was_or_centred_on_the_docks_monitor() {
        let laptop = hidpi();
        let saved = CanvasGeometry { maximized: false, fullscreen: false, rect: Some(Rect { x: 100, y: 80, w: 3200, h: 1600 }), screen: Some("HDMI-1".into()) };
        // Saved on another monitor: centred on this one, shrunk to fit it.
        assert_eq!(canvas_placement(Some(&saved), Some(&laptop)), CanvasPlacement::Restore(Rect { x: 0, y: 100, w: 2880, h: 1600 }));
        // Same monitor: exactly where it was.
        let here = CanvasGeometry { screen: laptop.name.clone(), ..saved.clone() };
        assert_eq!(canvas_placement(Some(&here), Some(&laptop)), CanvasPlacement::Restore(Rect { x: 100, y: 80, w: 3200, h: 1600 }));
        let maximized = CanvasGeometry { maximized: true, ..saved };
        assert_eq!(canvas_placement(Some(&maximized), Some(&laptop)), CanvasPlacement::Maximized { at: Some((0, 0)) });
    }
}
