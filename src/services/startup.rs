use std::path::Path;

use anyhow::Result;

use crate::services::capture;
use crate::services::sync::{self, StartupMode, StartupSyncReport};

pub fn run_startup(sync_dir: &Path, mode: StartupMode) -> Result<StartupSyncReport> {
    let mut report = sync::startup_sync(sync_dir, mode)?;

    if sync_dir.exists() && matches!(mode, StartupMode::Desktop) {
        match capture::capture_and_sync(sync_dir, None, false) {
            Ok((capture_result, capture_sync)) => {
                report.capture = Some(capture_result);
                report.capture_sync = capture_sync;
            }
            Err(err) => {
                report.capture_error = Some(err.to_string());
            }
        }
    }

    Ok(report)
}
