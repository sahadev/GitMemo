use anyhow::Result;
use std::path::Path;

/// Result of a commit_and_push operation
#[derive(Debug)]
pub struct SyncResult {
    /// Whether a new commit was created
    pub committed: bool,
    /// Whether push succeeded
    pub pushed: bool,
    /// Push error message if failed
    pub push_error: Option<String>,
}

impl SyncResult {
    pub fn nothing() -> Self {
        Self { committed: false, pushed: false, push_error: None }
    }
}

/// Initialize or open Git repository at the given path
pub fn init_repo(repo_path: &Path, remote_url: &str) -> Result<git2::Repository> {
    let repo = if repo_path.join(".git").exists() {
        // Open existing repo
        let repo = git2::Repository::open(repo_path)?;
        // Update remote URL if different
        if let Ok(remote) = repo.find_remote("origin") {
            if remote.url().unwrap_or("") != remote_url {
                drop(remote);
                repo.remote_set_url("origin", remote_url)?;
            }
        } else {
            repo.remote("origin", remote_url)?;
        }
        repo
    } else {
        // Create new repo
        let repo = git2::Repository::init(repo_path)?;
        repo.remote("origin", remote_url)?;
        repo
    };

    Ok(repo)
}

/// Stage all changes, commit, and push. Returns sync result.
pub fn commit_and_push(repo_path: &Path, message: &str) -> Result<SyncResult> {
    let repo = git2::Repository::open(repo_path)?;

    // Stage all
    let mut index = repo.index()?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;

    // Check if there's anything to commit
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;

    let sig = git2::Signature::now("GitMemo", "bot@gitmemo.dev")?;

    let committed = if let Ok(head) = repo.head() {
        let parent = head.peel_to_commit()?;
        // Skip if tree unchanged
        if parent.tree()?.id() == tree_id {
            return Ok(SyncResult::nothing());
        }
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])?;
        true
    } else {
        // Initial commit
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[])?;
        true
    };

    // Push using system git (handles SSH auth via ssh-agent / system keychain)
    let output = std::process::Command::new("git")
        .args(["push", "origin", "HEAD"])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    let (pushed, push_error) = match output {
        Ok(o) if o.status.success() => (true, None),
        Ok(o) => (false, Some(String::from_utf8_lossy(&o.stderr).trim().to_string())),
        Err(e) => (false, Some(e.to_string())),
    };

    Ok(SyncResult { committed, pushed, push_error })
}

/// Count unpushed commits (local HEAD ahead of origin)
pub fn unpushed_count(repo_path: &Path) -> Result<usize> {
    let output = std::process::Command::new("git")
        .args(["rev-list", "--count", "origin/HEAD..HEAD"])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let count_str = String::from_utf8_lossy(&o.stdout).trim().to_string();
            Ok(count_str.parse().unwrap_or(0))
        }
        _ => {
            // Try with origin/main
            let output2 = std::process::Command::new("git")
                .args(["rev-list", "--count", "origin/main..HEAD"])
                .current_dir(repo_path)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output();
            match output2 {
                Ok(o) if o.status.success() => {
                    let count_str = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    Ok(count_str.parse().unwrap_or(0))
                }
                _ => Ok(0),
            }
        }
    }
}

/// List unpushed commit messages
pub fn unpushed_log(repo_path: &Path) -> Result<Vec<String>> {
    let output = std::process::Command::new("git")
        .args(["log", "--oneline", "origin/HEAD..HEAD"])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    let stdout = match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => {
            // Try with origin/main
            let output2 = std::process::Command::new("git")
                .args(["log", "--oneline", "origin/main..HEAD"])
                .current_dir(repo_path)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output();
            match output2 {
                Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
                _ => String::new(),
            }
        }
    };

    Ok(stdout.lines().map(|l| l.to_string()).filter(|l| !l.is_empty()).collect())
}

/// Push only (no commit)
pub fn push(repo_path: &Path) -> Result<SyncResult> {
    let output = std::process::Command::new("git")
        .args(["push", "origin", "HEAD"])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    let (pushed, push_error) = match output {
        Ok(o) if o.status.success() => (true, None),
        Ok(o) => (false, Some(String::from_utf8_lossy(&o.stderr).trim().to_string())),
        Err(e) => (false, Some(e.to_string())),
    };

    Ok(SyncResult { committed: false, pushed, push_error })
}

/// Test if remote is reachable
#[allow(dead_code)]
pub fn test_remote(repo_path: &Path) -> Result<()> {
    let repo = git2::Repository::open(repo_path)?;
    let mut remote = repo.find_remote("origin")?;
    remote.connect(git2::Direction::Fetch)?;
    remote.disconnect()?;
    Ok(())
}
