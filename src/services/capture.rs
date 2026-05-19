use std::path::Path;

use anyhow::Result;

use crate::storage::capture::{self, CaptureResult};
use crate::storage::git::SyncResult;

pub const CAPTURE_COMMIT_MESSAGE: &str = "auto: capture conversations";

pub fn capture_conversations(
    sync_dir: &Path,
    project_filter: Option<&str>,
    dry_run: bool,
) -> Result<CaptureResult> {
    capture::run_capture(sync_dir, project_filter, dry_run)
}

pub fn capture_and_sync(
    sync_dir: &Path,
    project_filter: Option<&str>,
    dry_run: bool,
) -> Result<(CaptureResult, Option<SyncResult>)> {
    let result = capture_conversations(sync_dir, project_filter, dry_run)?;
    let sync = if !dry_run && capture_changed(&result) {
        Some(crate::services::sync::commit_and_push(
            sync_dir,
            CAPTURE_COMMIT_MESSAGE,
        )?)
    } else {
        None
    };
    Ok((result, sync))
}

pub fn capture_changed(result: &CaptureResult) -> bool {
    result.new_sessions > 0 || result.updated_sessions > 0
}
