//! The dock's pill, drawn natively. While DoIT sits in the dock as a pill, no webview runs at all:
//! the pill is a plain window whose pixels `art` draws and whose OS adapter (`platform::attach_pill`
//! / `present_pill`) shows them and reports the pointer.
//!
//! One thread owns the pill's state (hover, press, drag, zoom animation). A click opens the panel,
//! a drag moves the pill (never off screen), the secondary button opens its menu.

mod art;

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, Window};

pub use art::PillLook;

use super::placement::Rect;
use crate::platform::{self, PillInput};

const LABEL: &str = "pill";
/// Pointer travel (logical px) that turns a press into a drag.
const DRAG_THRESHOLD: f64 = 4.0;
const FRAME: Duration = Duration::from_millis(16);
const HOVER_ZOOM: f32 = 1.055;
const PRESS_ZOOM: f32 = 0.96;

/// What the pill asks of the rest of the window engine.
pub struct Actions {
    pub open_panel: fn(&AppHandle),
    pub begin_drag: fn(&Window, (f64, f64)) -> bool,
    pub end_drag: fn(&AppHandle),
    pub open_menu: fn(&AppHandle, &Window),
}

enum Msg {
    Input(PillInput),
    Redraw,
    /// The window is being given this size (physical px); draw frames for it.
    Size(u32, u32),
}

static LOOK: Mutex<Option<PillLook>> = Mutex::new(None);
static WORKER: Mutex<Option<Sender<Msg>>> = Mutex::new(None);

fn send(msg: Msg) {
    if let Some(worker) = WORKER.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        let _ = worker.send(msg);
    }
}

/// Uses the look the page measured from its CSS from now on.
pub fn set_look(look: PillLook) {
    *LOOK.lock().unwrap_or_else(|e| e.into_inner()) = Some(look);
    send(Msg::Redraw);
}

pub fn window(app: &AppHandle) -> Option<Window> {
    app.get_window(LABEL)
}

/// Shows the pill at `rect` (physical px), building its window on first use.
pub fn show(app: &AppHandle, rect: Rect, actions: Actions) -> Result<(), String> {
    let window = match window(app) {
        Some(existing) => existing,
        None => build(app, actions)?,
    };
    platform::set_window_bounds(&window, rect.x, rect.y, rect.w as u32, rect.h as u32);
    send(Msg::Size(rect.w as u32, rect.h as u32));
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    platform::keep_wm_from_moving(&window);
    // Showing can reset the surface on some systems; the frame after it is the one that counts.
    send(Msg::Redraw);
    Ok(())
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = window(app) {
        let _ = window.hide();
    }
}

/// Destroys the pill window and stops its thread.
pub fn close(app: &AppHandle) {
    WORKER.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(window) = window(app) {
        let _ = window.destroy();
    }
}

pub fn is_visible(app: &AppHandle) -> bool {
    window(app).is_some_and(|w| w.is_visible().unwrap_or(false))
}

fn build(app: &AppHandle, actions: Actions) -> Result<Window, String> {
    let window = tauri::window::WindowBuilder::new(app, LABEL)
        .title("DoIT")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .resizable(platform::DOCK_WINDOW_RESIZABLE)
        .skip_taskbar(platform::TRAY_SKIPS_TASKBAR)
        .inner_size(super::placement::PILL_SIZE.0, super::placement::PILL_SIZE.1)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    let (tx, rx) = mpsc::channel();
    let input = tx.clone();
    platform::attach_pill(&window, Box::new(move |event| {
        let _ = input.send(Msg::Input(event));
    }));
    *WORKER.lock().unwrap_or_else(|e| e.into_inner()) = Some(tx);
    let (app, target) = (app.clone(), window.clone());
    std::thread::Builder::new()
        .name("doit-pill".into())
        .spawn(move || Pill::new(app, target, actions).run(rx))
        .map_err(|e| e.to_string())?;
    Ok(window)
}

struct Pill {
    app: AppHandle,
    window: Window,
    actions: Actions,
    hovered: bool,
    pressed: Option<(f64, f64)>,
    /// `Some(true)` while the app runs the drag (ends on release), `Some(false)` while the OS does.
    dragging: Option<bool>,
    zoom: f32,
    size: Option<(u32, u32)>,
}

impl Pill {
    fn new(app: AppHandle, window: Window, actions: Actions) -> Self {
        Self { app, window, actions, hovered: false, pressed: None, dragging: None, zoom: 1.0, size: None }
    }

    fn run(mut self, rx: Receiver<Msg>) {
        let mut dirty = true;
        loop {
            let animating = (self.zoom - self.target_zoom()).abs() > 0.001;
            let msg = if animating || dirty {
                match rx.recv_timeout(FRAME) {
                    Ok(msg) => Some(msg),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            } else {
                match rx.recv() {
                    Ok(msg) => Some(msg),
                    Err(_) => return,
                }
            };
            match msg {
                Some(Msg::Input(input)) => self.handle(input),
                Some(Msg::Redraw) => dirty = true,
                Some(Msg::Size(w, h)) => {
                    self.size = Some((w.max(1), h.max(1)));
                    dirty = true;
                }
                None => {}
            }
            let target = self.target_zoom();
            if (self.zoom - target).abs() > 0.001 {
                // Eases most of the way each frame: a quick, springy settle without overshoot.
                self.zoom += (target - self.zoom) * 0.35;
                dirty = true;
            } else if self.zoom != target {
                self.zoom = target;
                dirty = true;
            }
            if dirty {
                self.draw();
                dirty = false;
            }
        }
    }

    fn target_zoom(&self) -> f32 {
        match (self.pressed, self.dragging, self.hovered) {
            (Some(_), None, _) => PRESS_ZOOM,
            (_, None, true) => HOVER_ZOOM,
            _ => 1.0,
        }
    }

    fn handle(&mut self, input: PillInput) {
        match input {
            PillInput::Enter => self.hovered = true,
            PillInput::Leave => {
                if self.dragging.is_none() {
                    self.hovered = false;
                }
            }
            PillInput::Press(x, y) => {
                self.pressed = Some((x, y));
                self.dragging = None;
            }
            PillInput::Move(x, y) => {
                let Some((px, py)) = self.pressed else { return };
                if self.dragging.is_none() && ((x - px).powi(2) + (y - py).powi(2)).sqrt() > DRAG_THRESHOLD {
                    self.hovered = false;
                    self.dragging = Some((self.actions.begin_drag)(&self.window, (px, py)));
                }
            }
            PillInput::Release(..) => {
                let was_pressed = self.pressed.take().is_some();
                match self.dragging.take() {
                    Some(_) => (self.actions.end_drag)(&self.app),
                    None if was_pressed => {
                        self.hovered = false;
                        let open_panel = self.actions.open_panel;
                        let app = self.app.clone();
                        std::thread::spawn(move || open_panel(&app));
                    }
                    None => {}
                }
            }
            PillInput::Menu => (self.actions.open_menu)(&self.app, &self.window),
        }
    }

    fn draw(&self) {
        let look = LOOK.lock().unwrap_or_else(|e| e.into_inner()).clone().unwrap_or_default();
        let size = match self.size {
            Some(size) => size,
            None => match self.window.inner_size() {
                Ok(size) => (size.width.max(1), size.height.max(1)),
                Err(_) => return,
            },
        };
        let scale = self.window.scale_factor().unwrap_or(1.0) as f32;
        if let Some(frame) = art::render(&look, size, scale, self.zoom) {
            platform::present_pill(&self.window, frame);
        }
    }
}
