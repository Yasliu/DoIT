//! Updating DoIT in two steps, so the restart is the only disruptive moment: `download` fetches and
//! verifies the update the page's check found and keeps it here; `install` installs what was kept.
//! The download outlives the page that asked for it (the canvas page is rebuilt after time in the
//! dock), so a page can find it again with `downloaded_version`.
//! The updater plugin finds, downloads and verifies the update; the install itself is ours for an
//! rpm, because the plugin runs a plain `rpm -U`, which RPM 6 refuses for our unsigned packages (see
//! `platform::install_rpm`). Every other install is the plugin's.

use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::async_runtime::Mutex as AsyncMutex;
use tauri::utils::{config::BundleType, platform::bundle_type};
use tauri_plugin_updater::Update;

/// The whole download, however slow the connection. The update found by the check carries that
/// check's short timeout, which a slow download would outlast.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);

/// A verified download waiting for `install`.
struct Downloaded {
    update: Update,
    bytes: Vec<u8>,
}

static DOWNLOADED: Mutex<Option<Downloaded>> = Mutex::new(None);

fn downloaded() -> std::sync::MutexGuard<'static, Option<Downloaded>> {
    DOWNLOADED.lock().unwrap_or_else(|e| e.into_inner())
}

/// One download at a time: a second request (from a rebuilt page) waits for the first.
fn one_at_a_time() -> &'static AsyncMutex<()> {
    static LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| AsyncMutex::new(()))
}

/// The version of the download waiting for `install`, if any.
pub fn downloaded_version() -> Option<String> {
    downloaded().as_ref().map(|kept| kept.update.version.clone())
}

/// Downloads and verifies `update` and keeps it for `install`, reporting bytes received so far and
/// the total when known. Already kept (or being fetched for another page), it is not fetched again.
pub async fn download(update: &Update, mut progress: impl FnMut(u64, Option<u64>)) -> Result<(), String> {
    let _turn = one_at_a_time().lock().await;
    if downloaded_version().as_deref() == Some(update.version.as_str()) {
        return Ok(());
    }
    let mut update = update.clone();
    update.timeout = Some(DOWNLOAD_TIMEOUT);
    let mut received = 0u64;
    let bytes = update
        .download(
            |chunk, total| {
                received += chunk as u64;
                progress(received, total);
            },
            || {},
        )
        .await
        .map_err(|e| format!("The download failed ({e}). Try again in a moment."))?;
    *downloaded() = Some(Downloaded { update, bytes });
    Ok(())
}

/// Installs the update `download` kept, if it is `version` (the one the page offered). This is
/// where a password prompt or the Windows installer appears; on Windows a successful install exits
/// the app, elsewhere the caller restarts it. A failed install keeps the download, so trying again
/// does not fetch it again.
pub async fn install(version: &str) -> Result<(), String> {
    let kept = {
        let mut kept = downloaded();
        if kept.as_ref().map(|k| k.update.version.as_str()) != Some(version) {
            return Err(format!("DoIT {version} isn't downloaded yet. Check for updates again."));
        }
        kept.take().expect("checked above")
    };
    // The install waits on a password prompt (or the Windows installer): keep it off the async workers.
    let (kept, result) = tauri::async_runtime::spawn_blocking(move || {
        let result = if bundle_type() == Some(BundleType::Rpm) {
            crate::platform::install_rpm(&kept.bytes)
        } else {
            kept.update
                .install(&kept.bytes)
                .map_err(|e| format!("DoIT couldn't install the update ({e}). Try again, or install it from the release page."))
        };
        (kept, result)
    })
    .await
    .map_err(|e| e.to_string())?;
    if result.is_err() {
        downloaded().get_or_insert(kept);
    }
    result
}
