use serde::{Deserialize, Serialize};
#[cfg(target_os = "android")]
use std::cell::RefCell;
#[cfg(target_os = "android")]
use std::io::Write;
#[cfg(target_os = "android")]
use std::path::PathBuf;
#[cfg(target_os = "android")]
use std::rc::Rc;
use tauri::AppHandle;
#[cfg(target_os = "android")]
use tauri::Manager;

#[derive(Debug, Serialize)]
pub struct MobileGitDiagnosticStep {
    pub name: String,
    pub ok: bool,
    pub message: String,
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Debug, Deserialize)]
pub struct MobileGitSpikeRequest {
    pub remote_url: String,
    #[serde(default = "default_branch")]
    pub branch: String,
    #[serde(default = "default_username")]
    pub username: String,
    pub token: String,
    #[serde(default = "default_note_content")]
    pub note_content: String,
    #[serde(default)]
    pub reset: bool,
}

#[derive(Debug, Serialize)]
pub struct MobileGitSpikeStep {
    pub name: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct MobileGitSpikeResult {
    pub success: bool,
    pub repo_path: String,
    pub note_path: Option<String>,
    pub commit_id: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub steps: Vec<MobileGitSpikeStep>,
}

fn default_branch() -> String {
    "main".to_string()
}

fn default_username() -> String {
    "x-access-token".to_string()
}

fn default_note_content() -> String {
    "Android Git sync spike note".to_string()
}

#[cfg(target_os = "android")]
fn diagnostic_step(
    steps: &mut Vec<MobileGitDiagnosticStep>,
    name: impl Into<String>,
    ok: bool,
    message: impl Into<String>,
) {
    steps.push(MobileGitDiagnosticStep {
        name: name.into(),
        ok,
        message: message.into(),
    });
}

#[cfg(target_os = "android")]
fn short_oid(oid: git2::Oid) -> String {
    oid.to_string().chars().take(8).collect()
}

#[cfg(target_os = "android")]
fn count_workdir_changes(repo: &git2::Repository) -> anyhow::Result<usize> {
    let mut options = git2::StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .exclude_submodules(true);
    let statuses = repo.statuses(Some(&mut options))?;
    Ok(statuses
        .iter()
        .filter_map(|entry| entry.path().map(ToOwned::to_owned))
        .filter(|path| {
            !(path == ".git"
                || path == ".metadata"
                || path == ".ssh"
                || path == ".backups"
                || path == "imports"
                || path.starts_with(".git/")
                || path.starts_with(".metadata/")
                || path.starts_with(".ssh/")
                || path.starts_with(".backups/")
                || path.starts_with("imports/"))
        })
        .count())
}

#[cfg(target_os = "android")]
fn push_options_with_status<'a>(
    username: &'a str,
    token: &'a str,
    remote_url: Option<&str>,
    rejected: Rc<RefCell<Option<String>>>,
) -> git2::PushOptions<'a> {
    configure_android_git_ssl();
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(
        move |url: &str, username_from_url: Option<&str>, _allowed: git2::CredentialType| {
            let fallback = if username == "x-access-token" {
                default_username_for_remote(url, username_from_url)
            } else {
                username_from_url
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(username)
                    .to_string()
            };
            git2::Cred::userpass_plaintext(&fallback, token)
        },
    );
    callbacks.push_update_reference(move |reference, status| {
        if let Some(status) = status {
            *rejected.borrow_mut() = Some(format!("{reference}: {status}"));
            return Err(git2::Error::from_str(status));
        }
        Ok(())
    });
    install_host_limited_certificate_fallback(&mut callbacks, remote_url);

    let mut options = git2::PushOptions::new();
    options.remote_callbacks(callbacks);
    options
}

#[cfg(target_os = "android")]
fn probe_push_auth(
    repo: &git2::Repository,
    branch: &str,
    username: &str,
    token: &str,
) -> anyhow::Result<String> {
    let origin = repo.find_remote("origin")?;
    let remote_url = origin
        .url()
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow::anyhow!("origin URL is missing"))?;
    drop(origin);

    let remote_name = "__gitmemo_mobile_diagnostic_probe";
    let _ = repo.remote_delete(remote_name);
    let mut remote = repo.remote(remote_name, &remote_url)?;
    let rejected = Rc::new(RefCell::new(None::<String>));
    let mut options =
        push_options_with_status(username, token, Some(&remote_url), rejected.clone());
    let probe_source_ref = format!("refs/remotes/origin/{branch}");
    let refspec = format!("{probe_source_ref}:refs/heads/__gitmemo_mobile_diagnostic_probe");
    let push_result = remote.push(&[refspec.as_str()], Some(&mut options));
    match push_result {
        Ok(()) => {
            let mut delete_options = push_options(username, token, Some(&remote_url));
            let delete_refspec = ":refs/heads/__gitmemo_mobile_diagnostic_probe";
            let _ = remote.push(&[delete_refspec], Some(&mut delete_options));
            let _ = repo.remote_delete(remote_name);
            Ok("push permission verified with temporary probe ref".to_string())
        }
        Err(e) => {
            let _ = repo.remote_delete(remote_name);
            if let Some(status) = rejected.borrow().as_ref() {
                anyhow::bail!(
                    "push rejected: {}",
                    gitmemo_core::utils::sanitize::git_error_for_user(status)
                );
            }
            anyhow::bail!(
                "{}",
                gitmemo_core::utils::sanitize::git_error_for_user(e.to_string())
            )
        }
    }
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
impl MobileGitSpikeResult {
    fn new(repo_path: String) -> Self {
        Self {
            success: true,
            repo_path,
            note_path: None,
            commit_id: None,
            ahead: 0,
            behind: 0,
            steps: Vec::new(),
        }
    }

    fn add_ok(&mut self, name: &str, message: impl Into<String>) {
        self.steps.push(MobileGitSpikeStep {
            name: name.to_string(),
            ok: true,
            message: message.into(),
        });
    }
}

#[cfg(target_os = "android")]
fn default_username_for_remote(remote_url: &str, username_from_url: Option<&str>) -> String {
    if let Some(username) = username_from_url.filter(|value| !value.trim().is_empty()) {
        return username.to_string();
    }

    let lower_url = remote_url.to_ascii_lowercase();
    if lower_url.contains("gitee.com") {
        if let Some(owner) = remote_url
            .split_once("://")
            .and_then(|(_, rest)| rest.split_once('/'))
            .and_then(|(_, path)| path.split('/').next())
            .filter(|owner| !owner.trim().is_empty())
        {
            return owner.to_string();
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
fn configure_android_git_ssl() {
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
        if !std::path::Path::new(cert_dir).is_dir() {
            continue;
        }
        match unsafe { git2::opts::set_ssl_cert_dir(cert_dir) } {
            Ok(()) => return,
            Err(e) => eprintln!("[gitmemo] Failed to use Android CA directory {cert_dir}: {e}"),
        }
    }
}

#[cfg(target_os = "android")]
fn android_ca_bundle_path() -> Option<PathBuf> {
    let bundle = std::env::temp_dir().join("gitmemo-android-ca-bundle.pem");

    let mut output = std::fs::OpenOptions::new()
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
fn fetch_options<'a>(
    username: &'a str,
    token: &'a str,
    remote_url: Option<&str>,
) -> git2::FetchOptions<'a> {
    configure_android_git_ssl();
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(
        move |url: &str, username_from_url: Option<&str>, _allowed: git2::CredentialType| {
            let fallback = if username == "x-access-token" {
                default_username_for_remote(url, username_from_url)
            } else {
                username_from_url
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(username)
                    .to_string()
            };
            git2::Cred::userpass_plaintext(&fallback, token)
        },
    );
    install_host_limited_certificate_fallback(&mut callbacks, remote_url);

    let mut options = git2::FetchOptions::new();
    options.remote_callbacks(callbacks);
    options
}

#[cfg(target_os = "android")]
fn push_options<'a>(
    username: &'a str,
    token: &'a str,
    remote_url: Option<&str>,
) -> git2::PushOptions<'a> {
    configure_android_git_ssl();
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(
        move |url: &str, username_from_url: Option<&str>, _allowed: git2::CredentialType| {
            let fallback = if username == "x-access-token" {
                default_username_for_remote(url, username_from_url)
            } else {
                username_from_url
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(username)
                    .to_string()
            };
            git2::Cred::userpass_plaintext(&fallback, token)
        },
    );
    install_host_limited_certificate_fallback(&mut callbacks, remote_url);

    let mut options = git2::PushOptions::new();
    options.remote_callbacks(callbacks);
    options
}

#[cfg(target_os = "android")]
fn open_or_clone_repo(
    repo_path: &std::path::Path,
    request: &MobileGitSpikeRequest,
) -> anyhow::Result<(git2::Repository, bool)> {
    if request.reset && repo_path.exists() {
        std::fs::remove_dir_all(repo_path)?;
    }

    if repo_path.join(".git").exists() {
        let repo = git2::Repository::open(repo_path)?;
        if let Ok(remote) = repo.find_remote("origin") {
            if remote.url().unwrap_or_default() != request.remote_url {
                drop(remote);
                repo.remote_set_url("origin", &request.remote_url)?;
            }
        } else {
            repo.remote("origin", &request.remote_url)?;
        }
        return Ok((repo, false));
    }

    if repo_path.exists() {
        anyhow::bail!("spike path exists but is not a Git repository");
    }

    let mut builder = git2::build::RepoBuilder::new();
    let options = fetch_options(&request.username, &request.token, Some(&request.remote_url));
    builder.fetch_options(options);
    builder.branch(&request.branch);
    let repo = builder.clone(&request.remote_url, repo_path)?;
    Ok((repo, true))
}

#[cfg(target_os = "android")]
fn fetch_branch(
    repo: &git2::Repository,
    branch: &str,
    username: &str,
    token: &str,
) -> anyhow::Result<()> {
    let mut remote = repo.find_remote("origin")?;
    let remote_url = remote.url().map(ToOwned::to_owned);
    let mut options = fetch_options(username, token, remote_url.as_deref());
    let refspec = format!("refs/heads/{branch}:refs/remotes/origin/{branch}");
    remote.fetch(&[refspec.as_str()], Some(&mut options), None)?;
    Ok(())
}

#[cfg(target_os = "android")]
fn checkout_branch(repo: &git2::Repository, branch: &str) -> anyhow::Result<()> {
    repo.set_head(&format!("refs/heads/{branch}"))?;
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.force();
    repo.checkout_head(Some(&mut checkout))?;
    Ok(())
}

#[cfg(target_os = "android")]
fn fast_forward_to_remote(repo: &git2::Repository, branch: &str) -> anyhow::Result<(usize, usize)> {
    let remote_ref_name = format!("refs/remotes/origin/{branch}");
    let remote_ref = repo.find_reference(&remote_ref_name)?;
    let remote_oid = remote_ref
        .target()
        .ok_or_else(|| anyhow::anyhow!("remote ref has no target"))?;
    let remote_commit = repo.find_commit(remote_oid)?;
    let local_ref_name = format!("refs/heads/{branch}");

    match repo.find_reference(&local_ref_name) {
        Ok(mut local_ref) => {
            let local_oid = local_ref
                .target()
                .ok_or_else(|| anyhow::anyhow!("local branch has no target"))?;
            let (ahead, behind) = repo.graph_ahead_behind(local_oid, remote_oid)?;
            if ahead == 0 && behind > 0 {
                local_ref.set_target(remote_oid, "fast-forward from origin")?;
                checkout_branch(repo, branch)?;
                Ok((0, 0))
            } else if ahead > 0 && behind > 0 {
                anyhow::bail!("local and remote have diverged: ahead {ahead}, behind {behind}");
            } else {
                checkout_branch(repo, branch)?;
                Ok((ahead, behind))
            }
        }
        Err(_) => {
            repo.branch(branch, &remote_commit, true)?;
            checkout_branch(repo, branch)?;
            Ok((0, 0))
        }
    }
}

#[cfg(target_os = "android")]
fn commit_all(repo: &git2::Repository, message: &str) -> anyhow::Result<Option<git2::Oid>> {
    let mut index = repo.index()?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;

    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;
    let sig = git2::Signature::now("GitMemo", "bot@gitmemo.dev")?;

    if let Ok(head) = repo.head() {
        let parent = head.peel_to_commit()?;
        if parent.tree()?.id() == tree_id {
            return Ok(None);
        }
        Ok(Some(repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            message,
            &tree,
            &[&parent],
        )?))
    } else {
        Ok(Some(repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            message,
            &tree,
            &[],
        )?))
    }
}

#[cfg(target_os = "android")]
fn push_branch(
    repo: &git2::Repository,
    branch: &str,
    username: &str,
    token: &str,
) -> anyhow::Result<()> {
    let mut remote = repo.find_remote("origin")?;
    let remote_url = remote.url().map(ToOwned::to_owned);
    let mut options = push_options(username, token, remote_url.as_deref());
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    remote.push(&[refspec.as_str()], Some(&mut options))?;
    Ok(())
}

#[cfg(target_os = "android")]
fn ahead_behind(repo: &git2::Repository, branch: &str) -> anyhow::Result<(usize, usize)> {
    let head = repo.head()?.peel_to_commit()?.id();
    let remote_ref = repo.find_reference(&format!("refs/remotes/origin/{branch}"))?;
    let remote = remote_ref
        .target()
        .ok_or_else(|| anyhow::anyhow!("remote ref has no target"))?;
    Ok(repo.graph_ahead_behind(head, remote)?)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn mobile_git_spike_sync(
    app: AppHandle,
    request: MobileGitSpikeRequest,
) -> Result<MobileGitSpikeResult, String> {
    if request.remote_url.trim().is_empty() {
        return Err("remote_url is required".into());
    }
    if request.token.trim().is_empty() {
        return Err("token is required for HTTPS spike sync".into());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir unavailable: {e}"))?;
    let repo_path = app_data_dir.join("git-spike-repo");
    std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;

    let mut result = MobileGitSpikeResult::new(repo_path.to_string_lossy().into_owned());
    let run = (|| -> anyhow::Result<()> {
        let (repo, cloned) = open_or_clone_repo(&repo_path, &request)?;
        result.add_ok(
            "repo",
            if cloned {
                "repository cloned"
            } else {
                "repository opened"
            },
        );

        fetch_branch(&repo, &request.branch, &request.username, &request.token)?;
        let (ahead, behind) = fast_forward_to_remote(&repo, &request.branch)?;
        result.ahead = ahead;
        result.behind = behind;
        result.add_ok(
            "pull",
            format!("remote fetched; ahead {ahead}, behind {behind}"),
        );

        gitmemo_core::storage::files::create_directory_structure(&repo_path)?;
        let note_path =
            gitmemo_core::storage::files::create_scratch(&repo_path, &request.note_content)?;
        result.note_path = Some(note_path.clone());
        result.add_ok("note", format!("scratch note created: {note_path}"));

        if let Some(commit_id) = commit_all(&repo, "spike: android git sync note")? {
            result.commit_id = Some(commit_id.to_string());
            result.add_ok("commit", commit_id.to_string());
        } else {
            result.add_ok("commit", "no changes to commit");
        }

        push_branch(&repo, &request.branch, &request.username, &request.token)?;
        let head = repo.head()?.peel_to_commit()?.id();
        repo.reference(
            &format!("refs/remotes/origin/{}", request.branch),
            head,
            true,
            "update origin tracking after spike push",
        )?;
        let (ahead, behind) = ahead_behind(&repo, &request.branch)?;
        result.ahead = ahead;
        result.behind = behind;
        result.add_ok("push", format!("pushed; ahead {ahead}, behind {behind}"));

        Ok(())
    })();

    if let Err(e) = run {
        result.success = false;
        result.steps.push(MobileGitSpikeStep {
            name: "error".into(),
            ok: false,
            message: e.to_string(),
        });
    }

    Ok(result)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn mobile_git_diagnose_saved_remote() -> Result<Vec<MobileGitDiagnosticStep>, String> {
    let mut steps = Vec::new();
    let config_path = gitmemo_core::utils::config::Config::config_path();
    let config = gitmemo_core::utils::config::Config::load(&config_path)
        .map_err(|e| format!("Config load failed: {e}"))?;
    let remote_url = config.git.remote.trim().to_string();
    let branch = config.git.branch.trim().to_string();
    let token = config
        .git
        .access_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    diagnostic_step(
        &mut steps,
        "config",
        !remote_url.is_empty() && token.is_some(),
        format!(
            "remote: {}; branch: {}; token: {}",
            if remote_url.is_empty() {
                "(empty)"
            } else {
                remote_url.as_str()
            },
            if branch.is_empty() {
                "(empty)"
            } else {
                branch.as_str()
            },
            if token.is_some() {
                "present"
            } else {
                "missing"
            },
        ),
    );

    for (name, ok, message) in gitmemo_core::storage::git::android_git_ssl_diagnostic() {
        diagnostic_step(&mut steps, name, ok, message);
    }

    let sync_dir = gitmemo_core::storage::files::sync_dir();
    diagnostic_step(
        &mut steps,
        "sync_dir",
        sync_dir.exists(),
        sync_dir.to_string_lossy(),
    );

    if remote_url.is_empty() {
        diagnostic_step(&mut steps, "remote", false, "remote URL is empty");
        return Ok(steps);
    }
    if !remote_url.starts_with("https://") {
        diagnostic_step(
            &mut steps,
            "remote",
            false,
            "Android currently supports HTTPS remotes only",
        );
        return Ok(steps);
    }
    let Some(token) = token else {
        diagnostic_step(&mut steps, "auth", false, "access token is missing");
        return Ok(steps);
    };

    let repo = match git2::Repository::open(&sync_dir) {
        Ok(repo) => {
            diagnostic_step(&mut steps, "repo", true, "repository opened");
            repo
        }
        Err(e) => {
            diagnostic_step(&mut steps, "repo", false, e.to_string());
            return Ok(steps);
        }
    };

    match repo.find_remote("origin") {
        Ok(remote) => diagnostic_step(
            &mut steps,
            "origin",
            remote.url() == Some(remote_url.as_str()),
            format!("origin: {}", remote.url().unwrap_or("(missing url)")),
        ),
        Err(e) => {
            diagnostic_step(&mut steps, "origin", false, e.to_string());
            return Ok(steps);
        }
    }

    let fetch_result = (|| -> anyhow::Result<()> {
        let mut remote = repo.find_remote("origin")?;
        let remote_url = remote.url().map(ToOwned::to_owned);
        let mut options = fetch_options("x-access-token", &token, remote_url.as_deref());
        let refspec = format!("refs/heads/{branch}:refs/remotes/origin/{branch}");
        remote.fetch(&[refspec.as_str()], Some(&mut options), None)?;
        Ok(())
    })();
    match fetch_result {
        Ok(()) => diagnostic_step(&mut steps, "fetch", true, "remote branch fetched"),
        Err(e) => {
            diagnostic_step(&mut steps, "fetch", false, e.to_string());
            return Ok(steps);
        }
    }

    let state = repo.state();
    diagnostic_step(
        &mut steps,
        "repo_state",
        state == git2::RepositoryState::Clean,
        format!("{state:?}"),
    );

    let current_branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(ToOwned::to_owned))
        .unwrap_or_else(|| "(detached or unborn)".to_string());
    diagnostic_step(
        &mut steps,
        "head",
        current_branch == branch,
        format!("current branch: {current_branch}; configured branch: {branch}"),
    );

    let local_commit = match repo.head().and_then(|head| head.peel_to_commit()) {
        Ok(commit) => {
            diagnostic_step(
                &mut steps,
                "local_head",
                true,
                format!(
                    "{} {}",
                    short_oid(commit.id()),
                    commit.summary().unwrap_or("")
                ),
            );
            Some(commit)
        }
        Err(e) => {
            diagnostic_step(&mut steps, "local_head", false, e.to_string());
            None
        }
    };

    let remote_commit = match repo
        .find_reference(&format!("refs/remotes/origin/{branch}"))
        .and_then(|reference| {
            reference
                .target()
                .ok_or_else(|| git2::Error::from_str("remote ref has no target"))
        })
        .and_then(|oid| repo.find_commit(oid))
    {
        Ok(commit) => {
            diagnostic_step(
                &mut steps,
                "remote_head",
                true,
                format!(
                    "{} {}",
                    short_oid(commit.id()),
                    commit.summary().unwrap_or("")
                ),
            );
            Some(commit)
        }
        Err(e) => {
            diagnostic_step(&mut steps, "remote_head", false, e.to_string());
            None
        }
    };

    match count_workdir_changes(&repo) {
        Ok(count) => diagnostic_step(
            &mut steps,
            "worktree",
            true,
            format!("{count} changed/untracked content files"),
        ),
        Err(e) => diagnostic_step(&mut steps, "worktree", false, e.to_string()),
    }

    if let (Some(local), Some(remote)) = (local_commit.as_ref(), remote_commit.as_ref()) {
        match repo.graph_ahead_behind(local.id(), remote.id()) {
            Ok((ahead, behind)) => diagnostic_step(
                &mut steps,
                "history",
                true,
                format!("ahead {ahead}, behind {behind}; common history exists"),
            ),
            Err(e)
                if e.code() == git2::ErrorCode::NotFound
                    || e.message().to_ascii_lowercase().contains("no merge base") =>
            {
                diagnostic_step(
                    &mut steps,
                    "history",
                    true,
                    "ahead/behind unavailable because local and remote have no common ancestor; Android sync will create a merge commit that connects both histories",
                );
            }
            Err(e) => diagnostic_step(&mut steps, "history", false, e.to_string()),
        }

        let merge_check: anyhow::Result<String> = if repo
            .merge_base(local.id(), remote.id())
            .is_ok()
        {
            let mut options = git2::MergeOptions::new();
            options.file_favor(git2::FileFavor::Ours);
            repo.merge_commits(local, remote, Some(&options))
                .map(|index| {
                    if index.has_conflicts() {
                        "merge preview has conflicts; GitMemo will prefer local content for conflicting files".to_string()
                    } else {
                        "merge preview can be created".to_string()
                    }
                })
                .map_err(|e| e.into())
        } else {
            Ok("unrelated-history merge path will be used".to_string())
        };
        match merge_check {
            Ok(message) => diagnostic_step(&mut steps, "merge_preview", true, message),
            Err(e) => diagnostic_step(&mut steps, "merge_preview", false, e.to_string()),
        }
    }

    match probe_push_auth(&repo, &branch, "x-access-token", &token) {
        Ok(message) => diagnostic_step(&mut steps, "push_auth", true, message),
        Err(e) => diagnostic_step(&mut steps, "push_auth", false, e.to_string()),
    }

    Ok(steps)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn mobile_git_spike_sync(
    _app: AppHandle,
    _request: MobileGitSpikeRequest,
) -> Result<MobileGitSpikeResult, String> {
    Err("Mobile Git spike is only available on Android builds".into())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn mobile_git_diagnose_saved_remote() -> Result<Vec<MobileGitDiagnosticStep>, String> {
    Err("Mobile Git diagnostic is only available on Android builds".into())
}
