use anyhow::Result;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Known SSH key filenames to search for (in priority order)
const KEY_NAMES: &[&str] = &["id_ed25519", "id_rsa", "id_ecdsa"];

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
pub struct SshKeyCandidate {
    pub path: String,
    pub public_key: String,
    pub source: String,
    pub recommended: bool,
    pub reason: Option<String>,
}

fn expand_ssh_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let without_quotes = trimmed
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .unwrap_or(trimmed);

    let normalized = without_quotes
        .replace("%d", &dirs::home_dir()?.to_string_lossy())
        .replace("%u", "git");

    if let Some(rest) = normalized.strip_prefix("~/") {
        return Some(dirs::home_dir()?.join(rest));
    }

    Some(PathBuf::from(normalized))
}

fn host_pattern_matches(pattern: &str, host: &str) -> bool {
    let pattern = pattern.trim();
    if pattern.is_empty() || pattern == "*" {
        return true;
    }
    if !pattern.contains('*') {
        return pattern.eq_ignore_ascii_case(host);
    }

    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() == 2 {
        let prefix = parts[0];
        let suffix = parts[1];
        return host.starts_with(prefix) && host.ends_with(suffix);
    }

    let mut remainder = host;
    let mut first = true;
    for part in parts.iter().filter(|p| !p.is_empty()) {
        if first {
            if !remainder.starts_with(part) {
                return false;
            }
            remainder = &remainder[part.len()..];
            first = false;
            continue;
        }

        if let Some(idx) = remainder.find(part) {
            remainder = &remainder[idx + part.len()..];
        } else {
            return false;
        }
    }

    pattern.ends_with('*') || remainder.is_empty()
}

fn find_key_from_ssh_config(host: Option<&str>) -> Option<PathBuf> {
    list_keys_from_ssh_config(host).into_iter().next()
}

fn list_keys_from_ssh_config(host: Option<&str>) -> Vec<PathBuf> {
    let config_path = match dirs::home_dir() {
        Some(home) => home.join(".ssh").join("config"),
        None => return Vec::new(),
    };
    let content = match std::fs::read_to_string(config_path) {
        Ok(content) => content,
        Err(_) => return Vec::new(),
    };

    let mut in_matching_block = host.is_none();
    let mut saw_host_block = false;
    let mut candidates = Vec::new();

    for raw_line in content.lines() {
        let line = raw_line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }

        let mut parts = line.split_whitespace();
        let Some(key) = parts.next() else {
            continue;
        };
        let value = parts.collect::<Vec<_>>().join(" ");

        if key.eq_ignore_ascii_case("Host") {
            saw_host_block = true;
            in_matching_block = host
                .map(|target| {
                    value
                        .split_whitespace()
                        .any(|pattern| host_pattern_matches(pattern, target))
                })
                .unwrap_or(false);
            continue;
        }

        if !key.eq_ignore_ascii_case("IdentityFile") {
            continue;
        }

        if host.is_some() && saw_host_block && !in_matching_block {
            continue;
        }

        if let Some(candidate) = expand_ssh_path(&value).filter(|path| path.exists()) {
            candidates.push(candidate);
        }
    }

    candidates
}

#[allow(dead_code)]
pub fn list_ssh_key_candidates(git_url: &str) -> Vec<SshKeyCandidate> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();
    let host = extract_ssh_host(git_url);
    let recommended = find_existing_key_for_git_url(git_url);

    if let Some(host) = host.as_deref() {
        for key_path in list_keys_from_ssh_config(Some(host)) {
            push_candidate(
                &mut candidates,
                &mut seen,
                key_path,
                "ssh_config",
                recommended.as_deref(),
                Some(format!("Configured for host {host}")),
            );
        }
    }

    for key_path in list_keys_from_ssh_config(None) {
        push_candidate(
            &mut candidates,
            &mut seen,
            key_path,
            "ssh_config",
            recommended.as_deref(),
            Some("Configured in ~/.ssh/config".to_string()),
        );
    }

    if let Some(ssh_dir) = dirs::home_dir().map(|home| home.join(".ssh")) {
        for name in KEY_NAMES {
            push_candidate(
                &mut candidates,
                &mut seen,
                ssh_dir.join(name),
                "default_name",
                recommended.as_deref(),
                Some(format!("Found in ~/.ssh/{name}")),
            );
        }
    }

    candidates
}

#[allow(dead_code)]
fn push_candidate(
    candidates: &mut Vec<SshKeyCandidate>,
    seen: &mut HashSet<PathBuf>,
    key_path: PathBuf,
    source: &str,
    recommended: Option<&Path>,
    reason: Option<String>,
) {
    if !key_path.exists() || !seen.insert(key_path.clone()) {
        return;
    }

    let Ok(public_key) = read_public_key(&key_path) else {
        return;
    };

    let is_recommended = recommended.map(|path| path == key_path).unwrap_or(false);

    candidates.push(SshKeyCandidate {
        path: key_path.to_string_lossy().to_string(),
        public_key,
        source: source.to_string(),
        recommended: is_recommended,
        reason,
    });
}

#[allow(dead_code)]
pub fn generate_key_candidate(git_url: &str) -> Result<SshKeyCandidate> {
    let (key_path, _) = generate_new_key_for_git_url(git_url)?;
    Ok(SshKeyCandidate {
        path: key_path.to_string_lossy().to_string(),
        public_key: read_public_key(&key_path)?,
        source: "generated".to_string(),
        recommended: true,
        reason: Some("Generated for GitMemo setup".to_string()),
    })
}

/// Find an existing SSH private key in ~/.ssh/ or ~/.ssh/config.
pub fn find_existing_key() -> Option<PathBuf> {
    find_key_from_ssh_config(None).or_else(|| {
        let ssh_dir = dirs::home_dir()?.join(".ssh");
        if !ssh_dir.is_dir() {
            return None;
        }
        for name in KEY_NAMES {
            let key = ssh_dir.join(name);
            if key.exists() {
                return Some(key);
            }
        }
        None
    })
}

/// Find an existing SSH private key for a specific git URL.
pub fn find_existing_key_for_git_url(git_url: &str) -> Option<PathBuf> {
    let host = extract_ssh_host(git_url);
    if let Some(host) = host.as_deref() {
        if let Some(key) = find_key_from_ssh_config(Some(host)) {
            return Some(key);
        }
    }
    find_existing_key()
}

#[allow(dead_code)]
pub fn find_or_generate_key() -> Result<(PathBuf, bool)> {
    if let Some(existing) = find_existing_key() {
        return Ok((existing, false));
    }

    generate_new_key(None)
}

/// Find or generate an SSH key for a specific git URL.
pub fn find_or_generate_key_for_git_url(git_url: &str) -> Result<(PathBuf, bool)> {
    if let Some(existing) = find_existing_key_for_git_url(git_url) {
        return Ok((existing, false));
    }

    generate_new_key_for_git_url(git_url)
}

pub fn generate_new_key_for_git_url(git_url: &str) -> Result<(PathBuf, bool)> {
    generate_new_key(extract_ssh_host(git_url).as_deref())
}

fn generate_new_key(host: Option<&str>) -> Result<(PathBuf, bool)> {
    let ssh_dir = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("cannot determine home directory"))?
        .join(".ssh");
    std::fs::create_dir_all(&ssh_dir)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&ssh_dir, std::fs::Permissions::from_mode(0o700))?;
    }

    let key_path = next_generated_key_path(&ssh_dir, host);

    let status = Command::new("ssh-keygen")
        .args([
            "-t",
            "ed25519",
            "-f",
            key_path.to_str().unwrap(),
            "-N",
            "",
            "-C",
            "gitmemo",
        ])
        .status()?;

    if !status.success() {
        anyhow::bail!("ssh-keygen failed");
    }

    Ok((key_path, true))
}

fn next_generated_key_path(ssh_dir: &Path, host: Option<&str>) -> PathBuf {
    let mut stems = vec!["id_ed25519".to_string()];

    if let Some(host) = host {
        let sanitized = host
            .chars()
            .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
            .collect::<String>();
        stems.insert(0, format!("id_ed25519_gitmemo_{sanitized}"));
    } else {
        stems.insert(0, "id_ed25519_gitmemo".to_string());
    }

    for stem in stems {
        let candidate = ssh_dir.join(&stem);
        if !candidate.exists() && !candidate.with_extension("pub").exists() {
            return candidate;
        }
    }

    for index in 1..1000 {
        let stem = host
            .map(|host| {
                let sanitized = host
                    .chars()
                    .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
                    .collect::<String>();
                format!("id_ed25519_gitmemo_{sanitized}_{index}")
            })
            .unwrap_or_else(|| format!("id_ed25519_gitmemo_{index}"));
        let candidate = ssh_dir.join(stem);
        if !candidate.exists() && !candidate.with_extension("pub").exists() {
            return candidate;
        }
    }

    ssh_dir.join("id_ed25519_gitmemo")
}

/// Read the public key content
pub fn read_public_key(key_path: &Path) -> Result<String> {
    let pub_path = key_path.with_extension("pub");
    Ok(std::fs::read_to_string(pub_path)?.trim().to_string())
}

/// Extract the SSH host from a git URL (e.g. "git@github.com:user/repo.git" -> "github.com")
fn extract_ssh_host(url: &str) -> Option<String> {
    // SSH format: git@github.com:user/repo.git
    if let Some(at_pos) = url.find('@') {
        let after_at = &url[at_pos + 1..];
        if let Some(colon_pos) = after_at.find(':') {
            return Some(after_at[..colon_pos].to_string());
        }
    }
    // ssh://git@github.com/user/repo.git
    if let Some(after_scheme) = url.strip_prefix("ssh://") {
        if let Some(at_pos) = after_scheme.find('@') {
            let after_at = &after_scheme[at_pos + 1..];
            let host_end = after_at.find('/').or_else(|| after_at.find(':'));
            if let Some(end) = host_end {
                return Some(after_at[..end].to_string());
            }
        }
    }
    None
}

/// Test SSH connection to a git host.
pub fn test_ssh_connection(key_path: &Path, git_url: &str) -> Result<SshTestResult> {
    let host = match extract_ssh_host(git_url) {
        Some(h) => h,
        None => return Ok(SshTestResult::NotSsh),
    };

    let mut cmd = Command::new("ssh");
    cmd.args(["-T", &format!("git@{}", host)])
        .args(["-i", key_path.to_str().unwrap()])
        .args(["-o", "StrictHostKeyChecking=accept-new"])
        .args(["-o", "ConnectTimeout=10"]);

    let output = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let combined = format!("{} {}", stdout, stderr);

    // GitHub/GitLab return exit code 1 but print "successfully authenticated"
    if combined.contains("successfully authenticated")
        || combined.contains("Welcome to GitLab")
        || combined.contains("Hi ")
        || combined.contains("welcome")
    {
        return Ok(SshTestResult::Success(stderr.trim().to_string()));
    }

    if combined.contains("Permission denied") || combined.contains("publickey") {
        return Ok(SshTestResult::AuthFailed(stderr.trim().to_string()));
    }

    if combined.contains("Connection refused")
        || combined.contains("Connection timed out")
        || combined.contains("Could not resolve hostname")
    {
        return Ok(SshTestResult::ConnectionFailed(stderr.trim().to_string()));
    }

    // Many git hosts return exit code 1 on ssh -T but it means success
    if output.status.code() == Some(1) {
        return Ok(SshTestResult::Success(stderr.trim().to_string()));
    }

    Ok(SshTestResult::Unknown(stderr.trim().to_string()))
}

#[derive(Debug)]
#[allow(dead_code)]
pub enum SshTestResult {
    Success(String),
    NotSsh,
    AuthFailed(String),
    ConnectionFailed(String),
    Unknown(String),
}

/// Check if a git URL is SSH-based
pub fn is_ssh_url(url: &str) -> bool {
    url.starts_with("git@") || url.starts_with("ssh://")
}

/// Extract host and path from a git SSH URL
/// "git@github.com:user/repo.git" → ("github.com", "user/repo")
fn extract_host_path(url: &str) -> Option<(String, String)> {
    if let Some(at_pos) = url.find('@') {
        let after_at = &url[at_pos + 1..];
        if let Some(colon_pos) = after_at.find(':') {
            let host = after_at[..colon_pos].to_string();
            let path = after_at[colon_pos + 1..]
                .trim_end_matches(".git")
                .to_string();
            return Some((host, path));
        }
    }
    None
}

/// Build the Deploy Keys settings URL for a git SSH URL
pub fn deploy_keys_url(git_url: &str) -> Option<String> {
    let (host, path) = extract_host_path(git_url)?;
    match host.as_str() {
        "github.com" => Some(format!("https://github.com/{}/settings/keys", path)),
        "gitee.com" => Some(format!("https://gitee.com/{}/keys", path)),
        "gitlab.com" => Some(format!("https://gitlab.com/{}/-/settings/repository", path)),
        _ => Some(format!("https://{}/{}/settings", host, path)),
    }
}

/// Open a URL in the default browser
pub fn open_browser(url: &str) {
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let _ = url;

    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(url).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}

/// Convert HTTPS GitHub/GitLab URL to SSH format
pub fn https_to_ssh(url: &str) -> Option<String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return None;
    }
    let stripped = url
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    let parts: Vec<&str> = stripped.splitn(2, '/').collect();
    if parts.len() != 2 {
        return None;
    }
    let host = parts[0];
    let path = parts[1];
    Some(format!("git@{}:{}", host, path))
}
