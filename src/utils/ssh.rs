use anyhow::Result;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Known SSH key filenames to search for (in priority order)
const KEY_NAMES: &[&str] = &["id_ed25519", "id_rsa", "id_ecdsa"];

/// Find an existing SSH private key in ~/.ssh/
pub fn find_existing_key() -> Option<PathBuf> {
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
}

/// Find or generate an SSH key in ~/.ssh/ (the standard location).
///
/// Strategy:
/// 1. Check ~/.ssh/ for existing keys — reuse if found
/// 2. Generate a new ED25519 key in ~/.ssh/
///
/// Returns (key_path, is_new_key)
pub fn find_or_generate_key() -> Result<(PathBuf, bool)> {
    // 1. Check for existing keys
    if let Some(existing) = find_existing_key() {
        return Ok((existing, false));
    }

    // 2. Generate new key in ~/.ssh/
    let ssh_dir = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("cannot determine home directory"))?
        .join(".ssh");
    std::fs::create_dir_all(&ssh_dir)?;

    // Set correct permissions on ~/.ssh/ (700)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&ssh_dir, std::fs::Permissions::from_mode(0o700))?;
    }

    let key_path = ssh_dir.join("id_ed25519");

    let status = Command::new("ssh-keygen")
        .args([
            "-t", "ed25519",
            "-f", key_path.to_str().unwrap(),
            "-N", "",
            "-C", "gitmemo",
        ])
        .status()?;

    if !status.success() {
        anyhow::bail!("ssh-keygen failed");
    }

    Ok((key_path, true))
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
            let path = after_at[colon_pos + 1..].trim_end_matches(".git").to_string();
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
