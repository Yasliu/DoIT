//! The quick-note shortcut, registered with the OS so it works while another app has focus.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcut, GlobalShortcutExt, Shortcut, ShortcutState};

use super::Action;

/// The shortcut DoIT holds right now.
static CURRENT: Mutex<Option<Shortcut>> = Mutex::new(None);
/// Why the saved shortcut could not be taken back at startup, until it is set again.
static STARTUP_ERROR: Mutex<Option<String>> = Mutex::new(None);

/// Makes `keys` (as Settings records them, "Ctrl+Alt+N") the quick-note shortcut, replacing the one
/// held before. Empty turns it off. On failure the previous shortcut stays, and the error says why
/// in words for the Settings screen.
pub fn set_quick_note_shortcut(app: &AppHandle, keys: &str) -> Result<(), String> {
    let next = if keys.is_empty() { None } else { Some(parse(keys)?) };
    let mut current = CURRENT.lock().unwrap_or_else(|e| e.into_inner());
    if *current != next {
        // The plugin's listener thread starts only once someone wants a shortcut (on X11 it wakes
        // every 50 ms for as long as it runs).
        if next.is_some() && app.try_state::<GlobalShortcut<Wry>>().is_none() {
            app.plugin(tauri_plugin_global_shortcut::Builder::new().build()).map_err(|e| e.to_string())?;
        }
        if let Some(shortcut) = next {
            app.global_shortcut()
                .on_shortcut(shortcut, |app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        Action::QuickNote.perform(app);
                    }
                })
                .map_err(|_| format!("{keys} is already used by another app. Try different keys."))?;
        }
        if let Some(old) = current.take() {
            let _ = app.global_shortcut().unregister(old);
        }
        *current = next;
    }
    *STARTUP_ERROR.lock().unwrap_or_else(|e| e.into_inner()) = None;
    Ok(())
}

/// Takes the saved shortcut back when DoIT starts. A failure is kept for `startup_error`.
pub fn restore_quick_note_shortcut(app: &AppHandle, keys: &str) {
    if let Err(error) = set_quick_note_shortcut(app, keys) {
        *STARTUP_ERROR.lock().unwrap_or_else(|e| e.into_inner()) = Some(error);
    }
}

/// Why the saved shortcut is not working, if it could not be taken back at startup.
pub fn startup_error() -> Option<String> {
    STARTUP_ERROR.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// The shortcut for `keys`. It must hold two of Ctrl, Alt, Shift and Super: with only one, the OS
/// would take a key every app uses (Shift+N types a capital N, Ctrl+C copies) away from all of them.
fn parse(keys: &str) -> Result<Shortcut, String> {
    let refused = || format!("DoIT can't use {keys} as a shortcut. Use two of Ctrl, Alt and Shift with a letter, like Ctrl+Alt+N.");
    let parts: Vec<&str> = keys.split('+').collect();
    let modifiers = parts[..parts.len().saturating_sub(1)]
        .iter()
        .filter(|part| ["ctrl", "control", "alt", "shift", "super", "meta", "cmd"].contains(&part.to_ascii_lowercase().as_str()))
        .count();
    if modifiers < 2 {
        return Err(refused());
    }
    // Settings writes a space as " " (the key's own name); the shortcut parser wants "Space".
    let accelerator = parts.iter().map(|part| if *part == " " { "Space" } else { part }).collect::<Vec<_>>().join("+");
    accelerator.parse::<Shortcut>().map_err(|_| refused())
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn takes_only_keys_no_app_uses_on_its_own() {
        assert!(parse("Ctrl+Alt+N").is_ok());
        assert!(parse("Ctrl+Shift+ ").is_ok(), "a space as Settings records it");
        for taken in ["Shift+N", "Ctrl+C", "Alt+F4", "N"] {
            assert!(parse(taken).is_err(), "{taken} would be taken from every app");
        }
    }
}
