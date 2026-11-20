//! Installing an update. The updater plugin finds it, downloads it and checks its signature; the
//! install itself is ours for an rpm, because the plugin runs a plain `rpm -U`, which RPM 6 refuses
//! for our unsigned packages (see `platform::install_rpm`). Every other install is the plugin's.

use std::time::Duration;

use tauri::utils::{config::BundleType, platform::bundle_type};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Downloads and installs the newest release, reporting bytes received so far and the total when
/// known. `false` when there is nothing newer. On Windows a successful install exits the app; the
/// caller restarts it everywhere else.
pub async fn install_latest(app: &AppHandle, mut progress: impl FnMut(u64, Option<u64>)) -> Result<bool, String> {
    let updater = app.updater_builder().timeout(Duration::from_secs(120)).build().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(false);
    };
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
    if bundle_type() == Some(BundleType::Rpm) {
        crate::platform::install_rpm(&bytes)?;
    } else {
        update.install(&bytes).map_err(|e| e.to_string())?;
    }
    Ok(true)
}
