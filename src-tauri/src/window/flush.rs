//! Asks pages to hand over the edits they are still holding, and waits for each page's answer, so
//! a page is never destroyed (or the app quit) with typed text still sitting in a debounce timer.

use std::collections::HashSet;
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

/// Long enough for a page to save its largest note; only a hung page ever waits this out.
const PATIENCE: Duration = Duration::from_millis(600);

#[derive(Default)]
struct Waiting {
    pages: Mutex<HashSet<String>>,
    answered: Condvar,
}

impl Waiting {
    fn expect(&self, label: &str) {
        self.pages.lock().unwrap_or_else(|e| e.into_inner()).insert(label.to_string());
    }

    fn answer(&self, label: &str) {
        self.pages.lock().unwrap_or_else(|e| e.into_inner()).remove(label);
        self.answered.notify_all();
    }

    /// `true` once every expected page answered, `false` if `patience` ran out first.
    fn wait(&self, patience: Duration) -> bool {
        let deadline = Instant::now() + patience;
        let mut pages = self.pages.lock().unwrap_or_else(|e| e.into_inner());
        while !pages.is_empty() {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                pages.clear();
                return false;
            }
            pages = self.answered.wait_timeout(pages, left).unwrap_or_else(|e| e.into_inner()).0;
        }
        true
    }
}

static WAITING: std::sync::LazyLock<Waiting> = std::sync::LazyLock::new(Waiting::default);

/// Blocks until the named pages (those that exist) have saved what they hold. Never call this on
/// the main thread: the pages' answers and saves are handled there.
pub fn pages(app: &AppHandle, labels: &[&str]) {
    let live: Vec<&str> = labels.iter().copied().filter(|label| app.get_webview_window(label).is_some()).collect();
    for label in &live {
        WAITING.expect(label);
    }
    for label in &live {
        if app.emit_to(*label, "flush-pending", ()).is_err() {
            WAITING.answer(label);
        }
    }
    WAITING.wait(PATIENCE);
}

/// A page reports that everything it held has been saved.
pub fn answered(label: &str) {
    WAITING.answer(label);
}

#[cfg(test)]
mod tests {
    use super::Waiting;
    use std::time::Duration;

    #[test]
    fn waits_for_every_page_and_gives_up_on_a_silent_one() {
        let waiting = Waiting::default();
        waiting.expect("main");
        waiting.expect("tray");
        waiting.answer("main");
        waiting.answer("tray");
        assert!(waiting.wait(Duration::from_secs(30)));

        waiting.expect("main");
        assert!(!waiting.wait(Duration::ZERO));
        assert!(waiting.wait(Duration::ZERO), "a page that never answered must not hold up the next flush");
    }
}
