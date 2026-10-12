//! Local-only registry of clipboard images that are not committed yet.
//!
//! When automatic committing of clipboard images is disabled the captured
//! screenshot still lands in the working tree so it can be reviewed and synced
//! on demand from its detail page. Until that manual sync happens the image and
//! its companion `.md` stay listed here, and every commit path strips them from
//! the staging area so they cannot ride along with an unrelated commit.
//!
//! The registry lives in `.metadata/`, which is git-ignored: it is device-local
//! state, exactly like the images it tracks.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const REGISTRY_FILE: &str = "pending_sync_images.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct Registry {
    #[serde(default)]
    paths: Vec<String>,
}

/// Normalize a repository-relative path to the form stored in the registry.
pub fn normalize(rel: &str) -> String {
    rel.trim()
        .trim_start_matches("./")
        .trim_start_matches('/')
        .replace('\\', "/")
}

fn registry_path(repo_path: &Path) -> PathBuf {
    repo_path.join(".metadata").join(REGISTRY_FILE)
}

/// Repo-relative paths currently waiting for a manual image sync.
///
/// A missing or unreadable registry simply means "nothing is pending"; the
/// caller must never fail a commit because of it.
pub fn list(repo_path: &Path) -> Vec<String> {
    let Ok(content) = std::fs::read_to_string(registry_path(repo_path)) else {
        return Vec::new();
    };
    let Ok(registry) = serde_json::from_str::<Registry>(&content) else {
        return Vec::new();
    };
    let mut paths: Vec<String> = registry
        .paths
        .iter()
        .map(|p| normalize(p))
        .filter(|p| !p.is_empty())
        .collect();
    paths.sort();
    paths.dedup();
    paths
}

/// Whether `rel` is still waiting for a manual image sync.
pub fn contains(repo_path: &Path, rel: &str) -> bool {
    let target = normalize(rel);
    list(repo_path).iter().any(|p| p == &target)
}

fn persist(repo_path: &Path, paths: &[String]) -> Result<()> {
    let path = registry_path(repo_path);
    if paths.is_empty() {
        // An empty registry only adds noise to `.metadata/`.
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let registry = Registry {
        paths: paths.to_vec(),
    };
    std::fs::write(&path, serde_json::to_string_pretty(&registry)?)?;
    Ok(())
}

/// Mark paths as waiting for a manual sync.
pub fn add(repo_path: &Path, paths: &[&str]) -> Result<()> {
    let mut current = list(repo_path);
    for rel in paths {
        let rel = normalize(rel);
        if !rel.is_empty() && !current.iter().any(|p| p == &rel) {
            current.push(rel);
        }
    }
    persist(repo_path, &current)
}

/// Drop paths from the registry, e.g. after their commit succeeded.
pub fn remove(repo_path: &Path, paths: &[&str]) -> Result<()> {
    let removed: Vec<String> = paths.iter().map(|p| normalize(p)).collect();
    let current: Vec<String> = list(repo_path)
        .into_iter()
        .filter(|p| !removed.iter().any(|r| r == p))
        .collect();
    persist(repo_path, &current)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".metadata")).unwrap();
        dir
    }

    #[test]
    fn list_is_empty_without_registry() {
        assert!(list(repo().path()).is_empty());
    }

    #[test]
    fn add_and_remove_roundtrip() {
        let dir = repo();
        let root = dir.path();
        add(root, &["clips/a/x.png", "clips/a/x.md"]).unwrap();
        assert!(contains(root, "clips/a/x.png"));
        assert!(contains(root, "clips/a/x.md"));

        remove(root, &["clips/a/x.png", "clips/a/x.md"]).unwrap();
        assert!(list(root).is_empty());
        assert!(!registry_path(root).exists());
    }

    #[test]
    fn add_is_idempotent_and_normalizes_separators() {
        let dir = repo();
        let root = dir.path();
        add(root, &["clips/a/x.png"]).unwrap();
        add(root, &["./clips/a/x.png"]).unwrap();
        add(root, &["clips\\a\\x.png"]).unwrap();
        assert_eq!(list(root), vec!["clips/a/x.png".to_string()]);
    }

    #[test]
    fn remove_of_unknown_path_keeps_others() {
        let dir = repo();
        let root = dir.path();
        add(root, &["clips/a/x.png", "clips/b/y.png"]).unwrap();
        remove(root, &["clips/missing.png"]).unwrap();
        assert_eq!(
            list(root),
            vec!["clips/a/x.png".to_string(), "clips/b/y.png".to_string()]
        );
    }

    #[test]
    fn corrupt_registry_is_treated_as_empty() {
        let dir = repo();
        let root = dir.path();
        std::fs::write(registry_path(root), "{ not json").unwrap();
        assert!(list(root).is_empty());
    }
}
