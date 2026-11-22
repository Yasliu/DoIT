//! Mode switches that arrive from outside the UI: a tray-icon click, the global shortcuts, or a
//! second launch such as `doit --dock` from a desktop shortcut, dock menu or keyboard binding
//! (forwarded to the running instance by the single-instance plugin). Many Linux desktops have no
//! tray, so these flags are how the shell drives DoIT there.

mod shortcut;

use tauri::{AppHandle, Manager};

pub use shortcut::{restore_shortcuts, set_shortcut, startup_error as shortcut_error, Slot};

use crate::storage::StorageManager;
use crate::window::{self, DockOpen};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Canvas,
    Dock,
    Toggle,
    /// The dock panel on the most recently edited note, or put away if it is already in front.
    QuickNote,
    /// The dock panel opens from the pill, or goes back into it. Nothing while the canvas is showing.
    TogglePanel,
    Quit,
}

impl Action {
    /// The first recognised flag in a process argv (`args[0]` is the binary).
    pub fn from_args(args: &[String]) -> Option<Self> {
        args.iter().skip(1).find_map(|arg| match arg.as_str() {
            "--canvas" => Some(Self::Canvas),
            "--dock" => Some(Self::Dock),
            "--toggle" => Some(Self::Toggle),
            "--quick-note" => Some(Self::QuickNote),
            "--toggle-panel" => Some(Self::TogglePanel),
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
            Self::QuickNote => window::quick_note(app, app.state::<StorageManager>().latest_note_id()),
            Self::TogglePanel => window::toggle_panel(app),
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
        assert_eq!(Action::from_args(&argv(&["--toggle-panel"])), Some(Action::TogglePanel));
    }
}
