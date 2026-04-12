use anyhow::Result;
use fs4::fs_std::FileExt;
use std::fs::OpenOptions;
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

// ── Shell git helpers ───────────────────────────────────────────────
// All shell `git` invocations go through these helpers to reduce
// boilerplate and ensure consistent error handling.

/// Run a git command and return stdout on success, Err on failure.
fn git_cmd(repo_path: &Path, args: &[&str]) -> Result<String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        anyhow::bail!("{}", if stderr.is_empty() { "git command failed".to_string() } else { stderr })
    }
}

/// Run a git command silently; return true if exit code is 0.
fn git_ok(repo_path: &Path, args: &[&str]) -> bool {
    std::process::Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Run a git command and return (success, stdout, stderr) regardless of exit code.
fn git_raw(repo_path: &Path, args: &[&str]) -> Result<(bool, String, String)> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()?;
    Ok((
        output.status.success(),
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
    ))
}

// ── Cross-process git network serialization ─────────────────────────────
//
// Hosts that tunnel Git over gRPC sometimes return errors like "More than 5
// connections" when too many push/pull/fetch sessions run at once (Desktop +
// CLI + editor hooks). We serialize remote operations for a given sync repo
// using an flock(2)-style lock file. This does not affect unrelated `git`
// invocations outside GitMemo (e.g. raw `git push` in the same repo).

struct RepoNetworkLockGuard {
    file: std::fs::File,
}

impl Drop for RepoNetworkLockGuard {
    fn drop(&mut self) {
        let _ = self.file.unlock();
    }
}

fn try_acquire_repo_network_lock(repo_path: &Path) -> Option<RepoNetworkLockGuard> {
    let lock_path = repo_path.join(".metadata").join("git-network.lock");
    if let Some(dir) = lock_path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(&lock_path)
        .ok()?;
    file.lock_exclusive().ok()?;
    Some(RepoNetworkLockGuard { file })
}

fn with_repo_network_lock<T>(repo_path: &Path, f: impl FnOnce() -> T) -> T {
    match try_acquire_repo_network_lock(repo_path) {
        Some(_guard) => f(),
        None => {
            eprintln!(
                "[gitmemo] Warning: could not acquire .metadata/git-network.lock; \
                 remote git operations may race with other processes."
            );
            f()
        }
    }
}

fn is_transient_git_transport_error(msg: &str) -> bool {
    let s = msg.to_lowercase();
    s.contains("more than 5 connections")
        || s.contains("grpc receive")
        || s.contains("rpc error")
        || s.contains("resource exhausted")
        || s.contains("too many requests")
        || s.contains(" 429 ")
        || s.contains("status 429")
        || s.contains("connection reset")
        || s.contains("broken pipe")
        || s.contains("connection timed out")
        || s.contains("temporarily unavailable")
}

/// Single `git push` attempt (no lock — caller holds [`with_repo_network_lock`]).
fn do_push_once(repo_path: &Path) -> (bool, Option<String>) {
    let branch = configured_branch(repo_path);
    match git_raw(repo_path, &["push", "-u", "origin", &format!("HEAD:{}", branch)]) {
        Ok((true, _, _)) => (true, None),
        Ok((false, stdout, stderr)) => {
            let combined = format!("{stdout} {stderr}");
            if combined.contains("Everything up-to-date") || combined.contains("up to date") {
                (true, None)
            } else {
                (
                    false,
                    Some(if stderr.is_empty() {
                        if stdout.is_empty() {
                            "push failed".to_string()
                        } else {
                            stdout
                        }
                    } else {
                        stderr
                    }),
                )
            }
        }
        Err(e) => (false, Some(e.to_string())),
    }
}

fn do_push_with_retry(repo_path: &Path) -> (bool, Option<String>) {
    const MAX: usize = 4;
    let delays_ms = [500u64, 1_500, 3_500, 8_000];
    let mut last = (false, Some(String::new()));
    for attempt in 0..MAX {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(delays_ms[attempt - 1]));
        }
        last = do_push_once(repo_path);
        if last.0 {
            return last;
        }
        let err = last.1.as_deref().unwrap_or("");
        if !is_transient_git_transport_error(err) {
            return last;
        }
    }
    last
}

/// Read the configured branch from config.toml, default to "main"
fn configured_branch(repo_path: &Path) -> String {
    let config_path = repo_path.join(".metadata").join("config.toml");
    if config_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(config) = toml::from_str::<toml::Value>(&content) {
                if let Some(branch) = config.get("git")
                    .and_then(|g| g.get("branch"))
                    .and_then(|b| b.as_str())
                {
                    return branch.to_string();
                }
            }
        }
    }
    "main".to_string()
}

/// Check if a remote is configured (non-empty remote in config.toml)
pub fn has_remote(repo_path: &Path) -> bool {
    let config_path = repo_path.join(".metadata").join("config.toml");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(config) = toml::from_str::<toml::Value>(&content) {
            if let Some(remote) = config.get("git")
                .and_then(|g| g.get("remote"))
                .and_then(|r| r.as_str())
            {
                return !remote.is_empty();
            }
        }
    }
    false
}

/// Initialize or open Git repository at the given path.
/// If remote_url is empty, creates a local-only repo (no origin).
pub fn init_repo(repo_path: &Path, remote_url: &str) -> Result<git2::Repository> {
    let repo = if repo_path.join(".git").exists() {
        let repo = git2::Repository::open(repo_path)?;
        if !remote_url.is_empty() {
            if let Ok(remote) = repo.find_remote("origin") {
                if remote.url().unwrap_or("") != remote_url {
                    drop(remote);
                    repo.remote_set_url("origin", remote_url)?;
                }
            } else {
                repo.remote("origin", remote_url)?;
            }
        }
        repo
    } else {
        let repo = git2::Repository::init(repo_path)?;
        let _ = git_ok(repo_path, &["branch", "-m", "main"]);
        if !remote_url.is_empty() {
            repo.remote("origin", remote_url)?;
        }
        repo
    };

    Ok(repo)
}

/// Detect the remote's default branch by querying `git ls-remote --symref origin HEAD`
/// Returns "main" or "master" etc.
pub fn detect_remote_branch(repo_path: &Path) -> String {
    // Method 1: ls-remote --symref (most reliable)
    if let Ok(stdout) = git_cmd(repo_path, &["ls-remote", "--symref", "origin", "HEAD"]) {
        for line in stdout.lines() {
            if line.starts_with("ref: refs/heads/") && line.contains("HEAD") {
                let branch = line
                    .trim_start_matches("ref: refs/heads/")
                    .split('\t')
                    .next()
                    .unwrap_or("main");
                return branch.to_string();
            }
        }
    }

    // Method 2: Check if local branch exists
    if let Some(branch) = current_branch(repo_path) {
        return branch;
    }

    "main".to_string()
}

/// Set up upstream tracking: local branch tracks origin/<branch>
/// Also renames local branch to match if they differ.
pub fn setup_tracking(repo_path: &Path, branch: &str) {
    if let Some(current) = current_branch(repo_path) {
        if current != branch {
            let _ = git_ok(repo_path, &["branch", "-m", &current, branch]);
        }
    }
    let _ = git_ok(repo_path, &["branch", "--set-upstream-to", &format!("origin/{}", branch), branch]);
}

/// Stage all changes, commit, and push. Returns sync result.
/// Commit staged changes without pushing. Used during init when remote
/// SSH keys may not be configured yet.
#[allow(dead_code)]
pub fn commit_only(repo_path: &Path, message: &str) -> Result<SyncResult> {
    let _ = ensure_repo_clean(repo_path);
    let repo = git2::Repository::open(repo_path)?;

    let mut index = repo.index()?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;

    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;
    let sig = git2::Signature::now("GitMemo", "bot@gitmemo.dev")?;

    if let Ok(head) = repo.head() {
        let parent = head.peel_to_commit()?;
        if parent.tree()?.id() == tree_id {
            return Ok(SyncResult::nothing());
        }
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])?;
    } else {
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[])?;
    }

    Ok(SyncResult { committed: true, pushed: false, push_error: None })
}

pub fn commit_and_push(repo_path: &Path, message: &str) -> Result<SyncResult> {
    // Health check first: abort any stuck rebase/merge
    let _ = ensure_repo_clean(repo_path);

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

    // Push only if remote is configured
    if has_remote(repo_path) {
        // One lock for pull + push so another GitMemo process cannot interleave.
        let (pushed, push_error) = with_repo_network_lock(repo_path, || {
            let _ = pull_inner(repo_path);
            do_push_with_retry(repo_path)
        });
        Ok(SyncResult { committed, pushed, push_error })
    } else {
        Ok(SyncResult { committed, pushed: false, push_error: None })
    }
}

/// Count unpushed commits using multiple strategies
///
/// Strategy order:
/// 1. `@{u}` — the configured upstream (most reliable when tracking is set)
/// 2. `origin/<configured-branch>` — from config.toml
/// 3. `origin/<current-branch>` — git's current branch
/// 4. `origin/main` then `origin/master` — common defaults
/// 5. Compare local HEAD with `git ls-remote` (ground truth, requires network)
pub fn unpushed_count(repo_path: &Path) -> Result<usize> {
    let (ahead, _) = ahead_behind(repo_path)?;
    Ok(ahead)
}

/// Count local commits ahead of remote and commits behind remote.
///
/// Returns `(ahead, behind)`.
pub fn ahead_behind(repo_path: &Path) -> Result<(usize, usize)> {
    if !has_remote(repo_path) {
        return Ok((0, 0));
    }

    for target in build_tracking_targets(repo_path) {
        if let Some((ahead, behind)) = rev_list_left_right_count(repo_path, &format!("HEAD...{}", target)) {
            return Ok((ahead, behind));
        }
    }

    // Strategy 1: Use @{u} (upstream tracking ref)
    if let Some(count) = rev_list_count(repo_path, "@{u}..HEAD") {
        return Ok((count, 0));
    }

    // Strategy 2: Use configured branch from config.toml
    let cfg_branch = configured_branch(repo_path);
    let refspec = format!("origin/{}..HEAD", cfg_branch);
    if let Some(count) = rev_list_count(repo_path, &refspec) {
        return Ok((count, 0));
    }

    // Strategy 3: Get current branch name, try origin/<branch>
    if let Some(branch) = current_branch(repo_path) {
        if branch != cfg_branch {
            let refspec = format!("origin/{}..HEAD", branch);
            if let Some(count) = rev_list_count(repo_path, &refspec) {
                return Ok((count, 0));
            }
        }
    }

    // Strategy 4: Common defaults (skip if already tried)
    for remote_ref in &["origin/main", "origin/master"] {
        let refspec = format!("{}..HEAD", remote_ref);
        if let Some(count) = rev_list_count(repo_path, &refspec) {
            return Ok((count, 0));
        }
    }

    // Strategy 5: Compare local HEAD with remote via ls-remote (network call)
    if let Some(count) = count_via_ls_remote(repo_path) {
        return Ok((count, 0));
    }

    // If all strategies fail, return 0 but has_unpushed() will catch this
    Ok((0, 0))
}

/// Check if there are ANY unpushed commits (more reliable than count)
pub fn has_unpushed(repo_path: &Path) -> bool {
    // Quick check: is there a diff between local and any known remote ref?
    if let Some(count) = rev_list_count(repo_path, "@{u}..HEAD") {
        return count > 0;
    }

    let cfg_branch = configured_branch(repo_path);
    let refspec = format!("origin/{}..HEAD", cfg_branch);
    if let Some(count) = rev_list_count(repo_path, &refspec) {
        return count > 0;
    }

    if let Some(branch) = current_branch(repo_path) {
        if branch != cfg_branch {
            let refspec = format!("origin/{}..HEAD", branch);
            if let Some(count) = rev_list_count(repo_path, &refspec) {
                return count > 0;
            }
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
    git_cmd(repo_path, &["branch", "--show-current"]).ok().filter(|b| !b.is_empty())
}

/// Run `git rev-list --count <refspec>` and return count if command succeeds
fn rev_list_count(repo_path: &Path, refspec: &str) -> Option<usize> {
    git_cmd(repo_path, &["rev-list", "--count", refspec]).ok()?.parse().ok()
}

/// Compare local HEAD with remote using ls-remote (requires network).
fn count_via_ls_remote(repo_path: &Path) -> Option<usize> {
    with_repo_network_lock(repo_path, || count_via_ls_remote_inner(repo_path))
}

fn count_via_ls_remote_inner(repo_path: &Path) -> Option<usize> {
    let cfg_branch = configured_branch(repo_path);

    let local_head = git_cmd(repo_path, &["rev-parse", "HEAD"]).ok()?;

    // Get remote branch hash (try configured branch first, then HEAD)
    let remote_ref = format!("refs/heads/{}", cfg_branch);
    let remote_head = git_cmd(repo_path, &["ls-remote", "origin", &remote_ref])
        .ok()
        .and_then(|s| s.split_whitespace().next().map(|h| h.to_string()))
        .filter(|h| !h.is_empty())
        .or_else(|| {
            git_cmd(repo_path, &["ls-remote", "origin", "HEAD"])
                .ok()
                .and_then(|s| s.split_whitespace().next().map(|h| h.to_string()))
                .filter(|h| !h.is_empty())
        });

    match remote_head {
        None => {
            // Remote has no commits yet — all local commits are unpushed
            rev_list_count(repo_path, "HEAD")
        }
        Some(ref rh) if *rh == local_head => Some(0),
        Some(rh) => {
            let refspec = format!("{}..HEAD", rh);
            rev_list_count(repo_path, &refspec)
        }
    }
}

/// List unpushed commit messages
pub fn unpushed_log(repo_path: &Path) -> Result<Vec<String>> {
    let refspecs = build_refspec_candidates(repo_path);

    for refspec in &refspecs {
        if let Ok(stdout) = git_cmd(repo_path, &["log", "--oneline", refspec]) {
            let lines: Vec<String> = stdout.lines()
                .map(|l| l.to_string())
                .filter(|l| !l.is_empty())
                .collect();
            return Ok(lines);
        }
    }

    Ok(Vec::new())
}

/// Build a list of refspec candidates for unpushed detection
fn build_refspec_candidates(repo_path: &Path) -> Vec<String> {
    let mut candidates = Vec::new();
    let cfg_branch = configured_branch(repo_path);

    // 1. Upstream tracking
    candidates.push("@{u}..HEAD".to_string());

    // 2. Configured branch from config.toml
    candidates.push(format!("origin/{}..HEAD", cfg_branch));

    // 3. origin/<current-branch> (if different from configured)
    if let Some(branch) = current_branch(repo_path) {
        if branch != cfg_branch {
            candidates.push(format!("origin/{}..HEAD", branch));
        }
    }

    // 4. Common defaults (skip duplicates)
    for default in &["origin/main", "origin/master"] {
        let candidate = format!("{}..HEAD", default);
        if !candidates.contains(&candidate) {
            candidates.push(candidate);
        }
    }

    candidates
}

fn build_tracking_targets(repo_path: &Path) -> Vec<String> {
    let mut candidates = Vec::new();
    let cfg_branch = configured_branch(repo_path);

    candidates.push("@{u}".to_string());
    candidates.push(format!("origin/{}", cfg_branch));

    if let Some(branch) = current_branch(repo_path) {
        if branch != cfg_branch {
            candidates.push(format!("origin/{}", branch));
        }
    }

    for default in &["origin/main", "origin/master"] {
        if !candidates.iter().any(|c| c == default) {
            candidates.push((*default).to_string());
        }
    }

    candidates
}

fn rev_list_left_right_count(repo_path: &Path, refspec: &str) -> Option<(usize, usize)> {
    let stdout = git_cmd(repo_path, &["rev-list", "--left-right", "--count", refspec]).ok()?;
    let mut parts = stdout.split_whitespace();
    let ahead = parts.next()?.parse().ok()?;
    let behind = parts.next()?.parse().ok()?;
    Some((ahead, behind))
}

/// Push only (no commit)
pub fn push(repo_path: &Path) -> Result<SyncResult> {
    let (pushed, push_error) =
        with_repo_network_lock(repo_path, || do_push_with_retry(repo_path));
    Ok(SyncResult { committed: false, pushed, push_error })
}

/// Check if the repository is in a stuck state (rebase/merge in progress)
/// and attempt to auto-recover by aborting the stuck operation.
/// Returns Ok(true) if recovery was performed, Ok(false) if repo was clean.
pub fn ensure_repo_clean(repo_path: &Path) -> Result<bool> {
    let git_dir = repo_path.join(".git");

    let rebase_merge = git_dir.join("rebase-merge").exists();
    let rebase_apply = git_dir.join("rebase-apply").exists();
    let merge_head = git_dir.join("MERGE_HEAD").exists();

    if rebase_merge || rebase_apply {
        eprintln!("[gitmemo] Detected stuck rebase in {}, aborting...", repo_path.display());
        if git_ok(repo_path, &["rebase", "--abort"]) {
            eprintln!("[gitmemo] Rebase aborted successfully");
        } else {
            let _ = git_ok(repo_path, &["rebase", "--quit"]);
            eprintln!("[gitmemo] Rebase --abort failed, used --quit as fallback");
        }
        return Ok(true);
    }

    if merge_head {
        eprintln!("[gitmemo] Detected stuck merge in {}, aborting...", repo_path.display());
        let _ = git_ok(repo_path, &["merge", "--abort"]);
        return Ok(true);
    }

    Ok(false)
}

/// Pull latest changes from remote (rebase mode).
/// Auto-recovers from stuck rebase before attempting pull.
/// Falls back to merge if rebase fails, then merge -X theirs if merge also fails.
/// Returns Ok(true) on success, Err with message on failure.
pub fn pull(repo_path: &Path) -> Result<bool> {
    with_repo_network_lock(repo_path, || pull_inner(repo_path))
}

fn pull_inner(repo_path: &Path) -> Result<bool> {
    let _ = ensure_repo_clean(repo_path);
    let branch = configured_branch(repo_path);

    // Strategy 1: pull --rebase (fast, clean history)
    match git_raw(repo_path, &["pull", "--rebase", "origin", &branch]) {
        Ok((true, _, _)) => return Ok(true),
        Ok((false, _, stderr)) => {
            let _ = ensure_repo_clean(repo_path);
            if stderr.contains("Could not resolve host") || stderr.contains("unable to access") {
                eprintln!("[gitmemo] Pull skipped: network unreachable");
                return Ok(false);
            }
            eprintln!("[gitmemo] Rebase failed, trying merge fallback: {}", stderr);
        }
        Err(e) => {
            eprintln!("[gitmemo] Pull command error: {}", e);
            return Ok(false);
        }
    }

    // Strategy 2: pull --no-rebase (merge)
    match git_raw(repo_path, &["pull", "--no-rebase", "origin", &branch]) {
        Ok((true, _, _)) => {
            eprintln!("[gitmemo] Merge pull succeeded");
            return Ok(true);
        }
        Ok((false, _, _)) => {
            let _ = git_ok(repo_path, &["merge", "--abort"]);
            eprintln!("[gitmemo] Merge had conflicts, trying -X theirs");
        }
        Err(e) => {
            eprintln!("[gitmemo] Merge pull error: {}", e);
            return Ok(false);
        }
    }

    // Strategy 3: fetch + merge -X theirs (auto-resolve, remote wins)
    let _ = git_ok(repo_path, &["fetch", "origin", &branch]);
    match git_raw(repo_path, &["merge", "-X", "theirs", &format!("origin/{}", branch), "-m", "auto: merge remote (theirs)"]) {
        Ok((true, _, _)) => {
            eprintln!("[gitmemo] Merge -X theirs succeeded, sync recovered");
            Ok(true)
        }
        Ok((false, _, stderr)) => {
            let _ = ensure_repo_clean(repo_path);
            eprintln!("[gitmemo] All pull strategies failed: {}", stderr);
            Ok(false)
        }
        Err(e) => {
            eprintln!("[gitmemo] Merge -X theirs error: {}", e);
            Ok(false)
        }
    }
}

/// Fetch the remote tracking refs without rebasing the worktree.
#[allow(dead_code)]
pub fn fetch(repo_path: &Path) -> Result<bool> {
    if !has_remote(repo_path) {
        return Ok(false);
    }
    Ok(with_repo_network_lock(repo_path, || {
        git_ok(repo_path, &["fetch", "--quiet", "origin"])
    }))
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
