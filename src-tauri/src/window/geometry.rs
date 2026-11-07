//! Monitor lookup, tray sizing and placement maths (physical px unless noted).

use tauri::AppHandle;

use super::state::TRAY_POSITION_STATE;
use crate::platform;

pub fn get_window_active_monitor(window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    if let Some(mon) = platform::monitor_of_window(window) {
        return Some(mon);
    }

    if let Ok(Some(mon)) = window.current_monitor() {
        return Some(mon);
    }

    if let (Ok(pos), Ok(sz)) = (window.outer_position(), window.outer_size()) {
        let center_x = pos.x + (sz.width as i32) / 2;
        let center_y = pos.y + (sz.height as i32) / 2;

        if let Ok(monitors) = window.available_monitors() {
            for mon in &monitors {
                let mp = mon.position();
                let ms = mon.size();
                if center_x >= mp.x
                    && center_x < mp.x + (ms.width as i32)
                    && center_y >= mp.y
                    && center_y < mp.y + (ms.height as i32)
                {
                    return Some(mon.clone());
                }
            }

            let mut best_overlap = 0i64;
            let mut best_mon = None;

            for mon in monitors {
                let mp = mon.position();
                let ms = mon.size();

                let x_overlap =
                    (pos.x + sz.width as i32).min(mp.x + ms.width as i32) - pos.x.max(mp.x);
                let y_overlap =
                    (pos.y + sz.height as i32).min(mp.y + ms.height as i32) - pos.y.max(mp.y);

                if x_overlap > 0 && y_overlap > 0 {
                    let overlap = (x_overlap as i64) * (y_overlap as i64);
                    if overlap > best_overlap {
                        best_overlap = overlap;
                        best_mon = Some(mon);
                    }
                }
            }

            if best_mon.is_some() {
                return best_mon;
            }
        }
    }

    window.primary_monitor().ok().flatten()
}

/// Panel size in logical px: roomy by default, but never taller/wider than the screen allows.
pub const TRAY_PANEL_W: f64 = 440.0;
pub const TRAY_PANEL_H: f64 = 620.0;

pub fn tray_panel_logical(monitor: &tauri::Monitor) -> (f64, f64) {
    let scale = monitor.scale_factor();
    let mw = monitor.size().width as f64 / scale;
    let mh = monitor.size().height as f64 / scale;
    (TRAY_PANEL_W.min(mw * 0.9), TRAY_PANEL_H.min(mh * 0.88))
}

pub fn position_tray_on_monitor(
    window: &tauri::WebviewWindow,
    monitor: &tauri::Monitor,
    expanded: bool,
) {
    let scale_factor = monitor.scale_factor();
    let m_pos = monitor.position(); // PhysicalPosition<i32> { x, y }

    let small_w_phys = (200.0 * scale_factor).round() as i32;
    let small_h_phys = (52.0 * scale_factor).round() as i32;
    let (panel_w, panel_h) = tray_panel_logical(monitor);
    let expanded_w_phys = (panel_w * scale_factor).round() as i32;
    let expanded_h_phys = (panel_h * scale_factor).round() as i32;

    let margin_x = (24.0 * scale_factor).round() as i32;
    let margin_y = (12.0 * scale_factor).round() as i32;

    let (work_l, work_t, work_r, work_b) = platform::work_area(monitor);

    let min_offset_x = (work_l - m_pos.x) + 8;
    let min_offset_y = (work_t - m_pos.y) + 8;
    let max_small_offset_x = (work_r - m_pos.x - small_w_phys - 8).max(min_offset_x);
    let max_small_offset_y = (work_b - m_pos.y - small_h_phys - 8).max(min_offset_y);

    let max_expanded_offset_x = (work_r - m_pos.x - expanded_w_phys - 8).max(min_offset_x);
    let max_expanded_offset_y = (work_b - m_pos.y - expanded_h_phys - 8).max(min_offset_y);

    let default_pill_offset_x = (work_r - m_pos.x - small_w_phys - margin_x).clamp(min_offset_x, max_small_offset_x);
    let default_pill_offset_y = (work_b - m_pos.y - small_h_phys - margin_y).clamp(min_offset_y, max_small_offset_y);

    let mut mem = TRAY_POSITION_STATE.lock().unwrap();

    let pill_offset = mem.pill_offset.unwrap_or(tauri::PhysicalPosition::new(default_pill_offset_x, default_pill_offset_y));
    let clamped_pill_x = pill_offset.x.clamp(min_offset_x, max_small_offset_x);
    let clamped_pill_y = pill_offset.y.clamp(min_offset_y, max_small_offset_y);
    let active_pill_offset = tauri::PhysicalPosition::new(clamped_pill_x, clamped_pill_y);
    mem.pill_offset = Some(active_pill_offset);
    mem.last_monitor_name = monitor.name().cloned();

    if expanded {
        let expanded_offset = if let Some(exp) = mem.expanded_offset {
            tauri::PhysicalPosition::new(
                exp.x.clamp(min_offset_x, max_expanded_offset_x),
                exp.y.clamp(min_offset_y, max_expanded_offset_y),
            )
        } else {
            // Anchor expanded tray adjacent to the pill
            let target_x = if active_pill_offset.x + expanded_w_phys > max_expanded_offset_x {
                (active_pill_offset.x + small_w_phys - expanded_w_phys).clamp(min_offset_x, max_expanded_offset_x)
            } else {
                active_pill_offset.x.clamp(min_offset_x, max_expanded_offset_x)
            };
            let target_y = if active_pill_offset.y + expanded_h_phys > max_expanded_offset_y {
                (active_pill_offset.y + small_h_phys - expanded_h_phys).clamp(min_offset_y, max_expanded_offset_y)
            } else {
                active_pill_offset.y.clamp(min_offset_y, max_expanded_offset_y)
            };
            tauri::PhysicalPosition::new(target_x, target_y)
        };

        mem.expanded_offset = Some(expanded_offset);
        drop(mem);

        let final_x = m_pos.x + expanded_offset.x;
        let final_y = m_pos.y + expanded_offset.y;

        platform::set_window_bounds(window, final_x, final_y, expanded_w_phys as u32, expanded_h_phys as u32);
    } else {
        drop(mem);

        let final_x = m_pos.x + active_pill_offset.x;
        let final_y = m_pos.y + active_pill_offset.y;

        platform::set_window_bounds(window, final_x, final_y, small_w_phys as u32, small_h_phys as u32);
    }
}

/// Gap kept between the dock window and the edge of the usable screen area (physical px).
pub const SCREEN_MARGIN: i32 = 8;

/// A screen rectangle in physical px.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    fn contains(&self, (px, py): (i32, i32)) -> bool {
        px >= self.x && px < self.x + self.w && py >= self.y && py < self.y + self.h
    }

    fn distance_sq(&self, (px, py): (i32, i32)) -> i64 {
        let dx = (self.x - px).max(px - (self.x + self.w - 1)).max(0) as i64;
        let dy = (self.y - py).max(py - (self.y + self.h - 1)).max(0) as i64;
        dx * dx + dy * dy
    }
}

/// Where a window of `size` that wants its top-left at `wanted` may go: wholly inside the usable
/// area (`screens`, one per monitor) of the monitor under `pointer`, or the monitor nearest to it
/// when the pointer is off every screen. Dragging therefore carries the window onto another
/// monitor, but never past the outer edge of the combined screen area.
pub fn keep_on_screen(wanted: (i32, i32), size: (i32, i32), screens: &[Rect], pointer: (i32, i32)) -> (i32, i32) {
    let Some(screen) = screens
        .iter()
        .find(|s| s.contains(pointer))
        .or_else(|| screens.iter().min_by_key(|s| s.distance_sq(pointer)))
    else {
        return wanted;
    };
    let min_x = screen.x + SCREEN_MARGIN;
    let min_y = screen.y + SCREEN_MARGIN;
    let max_x = (screen.x + screen.w - size.0 - SCREEN_MARGIN).max(min_x);
    let max_y = (screen.y + screen.h - size.1 - SCREEN_MARGIN).max(min_y);
    (wanted.0.clamp(min_x, max_x), wanted.1.clamp(min_y, max_y))
}

/// The usable area of every connected monitor.
pub fn screen_work_areas(window: &tauri::WebviewWindow) -> Vec<Rect> {
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let (l, t, r, b) = platform::work_area(m);
            Rect { x: l, y: t, w: r - l, h: b - t }
        })
        .collect()
}

pub fn clamp_to_monitor(
    window: &tauri::WebviewWindow,
    app: &AppHandle,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
) -> (i32, i32) {
    if let Some(mon) = get_window_active_monitor(window).or_else(|| app.primary_monitor().ok().flatten()) {
        let (work_l, work_t, work_r, work_b) = platform::work_area(&mon);
        let min_x = work_l + 8;
        let min_y = work_t + 8;
        let max_x = (work_r - w - 8).max(min_x);
        let max_y = (work_b - h - 8).max(min_y);
        (x.clamp(min_x, max_x), y.clamp(min_y, max_y))
    } else {
        (x, y)
    }
}

#[cfg(test)]
mod tests {
    use super::{keep_on_screen, Rect, SCREEN_MARGIN as M};

    // A 1920x1080 laptop with a 42px top bar, and a taller 1080x1920 portrait monitor to its right.
    const LAPTOP: Rect = Rect { x: 0, y: 42, w: 1920, h: 1038 };
    const PORTRAIT: Rect = Rect { x: 1920, y: 0, w: 1080, h: 1920 };
    const PILL: (i32, i32) = (200, 52);

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
}
