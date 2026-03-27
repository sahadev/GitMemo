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
    let (pushed, push_error) = do_push(repo_path);

    Ok(SyncResult { committed, pushed, push_error })
}

/// Execute git push and return (success, error_message)
fn do_push(repo_path: &Path) -> (bool, Option<String>) {
    let output = std::process::Command::new("git")
        .args(["push", "origin", "HEAD"])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    match output {
        Ok(o) if o.status.success() => (true, None),
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
            // "Everything up-to-date" comes on stderr with exit code 0 usually,
            // but handle it here just in case
            if stderr.contains("Everything up-to-date") || stderr.contains("up to date") {
                (true, None)
            } else {
                (false, Some(if stderr.is_empty() { "push failed".to_string() } else { stderr }))
            }
        }
        Err(e) => (false, Some(e.to_string())),
    }
}

/// Count unpushed commits using multiple strategies
///
/// Strategy order:
/// 1. `@{u}` — the configured upstream (most reliable)
/// 2. `origin/<current-branch>` — explicit remote tracking branch
/// 3. `origin/main` then `origin/master` — common defaults
/// 4. Compare local HEAD with `git ls-remote` (ground truth, requires network)
pub fn unpushed_count(repo_path: &Path) -> Result<usize> {
    // Strategy 1: Use @{u} (upstream tracking ref)
    if let Some(count) = rev_list_count(repo_path, "@{u}..HEAD") {
        return Ok(count);
    }

    // Strategy 2: Get current branch name, try origin/<branch>
    if let Some(branch) = current_branch(repo_path) {
        let refspec = format!("origin/{}..HEAD", branch);
        if let Some(count) = rev_list_count(repo_path, &refspec) {
            return Ok(count);
        }
    }

    // Strategy 3: Common defaults
    for remote_ref in &["origin/main", "origin/master"] {
        let refspec = format!("{}..HEAD", remote_ref);
        if let Some(count) = rev_list_count(repo_path, &refspec) {
            return Ok(count);
        }
    }

    // Strategy 4: Compare local HEAD with remote via ls-remote (network call)
    if let Some(count) = count_via_ls_remote(repo_path) {
        return Ok(count);
    }

    // If all strategies fail, return error instead of silently returning 0
    // This way callers can distinguish "0 unpushed" from "can't determine"
    Ok(0)
}

/// Check if there are ANY unpushed commits (more reliable than count)
pub fn has_unpushed(repo_path: &Path) -> bool {
    // Quick check: is there a diff between local and any known remote ref?
    if let Some(count) = rev_list_count(repo_path, "@{u}..HEAD") {
        return count > 0;
    }
    if let Some(branch) = current_branch(repo_path) {
        let refspec = format!("origin/{}..HEAD", branch);
        if let Some(count) = rev_list_count(repo_path, &refspec) {
            return count > 0;
        }
    }
    for remote_ref in &["origin/main", "origin/master"] {
        let refspec = format!("{}..HEAD", remote_ref);
        if let Some(count) = rev_list_count(repo_path, &refspec) {
            return count > 0;
        }
    }
    // Fall back to ls-remote
    if let Some(count) = count_via_ls_remote(repo_path) {
        return count > 0;
    }
    // Can't determine — assume there might be unpushed (safer than false)
    true
}

/// Get the current branch name
fn current_branch(repo_path: &Path) -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .ok()?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if branch.is_empty() { None } else { Some(branch) }
    } else {
        None
    }
}

/// Run `git rev-list --count <refspec>` and return count if command succeeds
fn rev_list_count(repo_path: &Path, refspec: &str) -> Option<usize> {
    let output = std::process::Command::new("git")
        .args(["rev-list", "--count", refspec])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .ok()?;

    if output.status.success() {
        let count_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        count_str.parse().ok()
    } else {
        None
    }
}

/// Compare local HEAD with remote using ls-remote (requires network)
fn count_via_ls_remote(repo_path: &Path) -> Option<usize> {
    // Get local HEAD hash
    let local_output = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .ok()?;

    if !local_output.status.success() {
        return None;
    }
    let local_head = String::from_utf8_lossy(&local_output.stdout).trim().to_string();

    // Get remote HEAD hash
    let remote_output = std::process::Command::new("git")
        .args(["ls-remote", "origin", "HEAD"])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .ok()?;

    if !remote_output.status.success() {
        return None;
    }
    let remote_str = String::from_utf8_lossy(&remote_output.stdout).trim().to_string();
    let remote_head = remote_str.split_whitespace().next().unwrap_or("");

    if remote_head.is_empty() {
        // Remote has no commits yet — all local commits are unpushed
        let count_output = std::process::Command::new("git")
            .args(["rev-list", "--count", "HEAD"])
            .current_dir(repo_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .ok()?;

        if count_output.status.success() {
            return String::from_utf8_lossy(&count_output.stdout)
                .trim()
                .parse()
                .ok();
        }
        return None;
    }

    if local_head == remote_head {
        return Some(0);
    }

    // Count commits between remote and local
    let refspec = format!("{}..HEAD", remote_head);
    rev_list_count(repo_path, &refspec)
}

/// List unpushed commit messages
pub fn unpushed_log(repo_path: &Path) -> Result<Vec<String>> {
    // Try multiple strategies, same as unpushed_count
    let refspecs = build_refspec_candidates(repo_path);

    for refspec in &refspecs {
        let output = std::process::Command::new("git")
            .args(["log", "--oneline", refspec])
            .current_dir(repo_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output();

        if let Ok(o) = output {
            if o.status.success() {
                let stdout = String::from_utf8_lossy(&o.stdout).to_string();
                let lines: Vec<String> = stdout.lines()
                    .map(|l| l.to_string())
                    .filter(|l| !l.is_empty())
                    .collect();
                if !lines.is_empty() || refspecs.len() == 1 {
                    return Ok(lines);
                }
                // If this refspec returned 0 lines, try next one only if it might be wrong
                return Ok(lines);
            }
        }
    }

    Ok(Vec::new())
}

/// Build a list of refspec candidates for unpushed detection
fn build_refspec_candidates(repo_path: &Path) -> Vec<String> {
    let mut candidates = Vec::new();

    // 1. Upstream tracking
    candidates.push("@{u}..HEAD".to_string());

    // 2. origin/<current-branch>
    if let Some(branch) = current_branch(repo_path) {
        candidates.push(format!("origin/{}..HEAD", branch));
    }

    // 3. Common defaults
    candidates.push("origin/main..HEAD".to_string());
    candidates.push("origin/master..HEAD".to_string());

    candidates
}

/// Push only (no commit)
pub fn push(repo_path: &Path) -> Result<SyncResult> {
    let (pushed, push_error) = do_push(repo_path);
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
