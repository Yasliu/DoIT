//! DoIT's two shortcuts for use from other apps: quick note, and showing or hiding the dock panel.
//! Where apps can register keys with the OS (Windows, X11) they are registered here. Where they
//! cannot (Wayland) the desktop is asked to run `doit --quick-note` or `doit --toggle-panel`
//! instead, if it can be (GNOME's own shortcut settings).

use std::sync::Mutex;

use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcut, GlobalShortcutExt, Shortcut, ShortcutState};

use super::Action;
use crate::platform;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Slot {
    QuickNote,
    Dock,
}

impl Slot {
    const ALL: [Slot; 2] = [Slot::QuickNote, Slot::Dock];

    fn index(self) -> usize {
        self as usize
    }

    fn action(self) -> Action {
        match self {
            Self::QuickNote => Action::QuickNote,
            Self::Dock => Action::TogglePanel,
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::QuickNote => "doit-quick-note",
            Self::Dock => "doit-dock",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::QuickNote => "DoIT: quick note",
            Self::Dock => "DoIT: show or hide the dock",
        }
    }

    fn flag(self) -> &'static str {
        match self {
            Self::QuickNote => "--quick-note",
            Self::Dock => "--toggle-panel",
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::QuickNote => "quick note",
            Self::Dock => "dock",
        }
    }
}

/// The shortcuts DoIT holds with the OS right now, per slot.
static HELD: Mutex<[Option<Shortcut>; 2]> = Mutex::new([None, None]);
/// Why a saved shortcut could not be taken back at startup, until it is set again.
static STARTUP_ERRORS: Mutex<[Option<String>; 2]> = Mutex::new([None, None]);

/// Makes `keys` (as Settings records them, "Ctrl+Alt+N") the shortcut for `slot`, replacing the one
/// held before. Empty turns it off. `other` is the keys of the other slot, which may not be reused.
/// On failure the previous shortcut stays, and the error says why in words for the Settings screen.
pub fn set_shortcut(app: &AppHandle, slot: Slot, keys: &str, other: &str) -> Result<(), String> {
    let next = if keys.is_empty() { None } else { Some(parse(keys)?) };
    if !keys.is_empty() && keys.eq_ignore_ascii_case(other) {
        let taken = Slot::ALL.into_iter().find(|s| *s != slot).map_or("other", Slot::name);
        return Err(format!("{keys} is already the {taken} shortcut. Try different keys."));
    }
    if platform::global_shortcuts_work() {
        register(app, slot, next, keys)?;
    } else if platform::desktop_shortcuts_work() {
        platform::set_desktop_shortcut(slot.id(), slot.label(), (!keys.is_empty()).then_some(keys), slot.flag())?;
    } else {
        return Err("This desktop doesn't let apps set shortcuts that work from other apps.".to_string());
    }
    STARTUP_ERRORS.lock().unwrap_or_else(|e| e.into_inner())[slot.index()] = None;
    Ok(())
}

fn register(app: &AppHandle, slot: Slot, next: Option<Shortcut>, keys: &str) -> Result<(), String> {
    let mut held = HELD.lock().unwrap_or_else(|e| e.into_inner());
    if held[slot.index()] == next {
        return Ok(());
    }
    // The plugin's listener thread starts only once someone wants a shortcut (on X11 it wakes
    // every 50 ms for as long as it runs).
    if next.is_some() && app.try_state::<GlobalShortcut<Wry>>().is_none() {
        app.plugin(tauri_plugin_global_shortcut::Builder::new().build()).map_err(|e| e.to_string())?;
    }
    if let Some(shortcut) = next {
        app.global_shortcut()
            .on_shortcut(shortcut, move |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    slot.action().perform(app);
                }
            })
            .map_err(|_| format!("{keys} is already used by another app. Try different keys."))?;
    }
    if let Some(old) = held[slot.index()].take() {
        let _ = app.global_shortcut().unregister(old);
    }
    held[slot.index()] = next;
    Ok(())
}

/// Takes the saved shortcuts back when DoIT starts. A failure is kept for `startup_error`. Binding
/// through the desktop runs programs, so it happens off the thread that is starting the app.
pub fn restore_shortcuts(app: &AppHandle, quick_note: &str, dock: &str) {
    let keys = [(Slot::QuickNote, quick_note.to_string(), dock.to_string()), (Slot::Dock, dock.to_string(), quick_note.to_string())];
    let app = app.clone();
    let restore = move || {
        for (slot, keys, other) in keys {
            if let Err(error) = set_shortcut(&app, slot, &keys, &other) {
                STARTUP_ERRORS.lock().unwrap_or_else(|e| e.into_inner())[slot.index()] = Some(error);
            }
        }
    };
    if platform::global_shortcuts_work() {
        restore();
    } else {
        std::thread::spawn(restore);
    }
}

/// Why the saved shortcut for `slot` is not working, if it could not be taken back at startup.
pub fn startup_error(slot: Slot) -> Option<String> {
    STARTUP_ERRORS.lock().unwrap_or_else(|e| e.into_inner())[slot.index()].clone()
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
