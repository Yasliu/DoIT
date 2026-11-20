//! The quick-note shortcut, registered with the OS so it works while another app has focus.

use std::sync::Mutex;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use super::Action;

/// The shortcut DoIT holds right now.
static CURRENT: Mutex<Option<Shortcut>> = Mutex::new(None);

/// Makes `keys` (as Settings records them, "Ctrl+Alt+N") the quick-note shortcut, replacing the one
/// held before. Empty turns it off. On failure the previous shortcut stays, and the error says why
/// in words for the Settings screen.
pub fn set_quick_note_shortcut(app: &AppHandle, keys: &str) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    let next = if keys.is_empty() {
        None
    } else {
        Some(accelerator(keys).parse::<Shortcut>().map_err(|_| format!("DoIT can't use {keys} as a shortcut. Try a letter with Ctrl and Alt or Shift."))?)
    };
    let mut current = CURRENT.lock().unwrap_or_else(|e| e.into_inner());
    if *current == next {
        return Ok(());
    }
    if let Some(shortcut) = next {
        shortcuts
            .on_shortcut(shortcut, |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    Action::QuickNote.perform(app);
                }
            })
            .map_err(|_| format!("{keys} is already used by another app. Try different keys."))?;
    }
    if let Some(old) = current.take() {
        let _ = shortcuts.unregister(old);
    }
    *current = next;
    Ok(())
}

/// Settings writes a space as " " (the key's own name); the shortcut parser wants "Space".
fn accelerator(keys: &str) -> String {
    keys.split('+').map(|part| if part == " " { "Space" } else { part }).collect::<Vec<_>>().join("+")
}
