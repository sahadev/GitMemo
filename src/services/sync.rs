use std::path::Path;

use anyhow::Result;

use crate::storage::git::{self, SyncResult};

#[derive(Debug, Clone, Copy)]
pub enum StartupMode {
    Cli,
    Mcp,
    Desktop,
}

#[derive(Debug, Default)]
pub struct StartupSyncReport {
    pub cleaned: bool,
    pub pulled: bool,
    pub clean_error: Option<String>,
    pub pull_error: Option<String>,
    pub capture: Option<crate::storage::capture::CaptureResult>,
    pub capture_sync: Option<SyncResult>,
    pub capture_error: Option<String>,
}

pub fn pull_latest(sync_dir: &Path) -> Result<bool> {
    git::pull(sync_dir)
}

pub fn commit_and_push(sync_dir: &Path, message: &str) -> Result<SyncResult> {
    git::commit_and_push(sync_dir, message)
}

pub fn startup_sync(sync_dir: &Path, mode: StartupMode) -> Result<StartupSyncReport> {
    if !sync_dir.exists() {
        return Ok(StartupSyncReport::default());
    }

    let (cleaned, clean_error) = if matches!(mode, StartupMode::Desktop) {
        match git::ensure_repo_clean(sync_dir) {
            Ok(cleaned) => (cleaned, None),
            Err(err) => (false, Some(err.to_string())),
        }
    } else {
        (false, None)
    };

    let (pulled, pull_error) = if git::has_remote(sync_dir) {
        match pull_latest(sync_dir) {
            Ok(true) => (true, None),
            Ok(false) => (
                false,
                Some("pull did not complete; continuing with local data".to_string()),
            ),
            Err(err) => (false, Some(err.to_string())),
        }
    } else {
        (false, None)
    };

    Ok(StartupSyncReport {
        cleaned,
        pulled,
        clean_error,
        pull_error,
        capture: None,
        capture_sync: None,
        capture_error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_sync_missing_dir_is_noop_report() {
        let temp = tempfile::tempdir().unwrap();
        let missing = temp.path().join("missing");

        let report = startup_sync(&missing, StartupMode::Cli).unwrap();

        assert!(!report.cleaned);
        assert!(!report.pulled);
        assert!(report.clean_error.is_none());
        assert!(report.pull_error.is_none());
        assert!(report.capture.is_none());
        assert!(report.capture_sync.is_none());
        assert!(report.capture_error.is_none());
    }

    #[test]
    fn startup_sync_local_only_repo_skips_pull_error() {
        let temp = tempfile::tempdir().unwrap();

        let report = startup_sync(temp.path(), StartupMode::Cli).unwrap();

        assert!(!report.cleaned);
        assert!(!report.pulled);
        assert!(report.clean_error.is_none());
        assert!(report.pull_error.is_none());
    }

    #[test]
    fn startup_sync_remote_pull_failure_is_reported() {
        let temp = tempfile::tempdir().unwrap();
        let metadata_dir = temp.path().join(".metadata");
        std::fs::create_dir_all(&metadata_dir).unwrap();
        std::fs::write(
            metadata_dir.join("config.toml"),
            "[git]\nremote = \"/definitely/missing/gitmemo-remote\"\nbranch = \"main\"\n",
        )
        .unwrap();

        std::process::Command::new("git")
            .args(["init"])
            .current_dir(temp.path())
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args([
                "remote",
                "add",
                "origin",
                "/definitely/missing/gitmemo-remote",
            ])
            .current_dir(temp.path())
            .output()
            .unwrap();

        let report = startup_sync(temp.path(), StartupMode::Cli).unwrap();

        assert!(!report.pulled);
        assert!(report.pull_error.is_some());
    }
}
