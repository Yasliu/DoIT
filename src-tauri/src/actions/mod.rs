//! Mode switches that arrive from outside the UI: a tray-icon click, or a second launch such as
//! `doit --dock` from a desktop shortcut, dock menu or keyboard binding (forwarded to the running
//! instance by the single-instance plugin). Many Linux desktops have no tray, so these flags are
//! how the shell drives DoIT there.

use tauri::AppHandle;

use crate::window::{self, DockOpen};

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
        match self {
            Self::Toggle if window::in_canvas() => window::show_dock(app, DockOpen::default()),
            Self::Toggle | Self::Canvas => window::show_canvas(app),
            Self::Dock => window::show_dock(app, DockOpen::default()),
            Self::Quit => window::quit(app),
        }
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
