use anyhow::{anyhow, Context, Result};
use console::style;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::platform;

const GITHUB_API_RELEASES: &str = "https://api.github.com/repos/sahadev/GitMemo/releases?per_page=50";
const GITHUB_CLI_MANIFEST: &str =
    "https://github.com/sahadev/GitMemo/releases/latest/download/cli-latest.json";
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

#[derive(Deserialize)]
struct CliManifest {
    version: String,
    assets: HashMap<String, CliManifestAsset>,
}

#[derive(Deserialize)]
struct CliManifestAsset {
    name: String,
    url: String,
}

struct CliUpdate {
    version: String,
    url: String,
}

fn fetch_url(url: &str) -> Result<Vec<u8>> {
    let output = crate::platform::background_command("curl")
        .args([
            "-sL",
            "--connect-timeout",
            "5",
            "--max-time",
            "20",
            "-H",
            "Accept: application/vnd.github+json",
            url,
        ])
        .output()
        .with_context(|| format!("Failed to fetch {url}"))?;

    if !output.status.success() {
        return Err(anyhow!("Request failed: {url}"));
    }

    Ok(output.stdout)
}

fn fetch_cli_manifest() -> Result<CliManifest> {
    let body = fetch_url(GITHUB_CLI_MANIFEST)?;
    serde_json::from_slice(&body).context("Failed to parse CLI update manifest")
}

fn fetch_recent_releases() -> Result<Vec<Release>> {
    let body = fetch_url(GITHUB_API_RELEASES)?;
    serde_json::from_slice(&body).context("Failed to parse GitHub releases response")
}

fn parse_version_core(version: &str) -> Option<(u64, u64, u64)> {
    let version = version.trim().trim_start_matches('v');
    let core = version
        .split(|c: char| !(c.is_ascii_digit() || c == '.'))
        .next()
        .unwrap_or("");
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    match (parse_version_core(latest), parse_version_core(current)) {
        (Some(latest), Some(current)) => latest > current,
        _ => latest != current,
    }
}

fn cli_asset_from_manifest(manifest: CliManifest, platform_asset: &str) -> Option<CliUpdate> {
    let asset = manifest
        .assets
        .values()
        .find(|asset| asset.name == platform_asset)?;
    let version = manifest
        .version
        .trim()
        .trim_start_matches('v')
        .to_string();
    Some(CliUpdate {
        version,
        url: asset.url.clone(),
    })
}

fn cli_asset_from_releases(platform_asset: &str) -> Result<CliUpdate> {
    for release in fetch_recent_releases()? {
        if let Some(asset) = release.assets.iter().find(|asset| asset.name == platform_asset) {
            return Ok(CliUpdate {
                version: release.tag_name.trim_start_matches('v').to_string(),
                url: asset.browser_download_url.clone(),
            });
        }
    }

    Err(anyhow!("No binary found for platform: {}", platform_asset))
}

fn fetch_latest_cli_update(platform_asset: &str) -> Result<CliUpdate> {
    if let Ok(manifest) = fetch_cli_manifest() {
        if let Some(update) = cli_asset_from_manifest(manifest, platform_asset) {
            return Ok(update);
        }
    }

    cli_asset_from_releases(platform_asset)
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

    let platform = platform::cli_release_asset_name().ok_or_else(|| {
        anyhow!(
            "Unsupported platform: {}-{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;
    let update = fetch_latest_cli_update(platform)
        .context("Failed to fetch latest CLI release. Check your internet connection.")?;
    let latest_version = update.version;

    println!(
        "  {} {}",
        i18n.upgrade_current(),
        style(CURRENT_VERSION).yellow()
    );
    println!(
        "  {} {}",
        i18n.upgrade_latest(),
        style(&latest_version).green()
    );

    // Compare versions
    if !is_newer_version(&latest_version, CURRENT_VERSION) {
        println!("\n{}", style(i18n.upgrade_already_latest()).green());
        return Ok(());
    }

    if check_only {
        println!("\n{}", style(i18n.upgrade_new_available()).yellow());
        println!("{}", style("  gitmemo upgrade").cyan());
        return Ok(());
    }

    println!("\n{}", style(i18n.upgrade_downloading()).cyan());
    println!("  {}", update.url);

    // Download to temp file
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("gitmemo-{}", latest_version));

    download_file(&update.url, &temp_file)?;

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

#[cfg(test)]
mod tests {
    use super::{is_newer_version, parse_version_core};

    #[test]
    fn parses_version_core_with_prefix_and_suffix() {
        assert_eq!(parse_version_core("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version_core("1.2.3-beta.1"), Some((1, 2, 3)));
    }

    #[test]
    fn newer_version_requires_actual_forward_change() {
        assert!(!is_newer_version("1.0.108", "1.0.108"));
        assert!(!is_newer_version("1.0.107", "1.0.108"));
        assert!(is_newer_version("1.0.109", "1.0.108"));
        assert!(is_newer_version("v1.1.0", "1.0.109"));
    }
}
