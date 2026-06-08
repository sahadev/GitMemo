use anyhow::{anyhow, Context, Result};
use console::style;
use serde::Deserialize;
use std::fs;
use std::path::Path;

use crate::platform;

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

/// Fetch the latest release info from GitHub
fn fetch_latest_release() -> Result<Release> {
    let output = crate::platform::background_command("curl")
        .args([
            "-sL",
            "-H",
            "Accept: application/vnd.github+json",
            GITHUB_API_RELEASES,
        ])
        .output()
        .context("Failed to fetch release info from GitHub")?;

    if !output.status.success() {
        return Err(anyhow!("GitHub API request failed"));
    }

    let release: Release =
        serde_json::from_slice(&output.stdout).context("Failed to parse GitHub API response")?;

    Ok(release)
}

/// Download a file from URL to destination
fn download_file(url: &str, dest: &Path) -> Result<()> {
    let output = crate::platform::background_command("curl")
        .args(["-sL", "-o", dest.to_str().unwrap(), url])
        .output()
        .context("Failed to download binary")?;

    if !output.status.success() {
        return Err(anyhow!("Download failed"));
    }

    Ok(())
}

pub fn cmd_upgrade(check_only: bool) -> Result<()> {
    let i18n = crate::utils::i18n::get();

    println!("{}", style(i18n.upgrade_checking()).cyan());

    let release = fetch_latest_release()
        .context("Failed to fetch latest release. Check your internet connection.")?;

    let latest_version = release.tag_name.trim_start_matches('v');

    println!(
        "  {} {}",
        i18n.upgrade_current(),
        style(CURRENT_VERSION).yellow()
    );
    println!(
        "  {} {}",
        i18n.upgrade_latest(),
        style(latest_version).green()
    );

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
    let platform = platform::cli_release_asset_name().ok_or_else(|| {
        anyhow!(
            "Unsupported platform: {}-{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;

    // Find the matching asset
    let asset = release
        .assets
        .iter()
        .find(|a| a.name == platform)
        .ok_or_else(|| anyhow!("No binary found for platform: {}", platform))?;

    println!("\n{}", style(i18n.upgrade_downloading()).cyan());
    println!("  {}", asset.browser_download_url);

    // Download to temp file
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("gitmemo-{}", latest_version));

    download_file(&asset.browser_download_url, &temp_file)?;

    platform::make_executable_if_needed(&temp_file)?;

    // Determine install path
    let install_path = platform::determine_install_path()?;

    println!("\n{}", style(i18n.upgrade_installing()).cyan());
    println!("  {}", install_path.display());

    // Try to replace the binary
    let backup_path = install_path.with_extension("bak");

    // Backup current binary if it exists
    if install_path.exists() {
        fs::copy(&install_path, &backup_path).context("Failed to backup current binary")?;
    }

    // Try direct replacement
    match platform::replace_file_direct(&temp_file, &install_path) {
        Ok(_) => {
            // Success - clean up backup
            let _ = fs::remove_file(&backup_path);
            println!("\n{}", style(i18n.upgrade_success()).green().bold());
            println!(
                "  {} {}",
                i18n.upgrade_version(),
                style(latest_version).yellow()
            );

            // If we updated a different location than current binary, warn user
            if let Ok(current) = platform::current_binary_path() {
                if current != install_path {
                    println!("\n{}", style(i18n.upgrade_path_warning()).yellow());
                    println!("  {} {}", i18n.upgrade_old_path(), current.display());
                    println!("  {} {}", i18n.upgrade_new_path(), install_path.display());
                }
            }
        }
        Err(_) => {
            if !platform::can_elevate_file_replacement() {
                if backup_path.exists() {
                    let _ = fs::rename(&backup_path, &install_path);
                }
                return Err(anyhow!("Failed to install new binary"));
            }

            // Permission denied - try with platform elevation
            println!("\n{}", style(i18n.upgrade_need_sudo()).yellow());

            if platform::replace_file_with_elevation(&temp_file, &install_path).is_ok() {
                let _ = fs::remove_file(&backup_path);
                println!("\n{}", style(i18n.upgrade_success()).green().bold());
                println!(
                    "  {} {}",
                    i18n.upgrade_version(),
                    style(latest_version).yellow()
                );
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
