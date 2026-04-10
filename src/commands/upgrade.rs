use anyhow::{anyhow, Context, Result};
use console::style;
use serde::Deserialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const GITHUB_API_RELEASES: &str = "https://api.github.com/repos/sahadev/GitMemo/releases/latest";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// Detect the current platform and return the appropriate asset name
fn detect_platform() -> Result<&'static str> {
    let arch = env::consts::ARCH;
    let os = env::consts::OS;

    match (os, arch) {
        ("macos", "aarch64") => Ok("gitmemo-macos-aarch64"),
        ("macos", "x86_64") => Ok("gitmemo-macos-x86_64"),
        _ => Err(anyhow!("Unsupported platform: {}-{}", os, arch)),
    }
}

/// Fetch the latest release info from GitHub
fn fetch_latest_release() -> Result<Release> {
    let output = Command::new("curl")
        .args(["-sL", "-H", "Accept: application/vnd.github+json", GITHUB_API_RELEASES])
        .output()
        .context("Failed to fetch release info from GitHub")?;

    if !output.status.success() {
        return Err(anyhow!("GitHub API request failed"));
    }

    let release: Release = serde_json::from_slice(&output.stdout)
        .context("Failed to parse GitHub API response")?;

    Ok(release)
}

/// Download a file from URL to destination
fn download_file(url: &str, dest: &Path) -> Result<()> {
    let output = Command::new("curl")
        .args(["-sL", "-o", dest.to_str().unwrap(), url])
        .output()
        .context("Failed to download binary")?;

    if !output.status.success() {
        return Err(anyhow!("Download failed"));
    }

    Ok(())
}

/// Get the current binary path
fn current_binary_path() -> Result<PathBuf> {
    env::current_exe().context("Failed to get current binary path")
}

/// Determine the best installation path
/// Priority: current binary location > ~/.cargo/bin > /usr/local/bin
fn determine_install_path() -> Result<PathBuf> {
    // Try to use the current binary's location
    if let Ok(current) = current_binary_path() {
        if let Some(parent) = current.parent() {
            // Check if we have write permission
            if parent.join(".write_test").metadata().is_ok()
                || fs::File::create(parent.join(".write_test")).is_ok()
            {
                let _ = fs::remove_file(parent.join(".write_test"));
                return Ok(current);
            }
        }
    }

    // Try ~/.cargo/bin
    if let Some(home) = dirs::home_dir() {
        let cargo_bin = home.join(".cargo/bin/gitmemo");
        if let Some(parent) = cargo_bin.parent() {
            if parent.exists() {
                return Ok(cargo_bin);
            }
        }
    }

    // Fallback to /usr/local/bin (requires sudo)
    Ok(PathBuf::from("/usr/local/bin/gitmemo"))
}

pub fn cmd_upgrade(check_only: bool) -> Result<()> {
    let i18n = crate::utils::i18n::get();

    println!("{}", style(i18n.upgrade_checking()).cyan());

    let release = fetch_latest_release()
        .context("Failed to fetch latest release. Check your internet connection.")?;

    let latest_version = release.tag_name.trim_start_matches('v');

    println!("  {} {}", i18n.upgrade_current(), style(CURRENT_VERSION).yellow());
    println!("  {} {}", i18n.upgrade_latest(), style(latest_version).green());

    // Compare versions
    if latest_version == CURRENT_VERSION {
        println!("\n{}", style(i18n.upgrade_already_latest()).green());
        return Ok(());
    }

    if check_only {
        println!("\n{}", style(i18n.upgrade_new_available()).yellow());
        println!("{}", style("  gitmemo upgrade").cyan());
        return Ok(());
    }

    // Detect platform
    let platform = detect_platform()?;

    // Find the matching asset
    let asset = release.assets.iter()
        .find(|a| a.name == platform)
        .ok_or_else(|| anyhow!("No binary found for platform: {}", platform))?;

    println!("\n{}", style(i18n.upgrade_downloading()).cyan());
    println!("  {}", asset.browser_download_url);

    // Download to temp file
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("gitmemo-{}", latest_version));

    download_file(&asset.browser_download_url, &temp_file)?;

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&temp_file)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&temp_file, perms)?;
    }

    // Determine install path
    let install_path = determine_install_path()?;

    println!("\n{}", style(i18n.upgrade_installing()).cyan());
    println!("  {}", install_path.display());

    // Try to replace the binary
    let backup_path = install_path.with_extension("bak");

    // Backup current binary if it exists
    if install_path.exists() {
        fs::copy(&install_path, &backup_path)
            .context("Failed to backup current binary")?;
    }

    // Try direct replacement
    match fs::rename(&temp_file, &install_path) {
        Ok(_) => {
            // Success - clean up backup
            let _ = fs::remove_file(&backup_path);
            println!("\n{}", style(i18n.upgrade_success()).green().bold());
            println!("  {} {}", i18n.upgrade_version(), style(latest_version).yellow());

            // If we updated a different location than current binary, warn user
            if let Ok(current) = current_binary_path() {
                if current != install_path {
                    println!("\n{}", style(i18n.upgrade_path_warning()).yellow());
                    println!("  {} {}", i18n.upgrade_old_path(), current.display());
                    println!("  {} {}", i18n.upgrade_new_path(), install_path.display());
                }
            }
        }
        Err(_) => {
            // Permission denied - try with sudo
            println!("\n{}", style(i18n.upgrade_need_sudo()).yellow());

            let status = Command::new("sudo")
                .args(["mv", temp_file.to_str().unwrap(), install_path.to_str().unwrap()])
                .status()
                .context("Failed to execute sudo mv")?;

            if status.success() {
                let _ = fs::remove_file(&backup_path);
                println!("\n{}", style(i18n.upgrade_success()).green().bold());
                println!("  {} {}", i18n.upgrade_version(), style(latest_version).yellow());
            } else {
                // Restore backup
                if backup_path.exists() {
                    let _ = fs::rename(&backup_path, &install_path);
                }
                return Err(anyhow!("Failed to install new binary"));
            }
        }
    }

    Ok(())
}
