use std::path::{Path, PathBuf};
use std::process::Command;

pub fn runtime_family() -> &'static str {
    if cfg!(mobile) {
        "mobile"
    } else {
        "desktop"
    }
}

pub fn runtime_os() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else {
        "unknown"
    }
}

pub fn default_gitmemo_command() -> &'static str {
    gitmemo_core::platform::gitmemo_binary_name()
}

pub fn gitmemo_command_for_registration() -> String {
    find_gitmemo_cli().unwrap_or_else(|| default_gitmemo_command().to_string())
}

pub fn find_gitmemo_cli() -> Option<String> {
    if cfg!(target_os = "android") || cfg!(target_os = "ios") {
        return None;
    }

    for candidate in common_cli_candidates() {
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    lookup_cli_in_path()
}

pub fn detect_system_proxy() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        detect_macos_system_proxy()
    }

    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

pub fn reveal_in_file_manager(file_path: &str) -> Result<(), String> {
    let path = PathBuf::from(file_path.trim());

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg("-R")
            .arg(&path)
            .status()
            .map_err(|e| e.to_string())?;
        status
            .success()
            .then_some(())
            .ok_or_else(|| format!("open -R exited with status {status}"))
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("explorer.exe")
            .arg(format!("/select,{}", path.to_string_lossy()))
            .status()
            .map_err(|e| e.to_string())?;
        status
            .success()
            .then_some(())
            .ok_or_else(|| format!("explorer.exe exited with status {status}"))
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let dir = if path.is_dir() {
            path
        } else {
            path.parent()
                .map(Path::to_path_buf)
                .ok_or_else(|| "Invalid file path".to_string())?
        };
        let status = Command::new("xdg-open")
            .arg(&dir)
            .status()
            .map_err(|e| e.to_string())?;
        status
            .success()
            .then_some(())
            .ok_or_else(|| format!("xdg-open exited with status {status}"))
    }
}

fn common_cli_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let binary = default_gitmemo_command();

    if let Some(path_var) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path_var).map(|path| path.join(binary)));
    }

    if let Some(home) = home_dir() {
        candidates.push(home.join(".cargo").join("bin").join(binary));

        #[cfg(target_os = "windows")]
        {
            candidates.push(
                home.join("AppData")
                    .join("Local")
                    .join("GitMemo")
                    .join("bin")
                    .join(binary),
            );
            candidates.push(home.join("scoop").join("shims").join(binary));
            candidates.push(
                home.join("AppData")
                    .join("Local")
                    .join("Microsoft")
                    .join("WindowsApps")
                    .join(binary),
            );
        }

        #[cfg(not(target_os = "windows"))]
        {
            candidates.push(home.join(".local").join("bin").join(binary));
            candidates.push(home.join(".bun").join("bin").join(binary));
            candidates.push(home.join(".volta").join("bin").join(binary));
            candidates.push(home.join(".asdf").join("shims").join(binary));
            candidates.push(home.join(".npm-global").join("bin").join(binary));
            candidates.push(home.join("Library").join("pnpm").join(binary));
            candidates.push(
                home.join(".local")
                    .join("share")
                    .join("pnpm")
                    .join(binary),
            );
            candidates.push(home.join("bin").join(binary));
            if let Ok(entries) = std::fs::read_dir(home.join(".nvm").join("versions").join("node")) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join("bin").join(binary));
                }
            }
            if let Ok(entries) = std::fs::read_dir(home.join(".fnm").join("node-versions")) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join("installation").join("bin").join(binary));
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        candidates.push(PathBuf::from("/opt/homebrew/bin").join(binary));
        candidates.push(PathBuf::from("/usr/local/bin").join(binary));
        candidates.push(PathBuf::from("/usr/bin").join(binary));
    }

    candidates
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn lookup_cli_in_path() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        return command_lookup("where.exe", &[default_gitmemo_command()]);
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(path) = command_lookup("which", &[default_gitmemo_command()]) {
            return Some(path);
        }

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        let command = format!("command -v {}", default_gitmemo_command());
        command_lookup(&shell, &["-lc", &command])
    }
}

fn command_lookup(command: &str, args: &[&str]) -> Option<String> {
    let output = gitmemo_core::platform::background_command(command)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .find(|line| Path::new(line).is_file())
        .map(ToOwned::to_owned)
}

#[cfg(target_os = "macos")]
fn detect_macos_system_proxy() -> Option<String> {
    let output = Command::new("scutil").arg("--proxy").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    parse_scutil_proxy(&text, "HTTPS").or_else(|| parse_scutil_proxy(&text, "HTTP"))
}

#[cfg(target_os = "macos")]
fn parse_scutil_proxy(text: &str, prefix: &str) -> Option<String> {
    let enabled_key = format!("{}Enable : 1", prefix);
    if !text.contains(&enabled_key) {
        return None;
    }
    let proxy_key = format!("{}Proxy : ", prefix);
    let port_key = format!("{}Port : ", prefix);
    let host = text
        .lines()
        .find(|line| line.contains(&proxy_key))
        .and_then(|line| line.split(" : ").nth(1))
        .map(str::trim)?;
    let port = text
        .lines()
        .find(|line| line.contains(&port_key))
        .and_then(|line| line.split(" : ").nth(1))
        .map(str::trim)?;
    Some(format!("http://{}:{}", host, port))
}
