use super::sync_log;
use gitmemo_core::storage::{files, git};
use gitmemo_core::utils::config::Config;
use gitmemo_core::utils::sanitize::git_error_for_user;
use serde::{Deserialize, Serialize};
#[cfg(desktop)]
use std::str::FromStr;
#[cfg(desktop)]
use tauri::{Emitter, Manager};
#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const SETTINGS_FILE: &str = "desktop_settings.toml";
pub const IMPORT_FILE_SIZE_LIMIT_MIN_KB: u64 = 500;
pub const IMPORT_FILE_SIZE_LIMIT_MAX_KB: u64 = 20 * 1024;
pub const IMPORT_FILE_SIZE_LIMIT_DEFAULT_KB: u64 = 2 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProxyMode {
    #[default]
    System,
    None,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopSettings {
    pub autostart: bool,
    #[serde(default = "default_true")]
    pub clipboard_autostart: bool,
    #[serde(default)]
    pub control_copy_paste: bool,
    #[serde(default)]
    pub proxy_mode: ProxyMode,
    #[serde(default)]
    pub proxy_url: String,
    #[serde(default)]
    pub shortcuts: KeyboardShortcuts,
    #[serde(default = "default_import_file_size_limit_kb")]
    pub import_file_size_limit_kb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardShortcuts {
    #[serde(default = "default_global_search_shortcut")]
    pub global_search: String,
    #[serde(default = "default_app_search_shortcut")]
    pub app_search: String,
    #[serde(default = "default_quick_note_shortcut")]
    pub quick_note: String,
    #[serde(default = "default_find_in_document_shortcut")]
    pub find_in_document: String,
    #[serde(default = "default_edit_selected_shortcut")]
    pub edit_selected: String,
    #[serde(default = "default_delete_selected_shortcut")]
    pub delete_selected: String,
}

fn default_true() -> bool {
    true
}
fn default_global_search_shortcut() -> String {
    "CmdOrCtrl+Shift+G".into()
}
fn default_app_search_shortcut() -> String {
    "CmdOrCtrl+K".into()
}
fn default_quick_note_shortcut() -> String {
    "CmdOrCtrl+N".into()
}
fn default_find_in_document_shortcut() -> String {
    "CmdOrCtrl+F".into()
}
fn default_edit_selected_shortcut() -> String {
    "CmdOrCtrl+E".into()
}
fn default_delete_selected_shortcut() -> String {
    "CmdOrCtrl+Delete".into()
}
fn default_import_file_size_limit_kb() -> u64 {
    IMPORT_FILE_SIZE_LIMIT_DEFAULT_KB
}

fn normalize_import_file_size_limit_kb(kb: u64) -> u64 {
    kb.clamp(IMPORT_FILE_SIZE_LIMIT_MIN_KB, IMPORT_FILE_SIZE_LIMIT_MAX_KB)
}

impl Default for KeyboardShortcuts {
    fn default() -> Self {
        Self {
            global_search: default_global_search_shortcut(),
            app_search: default_app_search_shortcut(),
            quick_note: default_quick_note_shortcut(),
            find_in_document: default_find_in_document_shortcut(),
            edit_selected: default_edit_selected_shortcut(),
            delete_selected: default_delete_selected_shortcut(),
        }
    }
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            autostart: false,
            clipboard_autostart: true,
            control_copy_paste: false,
            proxy_mode: ProxyMode::default(),
            proxy_url: String::new(),
            shortcuts: KeyboardShortcuts::default(),
            import_file_size_limit_kb: IMPORT_FILE_SIZE_LIMIT_DEFAULT_KB,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AppMeta {
    pub version: String,
    pub release_time: String,
    pub requires_cli: bool,
    pub recommended_cli_version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CliStatus {
    pub installed: bool,
    pub path: String,
    pub version: String,
    pub recommended_version: String,
    pub version_matches: bool,
}

#[cfg(desktop)]
fn settings_path() -> std::path::PathBuf {
    files::sync_dir().join(".metadata").join(SETTINGS_FILE)
}

#[cfg(not(desktop))]
fn settings_path() -> std::path::PathBuf {
    std::env::var("HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir())
        .join(".gitmemo")
        .join(".metadata")
        .join(SETTINGS_FILE)
}

fn load_settings() -> DesktopSettings {
    let path = settings_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(mut settings) = toml::from_str::<DesktopSettings>(&content) {
                settings.import_file_size_limit_kb =
                    normalize_import_file_size_limit_kb(settings.import_file_size_limit_kb);
                return settings;
            }
        }
    }
    DesktopSettings::default()
}

pub fn import_file_size_limit_bytes() -> u64 {
    normalize_import_file_size_limit_kb(load_settings().import_file_size_limit_kb) * 1024
}

fn save_settings(settings: &DesktopSettings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = toml::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

fn shortcut_values(shortcuts: &KeyboardShortcuts) -> [(&'static str, &str); 6] {
    [
        ("global_search", &shortcuts.global_search),
        ("app_search", &shortcuts.app_search),
        ("quick_note", &shortcuts.quick_note),
        ("find_in_document", &shortcuts.find_in_document),
        ("edit_selected", &shortcuts.edit_selected),
        ("delete_selected", &shortcuts.delete_selected),
    ]
}

#[cfg(desktop)]
fn validate_shortcuts(shortcuts: &KeyboardShortcuts) -> Result<(), String> {
    let mut seen = std::collections::HashMap::<String, &'static str>::new();
    for (name, value) in shortcut_values(shortcuts) {
        Shortcut::from_str(value).map_err(|e| format!("Invalid shortcut {name}: {e}"))?;
        let normalized = value.to_ascii_lowercase().replace(' ', "");
        if let Some(existing) = seen.insert(normalized, name) {
            return Err(format!("Shortcut conflict: {existing} and {name}"));
        }
    }
    Ok(())
}

#[cfg(not(desktop))]
fn validate_shortcuts(shortcuts: &KeyboardShortcuts) -> Result<(), String> {
    for (name, value) in shortcut_values(shortcuts) {
        if value.trim().is_empty() {
            return Err(format!("Invalid shortcut {name}: empty"));
        }
    }
    Ok(())
}

#[cfg(desktop)]
fn show_main_window(window: &tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

#[cfg(desktop)]
fn register_global_shortcuts_for(
    app: &tauri::AppHandle,
    shortcuts: &KeyboardShortcuts,
) -> Result<(), String> {
    let shortcut = Shortcut::from_str(&shortcuts.global_search)
        .map_err(|e| format!("Invalid global search shortcut: {e}"))?;

    let global_shortcut = app.global_shortcut();
    let _ = global_shortcut.unregister_all();

    let app_handle = app.clone();
    global_shortcut
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            if let Some(w) = app_handle.get_webview_window("main") {
                show_main_window(&w);
                let _ = app_handle.emit("global-shortcut-search", ());
            }
        })
        .map_err(|e| format!("{e:?}"))?;
    Ok(())
}

#[cfg(desktop)]
pub fn register_global_shortcuts(app: &tauri::AppHandle) -> Result<(), String> {
    register_global_shortcuts_for(app, &load_settings().shortcuts)
}

#[cfg(not(desktop))]
#[allow(dead_code)]
pub fn register_global_shortcuts(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(desktop)]
pub fn should_autostart_clipboard() -> bool {
    load_settings().clipboard_autostart
}

#[tauri::command]
pub fn get_app_meta() -> Result<AppMeta, String> {
    Ok(AppMeta {
        version: env!("CARGO_PKG_VERSION").to_string(),
        release_time: option_env!("GITMEMO_RELEASE_TIME")
            .unwrap_or("")
            .to_string(),
        requires_cli: false,
        recommended_cli_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[cfg(not(target_os = "android"))]
fn common_cli_candidates() -> Vec<std::path::PathBuf> {
    let mut candidates = Vec::new();

    if let Some(path_var) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path_var).map(|path| path.join("gitmemo")));
    }

    if let Ok(home) = std::env::var("HOME") {
        let home = std::path::PathBuf::from(home);
        candidates.push(home.join(".local").join("bin").join("gitmemo"));
        candidates.push(home.join(".cargo").join("bin").join("gitmemo"));
        candidates.push(home.join(".bun").join("bin").join("gitmemo"));
        candidates.push(home.join(".volta").join("bin").join("gitmemo"));
        candidates.push(home.join(".asdf").join("shims").join("gitmemo"));
        candidates.push(home.join(".npm-global").join("bin").join("gitmemo"));
        candidates.push(home.join("Library").join("pnpm").join("gitmemo"));
        candidates.push(
            home.join(".local")
                .join("share")
                .join("pnpm")
                .join("gitmemo"),
        );
        candidates.push(home.join("bin").join("gitmemo"));
        if let Ok(entries) = std::fs::read_dir(home.join(".nvm").join("versions").join("node")) {
            for entry in entries.flatten() {
                candidates.push(entry.path().join("bin").join("gitmemo"));
            }
        }
        if let Ok(entries) = std::fs::read_dir(home.join(".fnm").join("node-versions")) {
            for entry in entries.flatten() {
                candidates.push(
                    entry
                        .path()
                        .join("installation")
                        .join("bin")
                        .join("gitmemo"),
                );
            }
        }
    }

    candidates.push(std::path::PathBuf::from("/opt/homebrew/bin/gitmemo"));
    candidates.push(std::path::PathBuf::from("/usr/local/bin/gitmemo"));
    candidates.push(std::path::PathBuf::from("/usr/bin/gitmemo"));
    candidates
}

#[cfg(not(target_os = "android"))]
fn find_gitmemo_cli() -> Option<String> {
    for candidate in common_cli_candidates() {
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    if let Ok(output) = std::process::Command::new("which").arg("gitmemo").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let output = std::process::Command::new(shell)
        .args(["-lc", "command -v gitmemo"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() || !std::path::Path::new(&path).is_file() {
        return None;
    }
    Some(path)
}

#[cfg(not(target_os = "android"))]
fn cli_version(path: &str) -> String {
    let Ok(output) = std::process::Command::new(path).arg("--version").output() else {
        return String::new();
    };
    if !output.status.success() {
        return String::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .split_whitespace()
        .last()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string()
}

#[tauri::command]
pub fn get_cli_status() -> Result<CliStatus, String> {
    let recommended_version = env!("CARGO_PKG_VERSION").to_string();

    #[cfg(target_os = "android")]
    {
        Ok(CliStatus {
            installed: false,
            path: String::new(),
            version: String::new(),
            recommended_version,
            version_matches: false,
        })
    }

    #[cfg(not(target_os = "android"))]
    {
        let Some(path) = find_gitmemo_cli() else {
            return Ok(CliStatus {
                installed: false,
                path: String::new(),
                version: String::new(),
                recommended_version,
                version_matches: false,
            });
        };
        let version = cli_version(&path);
        let version_matches = !version.is_empty() && version == recommended_version;

        Ok(CliStatus {
            installed: true,
            path,
            version,
            recommended_version,
            version_matches,
        })
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<DesktopSettings, String> {
    let mut settings = load_settings();
    if let Ok(autostart) = app.autolaunch().is_enabled() {
        settings.autostart = autostart;
    }
    Ok(settings)
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn get_settings() -> Result<DesktopSettings, String> {
    Ok(load_settings())
}

#[cfg(desktop)]
#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<String, String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| format!("{e:?}"))?;
    } else {
        autolaunch.disable().map_err(|e| format!("{e:?}"))?;
    }

    let mut settings = load_settings();
    settings.autostart = enabled;
    save_settings(&settings)?;

    Ok(if enabled {
        "Auto-start enabled".into()
    } else {
        "Auto-start disabled".into()
    })
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn set_autostart() -> Result<String, String> {
    Err("Auto-start is not available on mobile".into())
}

#[tauri::command]
pub fn set_clipboard_autostart(enabled: bool) -> Result<String, String> {
    let mut settings = load_settings();
    settings.clipboard_autostart = enabled;
    save_settings(&settings)?;

    Ok(if enabled {
        "Clipboard auto-start enabled".into()
    } else {
        "Clipboard auto-start disabled".into()
    })
}

#[tauri::command]
pub fn set_control_copy_paste(enabled: bool) -> Result<String, String> {
    let mut settings = load_settings();
    settings.control_copy_paste = enabled;
    save_settings(&settings)?;

    Ok(if enabled {
        "Control copy/paste enabled".into()
    } else {
        "Control copy/paste disabled".into()
    })
}

#[tauri::command]
pub fn set_import_file_size_limit_kb(kb: u64) -> Result<String, String> {
    let mut settings = load_settings();
    settings.import_file_size_limit_kb = normalize_import_file_size_limit_kb(kb);
    save_settings(&settings)?;
    Ok("ok".into())
}

#[tauri::command]
pub fn set_shortcuts(
    app: tauri::AppHandle,
    shortcuts: KeyboardShortcuts,
) -> Result<String, String> {
    validate_shortcuts(&shortcuts)?;
    #[cfg(not(desktop))]
    let _ = &app;
    let mut settings = load_settings();
    #[cfg(desktop)]
    if let Err(e) = register_global_shortcuts_for(&app, &shortcuts) {
        let _ = register_global_shortcuts_for(&app, &settings.shortcuts);
        return Err(e);
    }
    #[cfg(desktop)]
    let previous_shortcuts = settings.shortcuts.clone();
    settings.shortcuts = shortcuts;
    if let Err(e) = save_settings(&settings) {
        #[cfg(desktop)]
        let _ = register_global_shortcuts_for(&app, &previous_shortcuts);
        return Err(e);
    }
    Ok("ok".into())
}

#[tauri::command]
pub fn set_proxy(mode: String, url: String) -> Result<String, String> {
    let proxy_mode = match mode.as_str() {
        "none" => ProxyMode::None,
        "custom" => ProxyMode::Custom,
        _ => ProxyMode::System,
    };

    if proxy_mode == ProxyMode::Custom && !url.is_empty() {
        url::Url::parse(&url).map_err(|e| format!("Invalid proxy URL: {e}"))?;
    }

    let mut settings = load_settings();
    settings.proxy_mode = proxy_mode;
    settings.proxy_url = url;
    save_settings(&settings)?;

    apply_proxy_env();
    Ok("ok".into())
}

pub fn apply_proxy_env() {
    let settings = load_settings();
    match settings.proxy_mode {
        ProxyMode::None => {
            std::env::remove_var("HTTP_PROXY");
            std::env::remove_var("HTTPS_PROXY");
            std::env::set_var("NO_PROXY", "*");
        }
        ProxyMode::Custom if !settings.proxy_url.is_empty() => {
            std::env::set_var("HTTP_PROXY", &settings.proxy_url);
            std::env::set_var("HTTPS_PROXY", &settings.proxy_url);
            std::env::remove_var("NO_PROXY");
        }
        _ => {
            // System: detect macOS system proxy and set env vars
            std::env::remove_var("NO_PROXY");
            if let Some(proxy) = detect_macos_system_proxy() {
                std::env::set_var("HTTP_PROXY", &proxy);
                std::env::set_var("HTTPS_PROXY", &proxy);
            } else {
                std::env::remove_var("HTTP_PROXY");
                std::env::remove_var("HTTPS_PROXY");
            }
        }
    }
}

/// Detect macOS system proxy by parsing `scutil --proxy` output.
fn detect_macos_system_proxy() -> Option<String> {
    let output = std::process::Command::new("scutil")
        .arg("--proxy")
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);

    // Try HTTPS proxy first, fall back to HTTP
    if let Some(url) = parse_scutil_proxy(&text, "HTTPS") {
        return Some(url);
    }
    parse_scutil_proxy(&text, "HTTP")
}

/// Parse a specific proxy type (HTTP or HTTPS) from scutil output.
/// Looks for `{prefix}Enable : 1`, `{prefix}Proxy : host`, `{prefix}Port : port`.
fn parse_scutil_proxy(text: &str, prefix: &str) -> Option<String> {
    let enabled_key = format!("{}Enable : 1", prefix);
    if !text.contains(&enabled_key) {
        return None;
    }
    let proxy_key = format!("{}Proxy : ", prefix);
    let port_key = format!("{}Port : ", prefix);
    let host = text
        .lines()
        .find(|l| l.contains(&proxy_key))
        .and_then(|l| l.split(" : ").nth(1))
        .map(|s| s.trim())?;
    let port = text
        .lines()
        .find(|l| l.contains(&port_key))
        .and_then(|l| l.split(" : ").nth(1))
        .map(|s| s.trim())?;
    Some(format!("http://{}:{}", host, port))
}

#[tauri::command]
pub fn get_branch() -> Result<String, String> {
    let config_path = gitmemo_core::utils::config::Config::config_path();
    if config_path.exists() {
        let config =
            gitmemo_core::utils::config::Config::load(&config_path).map_err(|e| e.to_string())?;
        Ok(config.git.branch)
    } else {
        Ok("main".into())
    }
}

#[tauri::command]
pub fn set_branch(name: String) -> Result<String, String> {
    let config_path = gitmemo_core::utils::config::Config::config_path();
    let mut config =
        gitmemo_core::utils::config::Config::load(&config_path).map_err(|e| e.to_string())?;
    let old = config.git.branch.clone();
    config.git.branch = name.clone();
    config.save(&config_path).map_err(|e| e.to_string())?;

    let sync_dir = files::sync_dir();
    git::setup_tracking(&sync_dir, &name);

    Ok(format!("{} → {}", old, name))
}

#[tauri::command]
pub async fn test_remote_sync() -> Result<String, String> {
    let result = tokio::task::spawn_blocking(test_remote_sync_blocking)
        .await
        .map_err(|e| format!("Task join error: {e}"))?;
    if let Err(err) = &result {
        sync_log::write_sync_log("test remote sync", false, err, None);
    }
    result
}

fn test_remote_sync_blocking() -> Result<String, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized".into());
    }
    let test_path = sync_dir.join("notes/scratch/.sync-test");
    std::fs::write(
        &test_path,
        format!("sync test at {:?}\n", std::time::SystemTime::now()),
    )
    .map_err(|e| format!("Write failed: {e}"))?;
    let result = git::commit_and_push(&sync_dir, "test: sync connection test")
        .map_err(|e| format!("Push failed: {}", git_error_for_user(e.to_string())))?;
    if let Some(err) = result.push_error {
        let _ = std::fs::remove_file(&test_path);
        let _ = git::commit_and_push(&sync_dir, "test: cleanup sync test");
        return Err(format!("Push failed: {}", git_error_for_user(err)));
    }
    let _ = std::fs::remove_file(&test_path);
    let cleanup = git::commit_and_push(&sync_dir, "test: cleanup sync test")
        .map_err(|e| format!("Cleanup push failed: {}", git_error_for_user(e.to_string())))?;
    if let Some(err) = cleanup.push_error {
        return Err(format!("Cleanup push failed: {}", git_error_for_user(err)));
    }
    Ok("Sync OK".to_string())
}

#[tauri::command]
pub fn get_ssh_public_key() -> Result<String, String> {
    let config_path = Config::config_path();
    if config_path.exists() {
        if let Ok(config) = Config::load(&config_path) {
            if let Some(path) = config.git.ssh_key_path {
                let key = gitmemo_core::utils::ssh::read_public_key(std::path::Path::new(&path))
                    .map_err(|e| e.to_string())?;
                return Ok(key);
            }
        }
    }

    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let ssh_dir = std::path::PathBuf::from(home).join(".ssh");
    for name in ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"] {
        let path = ssh_dir.join(name);
        if path.exists() {
            let key = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            return Ok(key.trim().to_string());
        }
    }
    Err("No SSH public key found".to_string())
}

#[tauri::command]
pub fn set_remote(url: String, access_token: Option<String>) -> Result<String, String> {
    let url = url.trim().to_string();
    let config_path = gitmemo_core::utils::config::Config::config_path();
    let mut config =
        gitmemo_core::utils::config::Config::load(&config_path).map_err(|e| e.to_string())?;

    let provided_token = access_token
        .as_deref()
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(ToOwned::to_owned);

    #[cfg(target_os = "android")]
    {
        if !url.is_empty() {
            if !(url.starts_with("https://") || url.starts_with("http://")) {
                return Err("Android currently supports HTTPS Git URLs only".to_string());
            }
            let token = provided_token
                .clone()
                .or_else(|| config.git.access_token.clone())
                .filter(|token| !token.trim().is_empty())
                .ok_or_else(|| "Access token is required for Android HTTPS sync".to_string())?;
            config.git.access_token = Some(token);
        } else {
            config.git.access_token = None;
        }
    }

    #[cfg(not(target_os = "android"))]
    {
        if let Some(token) = provided_token {
            config.git.access_token = Some(token);
        } else if url.is_empty() {
            config.git.access_token = None;
        }
    }

    config.git.remote = url.clone();
    config.save(&config_path).map_err(|e| e.to_string())?;

    let sync_dir = files::sync_dir();
    #[cfg(target_os = "android")]
    {
        if url.is_empty() {
            if let Ok(repo) = git2::Repository::open(&sync_dir) {
                let _ = repo.remote_delete("origin");
            }
            return Ok("ok".to_string());
        }
        git::init_repo(&sync_dir, &url).map_err(|e| git_error_for_user(e.to_string()))?;
        git::pull(&sync_dir).map_err(|e| git_error_for_user(e.to_string()))?;
        return Ok("ok".to_string());
    }

    #[cfg(not(target_os = "android"))]
    {
        if url.is_empty() {
            let _ = std::process::Command::new("git")
                .args(["remote", "remove", "origin"])
                .current_dir(&sync_dir)
                .output();
        } else {
            let check = std::process::Command::new("git")
                .args(["remote", "get-url", "origin"])
                .current_dir(&sync_dir)
                .output();
            if check.map(|o| o.status.success()).unwrap_or(false) {
                let _ = std::process::Command::new("git")
                    .args(["remote", "set-url", "origin", &url])
                    .current_dir(&sync_dir)
                    .output();
            } else {
                let _ = std::process::Command::new("git")
                    .args(["remote", "add", "origin", &url])
                    .current_dir(&sync_dir)
                    .output();
            }
            git::setup_tracking(&sync_dir, &config.git.branch);
        }

        Ok("ok".to_string())
    }
}

// ── Helper ──────────────────────────────────────────────────────────────────

fn update_config_lang(lang: &str) -> Result<(), String> {
    let config_path = Config::config_path();
    if !config_path.exists() {
        return Ok(());
    }

    let mut config = Config::load(&config_path).map_err(|e| e.to_string())?;
    if config.lang == lang {
        return Ok(());
    }

    config.lang = lang.to_string();
    config.save(&config_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_language(lang: String) -> Result<String, String> {
    match lang.as_str() {
        "en" | "zh" => update_config_lang(&lang)?,
        _ => return Err("Unsupported language".into()),
    }
    Ok(lang)
}

fn claude_md_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home)
        .join(".claude")
        .join("CLAUDE.md")
}

fn cursor_rules_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home)
        .join(".cursor")
        .join("rules")
        .join("gitmemo.mdc")
}

fn cursor_skills_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home)
        .join(".cursor")
        .join("skills")
}

fn claude_skills_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home)
        .join(".claude")
        .join("skills")
}

fn install_save_skill(skills_dir: &std::path::Path) -> Result<(), String> {
    let save_dir = skills_dir.join("save");
    std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;
    std::fs::write(
        save_dir.join("SKILL.md"),
        include_str!("../../../../skills/save/SKILL.md"),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn install_claude_skills(lang: String) -> Result<(), String> {
    use gitmemo_core::inject::session_log_skill;
    use gitmemo_core::utils::i18n::Lang;

    let sync_dir = files::sync_dir().to_string_lossy().to_string();
    let lang_enum = Lang::parse(&lang);
    let skills = claude_skills_dir();
    install_save_skill(&skills)?;

    let session_log_dir = skills.join("gitmemo-session-log");
    session_log_skill::install(&session_log_dir, &sync_dir, lang_enum)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn install_cursor_skills(lang: String) -> Result<(), String> {
    use gitmemo_core::inject::session_log_skill;
    use gitmemo_core::utils::i18n::Lang;

    let sync_dir = files::sync_dir().to_string_lossy().to_string();
    let lang_enum = Lang::parse(&lang);
    let skills = cursor_skills_dir();
    install_save_skill(&skills)?;

    let session_log_dir = skills.join("gitmemo-session-log");
    session_log_skill::install(&session_log_dir, &sync_dir, lang_enum)
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Claude integration (delegates to gitmemo_core::inject) ──────────────────

#[tauri::command]
pub fn get_claude_integration_status() -> Result<bool, String> {
    let path = claude_md_path();
    if !path.exists() {
        return Ok(false);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content.contains(gitmemo_core::inject::claude_md::MARKER_START))
}

#[tauri::command]
pub fn setup_claude_integration(lang: String) -> Result<String, String> {
    use gitmemo_core::inject::claude_md;
    use gitmemo_core::utils::i18n::Lang;

    update_config_lang(&lang)?;

    let path = claude_md_path();
    let sync_dir = files::sync_dir().to_string_lossy().to_string();
    let lang_enum = Lang::parse(&lang);

    claude_md::inject(&path, &sync_dir, lang_enum).map_err(|e| e.to_string())?;
    install_claude_skills(lang)?;
    Ok("enabled".into())
}

#[tauri::command]
pub fn update_claude_skills(lang: String) -> Result<String, String> {
    update_config_lang(&lang)?;
    install_claude_skills(lang)?;
    Ok("updated".into())
}

#[tauri::command]
pub fn remove_claude_integration() -> Result<String, String> {
    use gitmemo_core::inject::claude_md;

    let path = claude_md_path();
    claude_md::remove(&path).map_err(|e| e.to_string())?;

    // Clean up empty file
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if content.trim().is_empty() {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
    Ok("disabled".into())
}

// ── Cursor integration (delegates to gitmemo_core::inject) ──────────────────

#[tauri::command]
pub fn get_cursor_integration_status() -> Result<bool, String> {
    let path = cursor_rules_path();
    Ok(path.exists())
}

#[tauri::command]
pub fn setup_cursor_integration(lang: String) -> Result<String, String> {
    use gitmemo_core::inject::cursor_rules;
    use gitmemo_core::utils::i18n::Lang;

    update_config_lang(&lang)?;

    let sync_dir = files::sync_dir().to_string_lossy().to_string();
    let lang_enum = Lang::parse(&lang);

    // 1. Write gitmemo.mdc
    cursor_rules::inject(&cursor_rules_path(), &sync_dir, lang_enum).map_err(|e| e.to_string())?;

    // 2. Write bundled skills
    install_cursor_skills(lang)?;

    Ok("enabled".into())
}

#[tauri::command]
pub fn update_cursor_skills(lang: String) -> Result<String, String> {
    update_config_lang(&lang)?;
    install_cursor_skills(lang)?;
    Ok("updated".into())
}

#[tauri::command]
pub fn remove_cursor_integration() -> Result<String, String> {
    use gitmemo_core::inject::cursor_rules;

    cursor_rules::remove(&cursor_rules_path()).map_err(|e| e.to_string())?;

    let skills = cursor_skills_dir();
    for name in ["save", "gitmemo-session-log"] {
        let skill_dir = skills.join(name);
        if skill_dir.exists() {
            let _ = std::fs::remove_dir_all(&skill_dir);
        }
    }

    Ok("disabled".into())
}
