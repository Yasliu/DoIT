//! Mode switches that arrive from outside the UI: a tray-icon click, or a second launch such as
//! `doit --dock` from a desktop shortcut, dock menu or keyboard binding (forwarded to the running
//! instance by the single-instance plugin). Many Linux desktops have no tray, so these flags are
//! how the shell drives DoIT there.

use tauri::{AppHandle, Manager};

use crate::commands::window::{open_canvas_mode, open_tray_mode, quit_app};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Canvas,
    Dock,
    Toggle,
    Quit,
}

impl Action {
    /// The first recognised flag in a process argv (`args[0]` is the binary).
    pub fn from_args(args: &[String]) -> Option<Self> {
        args.iter().skip(1).find_map(|arg| match arg.as_str() {
            "--canvas" => Some(Self::Canvas),
            "--dock" => Some(Self::Dock),
            "--toggle" => Some(Self::Toggle),
            "--quit" => Some(Self::Quit),
            _ => None,
        })
    }

    /// Idempotent: asking for the mode you are already in just brings that window forward.
    pub fn perform(self, app: &AppHandle) {
        let in_canvas = canvas_visible(app);
        match self {
            Self::Toggle if in_canvas => Self::Dock.perform(app),
            Self::Toggle => Self::Canvas.perform(app),
            Self::Canvas if in_canvas => focus(app, "main"),
            Self::Canvas => {
                let _ = open_canvas_mode(app.clone());
            }
            Self::Dock if !in_canvas && app.get_webview_window("tray").is_some() => focus(app, "tray"),
            Self::Dock => {
                let _ = open_tray_mode(app.clone(), None, None);
            }
            Self::Quit => quit_app(app.clone()),
        }
    }
}

fn canvas_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

fn focus(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        crate::platform::focus_window(&window);
    }
}

#[cfg(test)]
mod tests {
    use super::Action;

    fn argv(flags: &[&str]) -> Vec<String> {
        std::iter::once("doit").chain(flags.iter().copied()).map(String::from).collect()
    }

    #[test]
    fn reads_the_first_known_flag_and_ignores_files_and_the_binary_name() {
        assert_eq!(Action::from_args(&argv(&["notes.md", "--dock", "--quit"])), Some(Action::Dock));
        assert_eq!(Action::from_args(&argv(&["notes.md"])), None);
        assert_eq!(Action::from_args(&["--quit".to_string()]), None);
    }
}
