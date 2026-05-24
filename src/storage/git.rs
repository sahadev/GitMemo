use anyhow::Result;
use fs4::fs_std::FileExt;
#[cfg(target_os = "android")]
use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::Read;
#[cfg(target_os = "android")]
use std::io::Write;
use std::path::Path;
#[cfg(target_os = "android")]
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_GIT_COMMAND_TIMEOUT_SECS: u64 = 60;

#[cfg(unix)]
mod process_group {
    use std::io;
    use std::os::unix::process::CommandExt;
    use std::process::Command;

    const SIGKILL: i32 = 9;

    unsafe extern "C" {
        fn setpgid(pid: i32, pgid: i32) -> i32;
        fn kill(pid: i32, sig: i32) -> i32;
    }

    pub fn configure(command: &mut Command) {
        unsafe {
            command.pre_exec(|| {
                if setpgid(0, 0) == 0 {
                    Ok(())
                } else {
                    Err(io::Error::last_os_error())
                }
            });
        }
    }

    pub fn kill_for_child(child_id: u32) {
        unsafe {
            let _ = kill(-(child_id as i32), SIGKILL);
        }
    }
}

#[cfg(not(unix))]
mod process_group {
    use std::process::Command;

    pub fn configure(_command: &mut Command) {}
    pub fn kill_for_child(_child_id: u32) {}
}

fn config_value(repo_path: &Path, key: &str) -> Option<String> {
    let config_path = repo_path.join(".metadata").join("config.toml");
    let content = std::fs::read_to_string(config_path).ok()?;
    let config = toml::from_str::<toml::Value>(&content).ok()?;
    config
        .get("git")
        .and_then(|g| g.get(key))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
}

fn configured_ssh_key_path(repo_path: &Path) -> Option<String> {
    config_value(repo_path, "ssh_key_path").filter(|path| !path.is_empty())
}

#[cfg(target_os = "android")]
fn configured_access_token(repo_path: &Path) -> Option<String> {
    config_value(repo_path, "access_token").filter(|token| !token.is_empty())
}

fn git_command(repo_path: &Path, args: &[&str]) -> Command {
    let mut command = Command::new("git");
    command.args(args).current_dir(repo_path);
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never");

    let ssh_command = if let Some(key_path) = configured_ssh_key_path(repo_path) {
        format!(
            "ssh -i '{}' -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2",
            key_path.replace('\'', r#"'\''"#)
        )
    } else {
        "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2".to_string()
    };
    command.env("GIT_SSH_COMMAND", ssh_command);

    command
}

fn git_command_timeout() -> Duration {
    let secs = std::env::var("GITMEMO_GIT_TIMEOUT_SECS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|secs| *secs > 0)
        .unwrap_or(DEFAULT_GIT_COMMAND_TIMEOUT_SECS);
    Duration::from_secs(secs)
}

fn read_pipe<R: Read + Send + 'static>(
    mut pipe: R,
) -> thread::JoinHandle<std::io::Result<Vec<u8>>> {
    thread::spawn(move || {
        let mut buf = Vec::new();
        pipe.read_to_end(&mut buf)?;
        Ok(buf)
    })
}

fn join_pipe(handle: Option<thread::JoinHandle<std::io::Result<Vec<u8>>>>) -> Result<Vec<u8>> {
    let Some(handle) = handle else {
        return Ok(Vec::new());
    };

    match handle.join() {
        Ok(result) => Ok(result?),
        Err(_) => anyhow::bail!("failed to read git command output"),
    }
}

fn git_output(repo_path: &Path, args: &[&str]) -> Result<Output> {
    let timeout = git_command_timeout();
    let mut command = git_command(repo_path, args);
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    process_group::configure(&mut command);

    let mut child = command.spawn()?;
    let stdout = child.stdout.take().map(read_pipe);
    let stderr = child.stderr.take().map(read_pipe);
    let started = Instant::now();

    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }

        if started.elapsed() >= timeout {
            process_group::kill_for_child(child.id());
            let _ = child.kill();
            let _ = child.wait();
            anyhow::bail!(
                "git command timed out after {}s: git {}",
                timeout.as_secs(),
                args.join(" ")
            );
        }

        thread::sleep(Duration::from_millis(100));
    };

    Ok(Output {
        status,
        stdout: join_pipe(stdout)?,
        stderr: join_pipe(stderr)?,
    })
}

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
        Self {
            committed: false,
            pushed: false,
            push_error: None,
        }
    }
}

// ── Shell git helpers ───────────────────────────────────────────────
// All shell `git` invocations go through these helpers to reduce
// boilerplate and ensure consistent error handling.

/// Run a git command and return stdout on success, Err on failure.
fn git_cmd(repo_path: &Path, args: &[&str]) -> Result<String> {
    let output = git_output(repo_path, args)?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        anyhow::bail!(
            "{}",
            if stderr.is_empty() {
                "git command failed".to_string()
            } else {
                stderr
            }
        )
    }
}

/// Run a git command silently; return true if exit code is 0.
fn git_ok(repo_path: &Path, args: &[&str]) -> bool {
    git_output(repo_path, args)
        .map(|output| output.status.success())
        .unwrap_or(false)
}

/// Run a git command and return (success, stdout, stderr) regardless of exit code.
fn git_raw(repo_path: &Path, args: &[&str]) -> Result<(bool, String, String)> {
    let output = git_output(repo_path, args)?;
    Ok((
        output.status.success(),
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
    ))
}

/// Sum the size of files that belong to the GitMemo working tree.
///
/// This intentionally excludes Git internals and ignored local state such as
/// `.metadata/`, `.ssh/`, `.backups/`, and any other paths covered by the
/// repository's ignore rules.
pub fn worktree_content_size(repo_path: &Path) -> u64 {
    git_ls_files_size(repo_path).unwrap_or_else(|| fallback_content_size(repo_path))
}

/// Count files tracked in the Git index for the current branch checkout.
#[allow(dead_code)]
pub fn tracked_file_count(repo_path: &Path) -> usize {
    git_ls_files_count(repo_path).unwrap_or_else(|| fallback_content_file_count(repo_path))
}

/// Size of the Git object database, matching repository-host "repo size" more
/// closely than summing checked-out working tree files.
#[allow(dead_code)]
pub fn repository_storage_size(repo_path: &Path) -> u64 {
    git_count_objects_size(repo_path).unwrap_or_else(|| worktree_content_size(repo_path))
}

fn git_ls_files_size(repo_path: &Path) -> Option<u64> {
    let output = git_command(
        repo_path,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::null())
    .output()
    .ok()?;

    if !output.status.success() {
        return None;
    }

    Some(
        output
            .stdout
            .split(|b| *b == 0)
            .filter(|path| !path.is_empty())
            .filter_map(|path| {
                let rel = String::from_utf8_lossy(path);
                repo_path.join(rel.as_ref()).metadata().ok()
            })
            .filter(|meta| meta.is_file())
            .map(|meta| meta.len())
            .sum(),
    )
}

#[allow(dead_code)]
fn git_ls_files_count(repo_path: &Path) -> Option<usize> {
    let output = git_command(repo_path, &["ls-files", "-z"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    Some(
        output
            .stdout
            .split(|b| *b == 0)
            .filter(|path| !path.is_empty())
            .count(),
    )
}

#[allow(dead_code)]
fn git_count_objects_size(repo_path: &Path) -> Option<u64> {
    let stdout = git_cmd(repo_path, &["count-objects", "-v"]).ok()?;
    let mut total_kib = 0u64;

    for line in stdout.lines() {
        if let Some(value) = line.strip_prefix("size: ") {
            total_kib = total_kib.checked_add(value.trim().parse::<u64>().ok()?)?;
        } else if let Some(value) = line.strip_prefix("size-pack: ") {
            total_kib = total_kib.checked_add(value.trim().parse::<u64>().ok()?)?;
        }
    }

    Some(total_kib.saturating_mul(1024))
}

fn fallback_content_size(repo_path: &Path) -> u64 {
    walkdir::WalkDir::new(repo_path)
        .into_iter()
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            !matches!(
                name.as_ref(),
                ".git" | ".metadata" | ".ssh" | ".backups" | "imports"
            )
        })
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| entry.metadata().ok())
        .map(|meta| meta.len())
        .sum()
}

#[allow(dead_code)]
fn fallback_content_file_count(repo_path: &Path) -> usize {
    walkdir::WalkDir::new(repo_path)
        .into_iter()
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            !matches!(
                name.as_ref(),
                ".git" | ".metadata" | ".ssh" | ".backups" | "imports"
            )
        })
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .count()
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
        .truncate(false)
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
    match git_raw(
        repo_path,
        &["push", "-u", "origin", &format!("HEAD:{}", branch)],
    ) {
        Ok((true, _, _)) => (true, None),
        Ok((false, stdout, stderr)) => {
            let combined = format!("{stdout} {stderr}");
            if combined.contains("Everything up-to-date") || combined.contains("up to date") {
                (true, None)
            } else {
                (
                    false,
                    Some(crate::utils::sanitize::git_error_for_user(
                        if stderr.is_empty() {
                            if stdout.is_empty() {
                                "push failed".to_string()
                            } else {
                                stdout
                            }
                        } else {
                            stderr
                        },
                    )),
                )
            }
        }
        Err(e) => (
            false,
            Some(crate::utils::sanitize::git_error_for_user(e.to_string())),
        ),
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
    config_value(repo_path, "branch").unwrap_or_else(|| "main".to_string())
}

fn missing_or_unborn_head(error: &git2::Error) -> bool {
    matches!(
        error.code(),
        git2::ErrorCode::NotFound | git2::ErrorCode::UnbornBranch
    )
}

fn current_head_commit(repo: &git2::Repository) -> Result<Option<git2::Commit<'_>>> {
    let head = match repo.head() {
        Ok(head) => head,
        Err(e) if missing_or_unborn_head(&e) => return Ok(None),
        Err(e) => return Err(e.into()),
    };

    match head.peel_to_commit() {
        Ok(commit) => Ok(Some(commit)),
        Err(e) if missing_or_unborn_head(&e) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Check if a remote is configured (non-empty remote in config.toml)
pub fn has_remote(repo_path: &Path) -> bool {
    config_value(repo_path, "remote")
        .map(|remote| !remote.is_empty())
        .unwrap_or(false)
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
        repo.set_head("refs/heads/main")?;
        let _ = git_ok(repo_path, &["branch", "-m", "main"]);
        if !remote_url.is_empty() {
            repo.remote("origin", remote_url)?;
        }
        repo
    };

    Ok(repo)
}

#[cfg(target_os = "android")]
fn configure_android_git_ssl() {
    // git2 uses vendored OpenSSL here; on Android it does not automatically
    // discover the platform CA store, so HTTPS remotes can fail with
    // "the SSL certificate is invalid" even for normal public certificates.
    if let Some(bundle) = android_ca_bundle_path() {
        match unsafe { git2::opts::set_ssl_cert_file(bundle.as_path()) } {
            Ok(()) => return,
            Err(_) => {}
        }
    }

    for cert_dir in [
        "/system/etc/security/cacerts",
        "/apex/com.android.conscrypt/cacerts",
    ] {
        if !Path::new(cert_dir).is_dir() {
            continue;
        }
        match unsafe { git2::opts::set_ssl_cert_dir(cert_dir) } {
            Ok(()) => return,
            Err(e) => eprintln!("[gitmemo] Failed to use Android CA directory {cert_dir}: {e}"),
        }
    }
}

#[cfg(target_os = "android")]
pub fn android_git_ssl_diagnostic() -> Vec<(String, bool, String)> {
    let mut steps = Vec::new();
    let mut ca_dir_available = false;
    match android_ca_bundle_path() {
        Some(bundle) => {
            let size = bundle.metadata().map(|meta| meta.len()).unwrap_or(0);
            match unsafe { git2::opts::set_ssl_cert_file(bundle.as_path()) } {
                Ok(()) => steps.push((
                    "ca_bundle".to_string(),
                    true,
                    format!("{} bytes at {}", size, bundle.display()),
                )),
                Err(e) => steps.push((
                    "ca_bundle".to_string(),
                    true,
                    format!(
                        "{} bytes at {}; OpenSSL did not load the bundle directly, falling back to Android CA directories and host verification ({e})",
                        size,
                        bundle.display()
                    ),
                )),
            }
        }
        None => steps.push((
            "ca_bundle".to_string(),
            true,
            "Android CA bundle could not be built; falling back to Android CA directories and host verification".to_string(),
        )),
    }

    for cert_dir in [
        "/system/etc/security/cacerts",
        "/apex/com.android.conscrypt/cacerts",
    ] {
        let path = Path::new(cert_dir);
        let count = std::fs::read_dir(path)
            .map(|entries| entries.filter_map(Result::ok).count())
            .unwrap_or(0);
        let ok = path.is_dir() && count > 0;
        ca_dir_available |= ok;
        steps.push((format!("ca_dir:{cert_dir}"), ok, format!("{count} entries")));
    }

    steps.push((
        "tls_fallback".to_string(),
        ca_dir_available,
        if ca_dir_available {
            "Android CA directories are available; HTTPS fetch/push can also use host-limited certificate verification".to_string()
        } else {
            "No Android CA directory was found".to_string()
        },
    ));

    steps
}

#[cfg(target_os = "android")]
fn android_ca_bundle_path() -> Option<PathBuf> {
    let bundle = std::env::temp_dir().join("gitmemo-android-ca-bundle.pem");

    let mut output = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&bundle)
        .ok()?;
    let mut wrote_any = false;

    for cert_dir in [
        "/system/etc/security/cacerts",
        "/apex/com.android.conscrypt/cacerts",
    ] {
        let Ok(entries) = std::fs::read_dir(cert_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Ok(content) = std::fs::read(&path) else {
                continue;
            };
            if !content.starts_with(b"-----BEGIN CERTIFICATE-----") {
                continue;
            }
            let Some(cert) = extract_pem_certificate(&content) else {
                continue;
            };
            if output.write_all(cert).is_ok() && output.write_all(b"\n").is_ok() {
                wrote_any = true;
            }
        }
    }

    output.flush().ok()?;
    if wrote_any {
        Some(bundle)
    } else {
        let _ = std::fs::remove_file(&bundle);
        None
    }
}

#[cfg(target_os = "android")]
fn extract_pem_certificate(content: &[u8]) -> Option<&[u8]> {
    const BEGIN: &[u8] = b"-----BEGIN CERTIFICATE-----";
    const END: &[u8] = b"-----END CERTIFICATE-----";

    let begin = content
        .windows(BEGIN.len())
        .position(|window| window == BEGIN)?;
    let end_relative = content[begin..]
        .windows(END.len())
        .position(|window| window == END)?;
    let end = begin + end_relative + END.len();
    Some(&content[begin..end])
}

#[cfg(target_os = "android")]
fn url_path_owner(remote_url: &str) -> Option<String> {
    let after_scheme = remote_url.split_once("://")?.1;
    let path = after_scheme.split_once('/')?.1;
    let owner = path.split('/').next()?.trim();
    if owner.is_empty() {
        None
    } else {
        Some(owner.to_string())
    }
}

#[cfg(target_os = "android")]
fn token_username_from_url(remote_url: &str, username_from_url: Option<&str>) -> String {
    if let Some(username) = username_from_url.filter(|value| !value.trim().is_empty()) {
        return username.to_string();
    }

    let lower_url = remote_url.to_ascii_lowercase();
    if lower_url.contains("gitee.com") {
        if let Some(owner) = url_path_owner(remote_url) {
            return owner;
        }
    }
    if lower_url.contains("gitlab") {
        return "oauth2".to_string();
    }

    "x-access-token".to_string()
}

#[cfg(target_os = "android")]
fn remote_host_from_url(remote_url: &str) -> Option<String> {
    let after_scheme = remote_url.split_once("://")?.1;
    let authority = after_scheme.split('/').next()?.trim();
    let host = authority
        .rsplit_once('@')
        .map(|(_, value)| value)
        .unwrap_or(authority)
        .split(':')
        .next()?
        .trim();
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

#[cfg(target_os = "android")]
fn install_host_limited_certificate_fallback(
    callbacks: &mut git2::RemoteCallbacks<'_>,
    remote_url: Option<&str>,
) {
    let allowed_host = remote_url.and_then(remote_host_from_url);
    callbacks.certificate_check(move |cert, host| {
        let host_matches = allowed_host
            .as_deref()
            .map(|allowed| allowed.eq_ignore_ascii_case(host))
            .unwrap_or(false);
        if host_matches && cert.as_x509().is_some() {
            Ok(git2::CertificateCheckStatus::CertificateOk)
        } else {
            Ok(git2::CertificateCheckStatus::CertificatePassthrough)
        }
    });
}

#[cfg(target_os = "android")]
fn token_fetch_options<'a>(token: &'a str, remote_url: Option<&str>) -> git2::FetchOptions<'a> {
    configure_android_git_ssl();
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(
        move |url: &str, username_from_url: Option<&str>, _allowed: git2::CredentialType| {
            let username = token_username_from_url(url, username_from_url);
            git2::Cred::userpass_plaintext(&username, token)
        },
    );
    install_host_limited_certificate_fallback(&mut callbacks, remote_url);

    let mut options = git2::FetchOptions::new();
    options.remote_callbacks(callbacks);
    options
}

#[cfg(target_os = "android")]
fn token_push_options<'a>(token: &'a str, remote_url: Option<&str>) -> git2::PushOptions<'a> {
    configure_android_git_ssl();
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(
        move |url: &str, username_from_url: Option<&str>, _allowed: git2::CredentialType| {
            let username = token_username_from_url(url, username_from_url);
            git2::Cred::userpass_plaintext(&username, token)
        },
    );
    callbacks.push_update_reference(move |reference, status| {
        if let Some(status) = status {
            return Err(git2::Error::from_str(&format!("{reference}: {status}")));
        }
        Ok(())
    });
    install_host_limited_certificate_fallback(&mut callbacks, remote_url);

    let mut options = git2::PushOptions::new();
    options.remote_callbacks(callbacks);
    options
}

#[cfg(target_os = "android")]
fn missing_remote_ref(error: &git2::Error) -> bool {
    let message = error.message().to_ascii_lowercase();
    message.contains("couldn't find remote ref")
        || message.contains("could not find remote ref")
        || message.contains("remote branch")
        || message.contains("not found")
}

#[cfg(target_os = "android")]
fn fetch_branch_with_token(repo: &git2::Repository, branch: &str, token: &str) -> Result<bool> {
    let mut remote = repo.find_remote("origin")?;
    let remote_url = remote.url().map(ToOwned::to_owned);
    let mut options = token_fetch_options(token, remote_url.as_deref());
    let refspec = format!("refs/heads/{branch}:refs/remotes/origin/{branch}");
    match remote.fetch(&[refspec.as_str()], Some(&mut options), None) {
        Ok(()) => Ok(true),
        Err(e) if missing_remote_ref(&e) => Ok(false),
        Err(e) => Err(e.into()),
    }
}

#[cfg(target_os = "android")]
fn set_branch_to_commit(
    repo: &git2::Repository,
    branch: &str,
    commit: &git2::Commit<'_>,
) -> Result<()> {
    let ref_name = format!("refs/heads/{branch}");
    match repo.find_reference(&ref_name) {
        Ok(mut local_ref) => {
            local_ref.set_target(commit.id(), "fast-forward from origin")?;
        }
        Err(_) => {
            repo.branch(branch, commit, true)?;
        }
    }
    repo.set_head(&ref_name)?;
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.force();
    repo.checkout_head(Some(&mut checkout))?;
    Ok(())
}

#[cfg(target_os = "android")]
fn ensure_token_branch(repo: &git2::Repository, branch: &str) -> Result<()> {
    let ref_name = format!("refs/heads/{branch}");
    if repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(ToOwned::to_owned))
        == Some(branch.to_string())
    {
        return Ok(());
    }

    let mut needs_checkout = false;
    if repo.find_reference(&ref_name).is_ok() {
        repo.set_head(&ref_name)?;
        needs_checkout = current_head_commit(repo)?.is_some();
    } else if let Some(head_commit) = current_head_commit(repo)? {
        repo.branch(branch, &head_commit, true)?;
        repo.set_head(&ref_name)?;
        needs_checkout = true;
    } else {
        repo.set_head(&ref_name)?;
    }

    if needs_checkout {
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.force();
        repo.checkout_head(Some(&mut checkout))?;
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn is_no_merge_base(error: &git2::Error) -> bool {
    error.code() == git2::ErrorCode::NotFound
        || error
            .message()
            .to_ascii_lowercase()
            .contains("no merge base")
}

#[cfg(target_os = "android")]
fn ignored_mobile_merge_path(path: &str) -> bool {
    path.is_empty()
        || path == ".git"
        || path == ".metadata"
        || path == ".ssh"
        || path == ".backups"
        || path == "imports"
        || path.starts_with(".git/")
        || path.starts_with(".metadata/")
        || path.starts_with(".ssh/")
        || path.starts_with(".backups/")
        || path.starts_with("imports/")
}

#[cfg(target_os = "android")]
fn add_workdir_file_to_index(
    repo: &git2::Repository,
    index: &mut git2::Index,
    relative_path: &str,
) -> Result<()> {
    if ignored_mobile_merge_path(relative_path) {
        return Ok(());
    }
    let Some(workdir) = repo.workdir() else {
        return Ok(());
    };
    let full_path = workdir.join(relative_path);
    if !full_path.is_file() {
        return Ok(());
    }

    let content = std::fs::read(&full_path)?;
    let entry = git2::IndexEntry {
        ctime: git2::IndexTime::new(0, 0),
        mtime: git2::IndexTime::new(0, 0),
        dev: 0,
        ino: 0,
        mode: 0o100644,
        uid: 0,
        gid: 0,
        file_size: content.len().try_into().unwrap_or(u32::MAX),
        id: git2::Oid::zero(),
        flags: 0,
        flags_extended: 0,
        path: relative_path.as_bytes().to_vec(),
    };
    index.add_frombuffer(&entry, &content)?;
    Ok(())
}

#[cfg(target_os = "android")]
fn changed_workdir_paths(repo: &git2::Repository) -> Result<HashSet<String>> {
    let mut options = git2::StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .exclude_submodules(true);
    let statuses = repo.statuses(Some(&mut options))?;
    let mut paths = HashSet::new();
    for entry in statuses.iter() {
        let status = entry.status();
        if !(status.is_index_new()
            || status.is_index_modified()
            || status.is_index_renamed()
            || status.is_index_typechange()
            || status.is_wt_new()
            || status.is_wt_modified()
            || status.is_wt_renamed()
            || status.is_wt_typechange())
        {
            continue;
        }
        let Some(path) = entry.path() else {
            continue;
        };
        if !ignored_mobile_merge_path(path) {
            paths.insert(path.to_string());
        }
    }
    Ok(paths)
}

#[cfg(target_os = "android")]
fn add_changed_workdir_files_to_index(
    repo: &git2::Repository,
    index: &mut git2::Index,
) -> Result<()> {
    for path in changed_workdir_paths(repo)? {
        add_workdir_file_to_index(repo, index, &path)?;
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn commit_remote_tree_with_workdir_changes(
    repo: &git2::Repository,
    branch: &str,
    remote_commit: &git2::Commit<'_>,
) -> Result<bool> {
    if changed_workdir_paths(repo)?.is_empty() {
        return Ok(false);
    }
    let remote_tree = remote_commit.tree()?;
    let mut index = repo.index()?;
    index.read_tree(&remote_tree)?;
    add_changed_workdir_files_to_index(repo, &mut index)?;
    let tree_id = index.write_tree_to(repo)?;
    if tree_id == remote_commit.tree_id() {
        return Ok(false);
    }
    let tree = repo.find_tree(tree_id)?;
    let sig = git2::Signature::now("GitMemo", "bot@gitmemo.dev")?;
    let ref_name = format!("refs/heads/{branch}");
    drop(index);
    repo.reference(
        &ref_name,
        remote_commit.id(),
        true,
        "fast-forward before mobile local commit",
    )?;
    repo.set_head(&ref_name)?;
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        "merge: mobile local changes",
        &tree,
        &[remote_commit],
    )?;
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.force().remove_untracked(true);
    repo.checkout_head(Some(&mut checkout))?;
    Ok(true)
}

#[cfg(target_os = "android")]
fn merge_unrelated_token_histories(
    repo: &git2::Repository,
    branch: &str,
    head_commit: &git2::Commit<'_>,
    remote_commit: &git2::Commit<'_>,
) -> Result<bool> {
    eprintln!(
        "[gitmemo] Android sync is connecting unrelated histories: local {}, remote {}",
        head_commit.id(),
        remote_commit.id()
    );
    let remote_tree = remote_commit.tree()?;
    let mut index = repo.index()?;
    index.read_tree(&remote_tree)?;

    let head_tree = head_commit.tree()?;
    let mut walk_error: Option<git2::Error> = None;
    head_tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
        let Some(name) = entry.name() else {
            return git2::TreeWalkResult::Ok;
        };
        let path = format!("{root}{name}");
        if ignored_mobile_merge_path(&path) || entry.kind() != Some(git2::ObjectType::Blob) {
            return git2::TreeWalkResult::Ok;
        }
        let entry = git2::IndexEntry {
            ctime: git2::IndexTime::new(0, 0),
            mtime: git2::IndexTime::new(0, 0),
            dev: 0,
            ino: 0,
            mode: entry.filemode() as u32,
            uid: 0,
            gid: 0,
            file_size: 0,
            id: entry.id(),
            flags: 0,
            flags_extended: 0,
            path: path.into_bytes(),
        };
        if let Err(e) = index.add(&entry) {
            walk_error = Some(e);
            return git2::TreeWalkResult::Abort;
        }
        git2::TreeWalkResult::Ok
    })?;
    if let Some(e) = walk_error {
        return Err(e.into());
    }

    add_changed_workdir_files_to_index(repo, &mut index)?;

    let tree_id = index.write_tree_to(repo)?;
    let tree = repo.find_tree(tree_id)?;
    let sig = git2::Signature::now("GitMemo", "bot@gitmemo.dev")?;
    let ref_name = format!("refs/heads/{branch}");
    if repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(ToOwned::to_owned))
        != Some(branch.to_string())
    {
        repo.set_head(&ref_name)?;
    }
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        "merge: mobile connect remote history",
        &tree,
        &[head_commit, remote_commit],
    )?;
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.force().remove_untracked(true);
    repo.checkout_head(Some(&mut checkout))?;
    eprintln!("[gitmemo] Android sync connected unrelated histories");
    Ok(true)
}

#[cfg(target_os = "android")]
fn merge_token_remote_into_local(repo: &git2::Repository, branch: &str) -> Result<bool> {
    ensure_token_branch(repo, branch)?;
    let remote_ref_name = format!("refs/remotes/origin/{branch}");
    let remote_ref = match repo.find_reference(&remote_ref_name) {
        Ok(reference) => reference,
        Err(_) => return Ok(false),
    };
    let remote_oid = match remote_ref.target() {
        Some(oid) => oid,
        None => return Ok(false),
    };
    let remote_commit = repo.find_commit(remote_oid)?;
    let Some(head_commit) = current_head_commit(repo)? else {
        set_branch_to_commit(repo, branch, &remote_commit)?;
        return Ok(true);
    };

    let (ahead, behind) = match repo.graph_ahead_behind(head_commit.id(), remote_oid) {
        Ok(pair) => pair,
        Err(e) if is_no_merge_base(&e) => {
            eprintln!(
                "[gitmemo] Android sync found no merge base between local {} and remote {}",
                head_commit.id(),
                remote_oid
            );
            return merge_unrelated_token_histories(repo, branch, &head_commit, &remote_commit);
        }
        Err(e) => return Err(e.into()),
    };
    if behind == 0 {
        return Ok(false);
    }
    if ahead == 0 {
        if commit_remote_tree_with_workdir_changes(repo, branch, &remote_commit)? {
            return Ok(true);
        }
        set_branch_to_commit(repo, branch, &remote_commit)?;
        return Ok(true);
    }

    let mut options = git2::MergeOptions::new();
    options.file_favor(git2::FileFavor::Ours);
    let mut index = repo.merge_commits(&head_commit, &remote_commit, Some(&options))?;
    if index.has_conflicts() {
        let local_tree = head_commit.tree()?;
        let conflict_paths: Vec<String> = index
            .conflicts()?
            .filter_map(|conflict| conflict.ok())
            .filter_map(|conflict| {
                conflict
                    .our
                    .or(conflict.ancestor)
                    .or(conflict.their)
                    .and_then(|entry| String::from_utf8(entry.path).ok())
            })
            .collect();
        for path in conflict_paths {
            if ignored_mobile_merge_path(&path) {
                continue;
            }
            if let Ok(entry) = local_tree.get_path(Path::new(&path)) {
                index.add(&git2::IndexEntry {
                    ctime: git2::IndexTime::new(0, 0),
                    mtime: git2::IndexTime::new(0, 0),
                    dev: 0,
                    ino: 0,
                    mode: entry.filemode() as u32,
                    uid: 0,
                    gid: 0,
                    file_size: 0,
                    id: entry.id(),
                    flags: 0,
                    flags_extended: 0,
                    path: path.into_bytes(),
                })?;
            } else {
                index.remove_path(Path::new(&path))?;
            }
        }
    }
    add_changed_workdir_files_to_index(repo, &mut index)?;

    if index.has_conflicts() {
        anyhow::bail!("merge conflict could not be resolved automatically");
    }

    let tree_id = index.write_tree_to(repo)?;
    let tree = repo.find_tree(tree_id)?;

    let sig = git2::Signature::now("GitMemo", "bot@gitmemo.dev")?;
    let ref_name = format!("refs/heads/{branch}");
    if repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(ToOwned::to_owned))
        != Some(branch.to_string())
    {
        repo.set_head(&ref_name)?;
    }
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        "merge: mobile remote history",
        &tree,
        &[&head_commit, &remote_commit],
    )?;
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.force().remove_untracked(true);
    repo.checkout_head(Some(&mut checkout))?;
    Ok(true)
}

#[cfg(target_os = "android")]
fn push_branch_with_token(repo: &git2::Repository, branch: &str, token: &str) -> Result<()> {
    let mut remote = repo.find_remote("origin")?;
    let remote_url = remote.url().map(ToOwned::to_owned);
    let mut options = token_push_options(token, remote_url.as_deref());
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    remote.push(&[refspec.as_str()], Some(&mut options))?;
    if let Ok(head) = repo.head().and_then(|head| head.peel_to_commit()) {
        repo.reference(
            &format!("refs/remotes/origin/{branch}"),
            head.id(),
            true,
            "update origin tracking after token push",
        )?;
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn commit_and_push_with_token(repo_path: &Path, message: &str, token: &str) -> Result<SyncResult> {
    let _ = ensure_repo_clean(repo_path);
    let repo = git2::Repository::open(repo_path)?;
    let branch = configured_branch(repo_path);
    ensure_token_branch(&repo, &branch)?;

    let mut index = repo.index()?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;

    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;
    let sig = git2::Signature::now("GitMemo", "bot@gitmemo.dev")?;

    let committed = if let Some(parent) = current_head_commit(&repo)? {
        if parent.tree()?.id() == tree_id {
            false
        } else {
            repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])?;
            true
        }
    } else {
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[])?;
        true
    };

    if has_remote(repo_path) {
        if fetch_branch_with_token(&repo, &branch, token)? {
            merge_token_remote_into_local(&repo, &branch)?;
        }
        match push_branch_with_token(&repo, &branch, token) {
            Ok(()) => Ok(SyncResult {
                committed,
                pushed: true,
                push_error: None,
            }),
            Err(e) => Ok(SyncResult {
                committed,
                pushed: false,
                push_error: Some(crate::utils::sanitize::git_error_for_user(e.to_string())),
            }),
        }
    } else {
        Ok(SyncResult {
            committed,
            pushed: false,
            push_error: None,
        })
    }
}

#[cfg(target_os = "android")]
fn pull_with_token(repo_path: &Path, token: &str) -> Result<bool> {
    if !has_remote(repo_path) {
        return Ok(false);
    }
    let repo = git2::Repository::open(repo_path)?;
    let branch = configured_branch(repo_path);
    if !fetch_branch_with_token(&repo, &branch, token)? {
        return Ok(false);
    }
    merge_token_remote_into_local(&repo, &branch)
}

#[cfg(target_os = "android")]
fn ahead_behind_git2(repo_path: &Path) -> Option<(usize, usize)> {
    if !has_remote(repo_path) {
        return Some((0, 0));
    }
    let repo = git2::Repository::open(repo_path).ok()?;
    let head = repo.head().ok()?.peel_to_commit().ok()?.id();
    let branch = configured_branch(repo_path);
    let mut candidates = vec![format!("refs/remotes/origin/{branch}")];
    if branch != "main" {
        candidates.push("refs/remotes/origin/main".to_string());
    }
    if branch != "master" {
        candidates.push("refs/remotes/origin/master".to_string());
    }

    for candidate in candidates {
        let Some(remote) = repo
            .find_reference(&candidate)
            .ok()
            .and_then(|reference| reference.target())
        else {
            continue;
        };
        if let Ok(pair) = repo.graph_ahead_behind(head, remote) {
            return Some(pair);
        }
    }
    None
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
    let _ = git_ok(
        repo_path,
        &[
            "branch",
            "--set-upstream-to",
            &format!("origin/{}", branch),
            branch,
        ],
    );
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

    if let Some(parent) = current_head_commit(&repo)? {
        if parent.tree()?.id() == tree_id {
            return Ok(SyncResult::nothing());
        }
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])?;
    } else {
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[])?;
    }

    Ok(SyncResult {
        committed: true,
        pushed: false,
        push_error: None,
    })
}

pub fn commit_and_push(repo_path: &Path, message: &str) -> Result<SyncResult> {
    #[cfg(target_os = "android")]
    if let Some(token) = configured_access_token(repo_path) {
        return commit_and_push_with_token(repo_path, message, &token);
    }

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

    let committed = if let Some(parent) = current_head_commit(&repo)? {
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
        Ok(SyncResult {
            committed,
            pushed,
            push_error,
        })
    } else {
        Ok(SyncResult {
            committed,
            pushed: false,
            push_error: None,
        })
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

    #[cfg(target_os = "android")]
    if let Some(pair) = ahead_behind_git2(repo_path) {
        return Ok(pair);
    }

    for target in build_tracking_targets(repo_path) {
        if let Some((ahead, behind)) =
            rev_list_left_right_count(repo_path, &format!("HEAD...{}", target))
        {
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
    let repo = git2::Repository::open(repo_path).ok()?;
    let head = repo.head().ok()?;
    head.shorthand()
        .map(|branch| branch.to_string())
        .filter(|branch| !branch.is_empty())
}

/// Run `git rev-list --count <refspec>` and return count if command succeeds
fn rev_list_count(repo_path: &Path, refspec: &str) -> Option<usize> {
    git_cmd(repo_path, &["rev-list", "--count", refspec])
        .ok()?
        .parse()
        .ok()
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
            let lines: Vec<String> = stdout
                .lines()
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
    let (pushed, push_error) = with_repo_network_lock(repo_path, || do_push_with_retry(repo_path));
    Ok(SyncResult {
        committed: false,
        pushed,
        push_error,
    })
}

#[allow(dead_code)]
pub fn remote_branch_exists(repo_path: &Path, branch: &str) -> Result<bool> {
    let (ok, stdout, stderr) = git_raw(repo_path, &["ls-remote", "--heads", "origin", branch])?;
    if ok {
        Ok(!stdout.trim().is_empty())
    } else {
        let message = if stderr.trim().is_empty() {
            "remote branch check failed".to_string()
        } else {
            stderr.trim().to_string()
        };
        anyhow::bail!(message)
    }
}

#[allow(dead_code)]
pub fn fetch_branch(repo_path: &Path, branch: &str) -> Result<(bool, String, String)> {
    let refspec = format!("{}:refs/remotes/origin/{}", branch, branch);
    git_raw(repo_path, &["fetch", "origin", &refspec])
}

#[allow(dead_code)]
pub fn checkout_remote_branch(repo_path: &Path, branch: &str) -> Result<()> {
    git_cmd(
        repo_path,
        &["checkout", "-B", branch, &format!("origin/{}", branch)],
    )?;
    Ok(())
}

#[allow(dead_code)]
pub fn remote_ref_exists(repo_path: &Path, remote_ref: &str) -> bool {
    git_ok(repo_path, &["rev-parse", remote_ref])
}

#[allow(dead_code)]
pub fn rebase_onto_remote(repo_path: &Path, branch: &str) -> Result<(bool, String, String)> {
    git_raw(repo_path, &["rebase", &format!("origin/{}", branch)])
}

#[allow(dead_code)]
pub fn abort_rebase(repo_path: &Path) {
    let _ = git_ok(repo_path, &["rebase", "--abort"]);
}

#[allow(dead_code)]
pub fn reset_hard_to_remote(repo_path: &Path, branch: &str) {
    let _ = git_ok(
        repo_path,
        &["reset", "--hard", &format!("origin/{}", branch)],
    );
}

#[allow(dead_code)]
pub fn push_branch(repo_path: &Path, branch: &str) -> Result<(bool, Option<String>)> {
    Ok(with_repo_network_lock(repo_path, || {
        match git_raw(
            repo_path,
            &["push", "-u", "origin", &format!("HEAD:{}", branch)],
        ) {
            Ok((true, _, _)) => (true, None),
            Ok((false, stdout, stderr)) => {
                let combined = format!("{stdout} {stderr}");
                if combined.contains("Everything up-to-date") || combined.contains("up to date") {
                    (true, None)
                } else {
                    (
                        false,
                        Some(crate::utils::sanitize::git_error_for_user(
                            if stderr.is_empty() {
                                if stdout.is_empty() {
                                    "push failed".to_string()
                                } else {
                                    stdout
                                }
                            } else {
                                stderr
                            },
                        )),
                    )
                }
            }
            Err(e) => (
                false,
                Some(crate::utils::sanitize::git_error_for_user(e.to_string())),
            ),
        }
    }))
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
        eprintln!(
            "[gitmemo] Detected stuck rebase in {}, aborting...",
            repo_path.display()
        );
        if git_ok(repo_path, &["rebase", "--abort"]) {
            eprintln!("[gitmemo] Rebase aborted successfully");
        } else {
            let _ = git_ok(repo_path, &["rebase", "--quit"]);
            eprintln!("[gitmemo] Rebase --abort failed, used --quit as fallback");
        }
        return Ok(true);
    }

    if merge_head {
        eprintln!(
            "[gitmemo] Detected stuck merge in {}, aborting...",
            repo_path.display()
        );
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
    #[cfg(target_os = "android")]
    if let Some(token) = configured_access_token(repo_path) {
        return with_repo_network_lock(repo_path, || pull_with_token(repo_path, &token));
    }

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
    match git_raw(
        repo_path,
        &[
            "merge",
            "-X",
            "theirs",
            &format!("origin/{}", branch),
            "-m",
            "auto: merge remote (theirs)",
        ],
    ) {
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
    #[cfg(target_os = "android")]
    if let Some(token) = configured_access_token(repo_path) {
        return Ok(with_repo_network_lock(repo_path, || {
            let repo = git2::Repository::open(repo_path)?;
            fetch_branch_with_token(&repo, &configured_branch(repo_path), &token)
        })?);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worktree_content_size_uses_git_visible_files() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path();

        if Command::new("git")
            .arg("init")
            .current_dir(repo)
            .status()
            .map(|status| !status.success())
            .unwrap_or(true)
        {
            return;
        }

        let gitignore = ".metadata/\nimports/\n";
        std::fs::write(repo.join(".gitignore"), gitignore).unwrap();
        std::fs::write(repo.join("tracked.md"), "tracked").unwrap();
        std::fs::write(repo.join("untracked.md"), "untracked").unwrap();

        std::fs::create_dir_all(repo.join(".metadata")).unwrap();
        std::fs::write(repo.join(".metadata").join("index.db"), "local index").unwrap();

        std::fs::create_dir_all(repo.join("imports")).unwrap();
        std::fs::write(repo.join("imports").join("ignored.md"), "ignored import").unwrap();

        Command::new("git")
            .args(["add", ".gitignore", "tracked.md"])
            .current_dir(repo)
            .status()
            .unwrap();

        let expected = (gitignore.len() + "tracked".len() + "untracked".len()) as u64;
        assert_eq!(worktree_content_size(repo), expected);
        assert_eq!(tracked_file_count(repo), 2);
        assert!(repository_storage_size(repo) > 0);
    }

    #[test]
    fn fetch_branch_creates_origin_tracking_ref() {
        let remote_tmp = tempfile::tempdir().unwrap();
        let remote = remote_tmp.path();
        Command::new("git")
            .args(["init", "--bare"])
            .current_dir(remote)
            .status()
            .unwrap();

        let source_tmp = tempfile::tempdir().unwrap();
        let source = source_tmp.path();
        Command::new("git")
            .arg("init")
            .current_dir(source)
            .status()
            .unwrap();
        Command::new("git")
            .args(["branch", "-m", "main"])
            .current_dir(source)
            .status()
            .unwrap();
        Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(source)
            .status()
            .unwrap();
        Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(source)
            .status()
            .unwrap();
        std::fs::write(source.join("remote.md"), "remote").unwrap();
        Command::new("git")
            .args(["add", "remote.md"])
            .current_dir(source)
            .status()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "remote init"])
            .current_dir(source)
            .status()
            .unwrap();
        Command::new("git")
            .args(["remote", "add", "origin", remote.to_str().unwrap()])
            .current_dir(source)
            .status()
            .unwrap();
        Command::new("git")
            .args(["push", "origin", "main"])
            .current_dir(source)
            .status()
            .unwrap();

        let local_tmp = tempfile::tempdir().unwrap();
        let local = local_tmp.path();
        init_repo(local, remote.to_str().unwrap()).unwrap();

        assert!(remote_branch_exists(local, "main").unwrap());
        assert!(fetch_branch(local, "main").unwrap().0);
        assert!(remote_ref_exists(local, "origin/main"));
        checkout_remote_branch(local, "main").unwrap();
        assert!(local.join("remote.md").exists());
    }
}
