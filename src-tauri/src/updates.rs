//! Installing an update. The updater plugin finds it, downloads it and checks its signature; the
//! install itself is ours for an rpm, because the plugin runs a plain `rpm -U`, which RPM 6 refuses
//! for our unsigned packages (see `platform::install_rpm`). Every other install is the plugin's.

use std::time::Duration;

use tauri::utils::{config::BundleType, platform::bundle_type};
use tauri_plugin_updater::Update;

/// The whole download, however slow the connection. The update found by the check carries that
/// check's short timeout, which a slow download would outlast.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);

/// Downloads and installs `update`, reporting bytes received so far and the total when known. The
/// last report (received == total) comes once the download is verified, before any password
/// prompt. On Windows a successful install exits the app; the caller restarts it everywhere else.
pub async fn install(update: &Update, mut progress: impl FnMut(u64, Option<u64>)) -> Result<(), String> {
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
        .map_err(|e| e.to_string())?;
    progress(bytes.len() as u64, Some(bytes.len() as u64));
    // The install waits on a password prompt (or the Windows installer): keep it off the async workers.
    tauri::async_runtime::spawn_blocking(move || {
        if bundle_type() == Some(BundleType::Rpm) {
            crate::platform::install_rpm(&bytes)
        } else {
            update.install(&bytes).map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
