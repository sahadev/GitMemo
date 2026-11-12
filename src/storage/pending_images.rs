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

use anyhow::{Context, Result};
use fs4::fs_std::FileExt;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};

const REGISTRY_FILE: &str = "pending_sync_images.json";
const REGISTRY_LOCK_FILE: &str = "pending_sync_images.lock";

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
/// A registry that was never written means "nothing is pending". A registry that
/// exists but cannot be read or parsed is an error: git callers must abort the
/// commit instead of staging everything (see [`list_checked`]).
pub fn list_checked(repo_path: &Path) -> Result<Vec<String>> {
    let path = registry_path(repo_path);
    let content = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => {
            return Err(anyhow::Error::new(e)
                .context(format!("could not read {}", path.display())))
        }
    };
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    let registry: Registry = serde_json::from_str(&content)
        .with_context(|| format!("could not parse {}", path.display()))?;
    let mut paths: Vec<String> = registry
        .paths
        .iter()
        .map(|p| normalize(p))
        .filter(|p| !p.is_empty())
        .collect();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

/// Repo-relative paths currently waiting for a manual image sync.
///
/// Best-effort variant for display code: an unreadable registry is logged and
/// treated as empty. Commit paths must use [`list_checked`] so a damaged
/// registry can never turn into a full staging run.
pub fn list(repo_path: &Path) -> Vec<String> {
    match list_checked(repo_path) {
        Ok(paths) => paths,
        Err(e) => {
            eprintln!(
                "[gitmemo] Pending image registry is unreadable ({}); treating as empty.",
                e
            );
            Vec::new()
        }
    }
}

/// Whether `rel` is still waiting for a manual image sync.
pub fn contains(repo_path: &Path, rel: &str) -> bool {
    let target = normalize(rel);
    list(repo_path).iter().any(|p| p == &target)
}

struct RegistryGuard {
    _file: std::fs::File,
}

/// Serialize registry mutations across threads and processes. Without it two
/// background commits can interleave read-modify-write cycles and silently drop
/// entries, which is what let images slip into git unnoticed.
fn acquire_registry_lock(repo_path: &Path) -> Option<RegistryGuard> {
    let path = repo_path.join(".metadata").join(REGISTRY_LOCK_FILE);
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&path)
        .ok()?;
    file.lock_exclusive().ok()?;
    Some(RegistryGuard { _file: file })
}

fn with_registry_lock<T>(repo_path: &Path, f: impl FnOnce() -> Result<T>) -> Result<T> {
    match acquire_registry_lock(repo_path) {
        Some(guard) => {
            let result = f();
            drop(guard);
            result
        }
        None => {
            eprintln!(
                "[gitmemo] Warning: could not lock .metadata/{REGISTRY_LOCK_FILE}; \
                 pending image updates may race with other processes."
            );
            f()
        }
    }
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
    let body = serde_json::to_string_pretty(&registry)?;
    // Rename from a sibling temp file so a concurrent reader can never observe a
    // half-written registry.
    let tmp = path.with_file_name(format!(".{REGISTRY_FILE}.tmp"));
    std::fs::write(&tmp, body)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// Mark paths as waiting for a manual sync.
pub fn add(repo_path: &Path, paths: &[&str]) -> Result<()> {
    with_registry_lock(repo_path, || {
        let mut current = list_checked(repo_path)?;
        for rel in paths {
            let rel = normalize(rel);
            if !rel.is_empty() && !current.iter().any(|p| p == &rel) {
                current.push(rel);
            }
        }
        persist(repo_path, &current)
    })
}

/// Drop paths from the registry, e.g. after their commit succeeded.
pub fn remove(repo_path: &Path, paths: &[&str]) -> Result<()> {
    with_registry_lock(repo_path, || {
        let removed: Vec<String> = paths.iter().map(|p| normalize(p)).collect();
        let current: Vec<String> = list_checked(repo_path)?
            .into_iter()
            .filter(|p| !removed.iter().any(|r| r == p))
            .collect();
        persist(repo_path, &current)
    })
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

    #[test]
    fn corrupt_registry_is_an_error_when_checked() {
        let dir = repo();
        let root = dir.path();
        std::fs::write(registry_path(root), "{ not json").unwrap();
        // Commit paths use this variant: a damaged registry must never look
        // like "nothing is pending".
        assert!(list_checked(root).is_err());
    }
}
