use anyhow::{anyhow, Context, Result};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;

const SSH_OPTIONS: &str = "-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2";

pub fn gitmemo_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "gitmemo.exe"
    } else {
        "gitmemo"
    }
}

pub fn configure_background_command(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = command;
    }
}

pub fn background_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    configure_background_command(&mut command);
    command
}

pub fn cli_release_asset_name() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Some("gitmemo-macos-aarch64"),
        ("macos", "x86_64") => Some("gitmemo-macos-x86_64"),
        ("linux", "x86_64") => Some("gitmemo-linux-x86_64"),
        ("linux", "aarch64") => Some("gitmemo-linux-aarch64"),
        ("windows", "x86_64") => Some("gitmemo-windows-x86_64.exe"),
        _ => None,
    }
}

pub fn current_binary_path() -> Result<PathBuf> {
    std::env::current_exe().context("Failed to get current binary path")
}

pub fn determine_install_path() -> Result<PathBuf> {
    if let Ok(current) = current_binary_path() {
        if let Some(parent) = current.parent() {
            if is_writable_dir(parent) {
                return Ok(current);
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        let cargo_bin = home.join(".cargo").join("bin").join(gitmemo_binary_name());
        if cargo_bin.parent().is_some_and(Path::exists) {
            return Ok(cargo_bin);
        }

        #[cfg(target_os = "windows")]
        {
            if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
                return Ok(PathBuf::from(local_app_data)
                    .join("GitMemo")
                    .join("bin")
                    .join(gitmemo_binary_name()));
            }
            return Ok(home
                .join("AppData")
                .join("Local")
                .join("GitMemo")
                .join("bin")
                .join(gitmemo_binary_name()));
        }
    }

    #[cfg(target_os = "windows")]
    {
        Ok(std::env::temp_dir()
            .join("GitMemo")
            .join("bin")
            .join(gitmemo_binary_name()))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(PathBuf::from("/usr/local/bin").join(gitmemo_binary_name()))
    }
}

pub fn make_executable_if_needed(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(path, perms)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

pub fn restrict_dir_to_owner_if_needed(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

pub fn can_elevate_file_replacement() -> bool {
    cfg!(unix)
}

pub fn replace_file_direct(source: &Path, dest: &Path) -> Result<()> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }

    #[cfg(target_os = "windows")]
    if dest.exists() {
        std::fs::remove_file(dest)
            .with_context(|| format!("Failed to remove existing {}", dest.display()))?;
    }

    std::fs::rename(source, dest)?;
    Ok(())
}

pub fn replace_file_with_elevation(source: &Path, dest: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        let status = Command::new("sudo")
            .arg("mv")
            .arg(source)
            .arg(dest)
            .status()
            .context("Failed to execute sudo mv")?;
        if status.success() {
            Ok(())
        } else {
            Err(anyhow!("sudo mv failed"))
        }
    }

    #[cfg(not(unix))]
    {
        let _ = source;
        let _ = dest;
        Err(anyhow!(
            "elevated file replacement is not implemented for this platform"
        ))
    }
}

pub fn link_sync_dir(target: &Path, link: &Path) -> Result<()> {
    if let Some(parent) = link.parent() {
        std::fs::create_dir_all(parent)?;
    }
    remove_existing_link_location(link)?;
    link_dir(target, link)
        .with_context(|| format!("Failed to link {} to {}", link.display(), target.display()))
}

pub fn open_url(url: &str) {
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(url).spawn();

    #[cfg(target_os = "linux")]
    let _ = Command::new("xdg-open").arg(url).spawn();

    #[cfg(target_os = "windows")]
    let _ = background_command("rundll32")
        .arg("url.dll,FileProtocolHandler")
        .arg(url)
        .spawn();

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    let _ = url;
}

pub fn git_ssh_command(key_path: Option<&str>) -> String {
    if let Some(key_path) = key_path {
        format!(
            "ssh -i {} -o IdentitiesOnly=yes {}",
            quote_shell_arg(key_path),
            SSH_OPTIONS
        )
    } else {
        format!("ssh {}", SSH_OPTIONS)
    }
}

fn is_writable_dir(path: &Path) -> bool {
    let probe = path.join(format!(".gitmemo-write-test-{}", std::process::id()));
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(probe);
            true
        }
        Err(_) => false,
    }
}

fn remove_existing_link_location(path: &Path) -> Result<()> {
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return Ok(());
    };

    if metadata.file_type().is_symlink() || metadata.is_file() {
        std::fs::remove_file(path)
            .or_else(|_| std::fs::remove_dir(path))
            .with_context(|| format!("Failed to remove existing {}", path.display()))?;
    } else if metadata.is_dir() {
        std::fs::remove_dir(path)
            .with_context(|| format!("Failed to remove existing directory {}", path.display()))?;
    }
    Ok(())
}

#[cfg(unix)]
fn link_dir(target: &Path, link: &Path) -> Result<()> {
    std::os::unix::fs::symlink(target, link)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn link_dir(target: &Path, link: &Path) -> Result<()> {
    if std::os::windows::fs::symlink_dir(target, link).is_ok() {
        return Ok(());
    }

    let output = background_command("cmd")
        .arg("/C")
        .arg("mklink")
        .arg("/J")
        .arg(link)
        .arg(target)
        .output()
        .context("Failed to execute mklink")?;
    if output.status.success() {
        Ok(())
    } else {
        Err(anyhow!(
            "mklink /J failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(not(any(unix, target_os = "windows")))]
fn link_dir(_target: &Path, _link: &Path) -> Result<()> {
    Err(anyhow!(
        "directory links are not supported on this platform"
    ))
}

#[cfg(target_os = "windows")]
fn quote_shell_arg(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\\\""))
}

#[cfg(not(target_os = "windows"))]
fn quote_shell_arg(value: &str) -> String {
    format!("'{}'", value.replace('\'', r#"'\''"#))
}
