use gitmemo_core::storage::{files, git};
use serde::{Deserialize, Serialize};
#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt;

const SETTINGS_FILE: &str = "desktop_settings.toml";

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
    pub proxy_mode: ProxyMode,
    #[serde(default)]
    pub proxy_url: String,
}

fn default_true() -> bool { true }

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            autostart: false,
            clipboard_autostart: true,
            proxy_mode: ProxyMode::default(),
            proxy_url: String::new(),
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

fn settings_path() -> std::path::PathBuf {
    files::sync_dir().join(".metadata").join(SETTINGS_FILE)
}

fn load_settings() -> DesktopSettings {
    let path = settings_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(settings) = toml::from_str::<DesktopSettings>(&content) {
                return settings;
            }
        }
    }
    DesktopSettings::default()
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

pub fn should_autostart_clipboard() -> bool {
    load_settings().clipboard_autostart
}

#[tauri::command]
pub fn get_app_meta() -> Result<AppMeta, String> {
    Ok(AppMeta {
        version: env!("CARGO_PKG_VERSION").to_string(),
        release_time: option_env!("GITMEMO_RELEASE_TIME").unwrap_or("").to_string(),
        requires_cli: false,
        recommended_cli_version: env!("CARGO_PKG_VERSION").to_string(),
    })
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
    let host = text.lines()
        .find(|l| l.contains(&proxy_key))
        .and_then(|l| l.split(" : ").nth(1))
        .map(|s| s.trim())?;
    let port = text.lines()
        .find(|l| l.contains(&port_key))
        .and_then(|l| l.split(" : ").nth(1))
        .map(|s| s.trim())?;
    Some(format!("http://{}:{}", host, port))
}

#[tauri::command]
pub fn get_branch() -> Result<String, String> {
    let config_path = gitmemo_core::utils::config::Config::config_path();
    if config_path.exists() {
        let config = gitmemo_core::utils::config::Config::load(&config_path).map_err(|e| e.to_string())?;
        Ok(config.git.branch)
    } else {
        Ok("main".into())
    }
}

#[tauri::command]
pub fn set_branch(name: String) -> Result<String, String> {
    let config_path = gitmemo_core::utils::config::Config::config_path();
    let mut config = gitmemo_core::utils::config::Config::load(&config_path).map_err(|e| e.to_string())?;
    let old = config.git.branch.clone();
    config.git.branch = name.clone();
    config.save(&config_path).map_err(|e| e.to_string())?;

    let sync_dir = files::sync_dir();
    git::setup_tracking(&sync_dir, &name);

    Ok(format!("{} → {}", old, name))
}

#[tauri::command]
pub fn test_remote_sync() -> Result<String, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized".into());
    }
    let test_path = sync_dir.join("notes/scratch/.sync-test");
    std::fs::write(&test_path, format!("sync test at {:?}\n", std::time::SystemTime::now()))
        .map_err(|e| format!("Write failed: {e}"))?;
    git::commit_and_push(&sync_dir, "test: sync connection test")
        .map_err(|e| format!("Push failed: {e}"))?;
    let _ = std::fs::remove_file(&test_path);
    let _ = git::commit_and_push(&sync_dir, "test: cleanup sync test");
    Ok("Sync OK".to_string())
}

#[tauri::command]
pub fn get_ssh_public_key() -> Result<String, String> {
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
pub fn set_remote(url: String) -> Result<String, String> {
    let config_path = gitmemo_core::utils::config::Config::config_path();
    let mut config = gitmemo_core::utils::config::Config::load(&config_path).map_err(|e| e.to_string())?;
    config.git.remote = url.clone();
    config.save(&config_path).map_err(|e| e.to_string())?;

    let sync_dir = files::sync_dir();
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

// ── Helper ──────────────────────────────────────────────────────────────────

fn detect_lang() -> gitmemo_core::utils::i18n::Lang {
    use gitmemo_core::utils::{config::Config, i18n::Lang};
    let config_path = Config::config_path();
    if config_path.exists() {
        if let Ok(config) = Config::load(&config_path) {
            return Lang::parse(&config.lang);
        }
    }
    Lang::En
}

fn claude_md_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home).join(".claude").join("CLAUDE.md")
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
    std::path::PathBuf::from(home).join(".cursor").join("skills")
}

fn claude_skills_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home).join(".claude").join("skills")
}

fn install_save_skill(skills_dir: &std::path::Path) -> Result<(), String> {
    let save_dir = skills_dir.join("save");
    std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;
    std::fs::write(save_dir.join("SKILL.md"), include_str!("../../../../skills/save/SKILL.md"))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn install_claude_skills() -> Result<(), String> {
    use gitmemo_core::inject::session_log_skill;

    let sync_dir = files::sync_dir().to_string_lossy().to_string();
    let lang = detect_lang();
    let skills = claude_skills_dir();
    install_save_skill(&skills)?;

    let session_log_dir = skills.join("gitmemo-session-log");
    session_log_skill::install(&session_log_dir, &sync_dir, lang).map_err(|e| e.to_string())?;
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
    session_log_skill::install(&session_log_dir, &sync_dir, lang_enum).map_err(|e| e.to_string())?;
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
pub fn setup_claude_integration() -> Result<String, String> {
    use gitmemo_core::inject::claude_md;

    let path = claude_md_path();
    let sync_dir = files::sync_dir().to_string_lossy().to_string();
    let lang = detect_lang();

    claude_md::inject(&path, &sync_dir, lang).map_err(|e| e.to_string())?;
    install_claude_skills()?;
    Ok("enabled".into())
}

#[tauri::command]
pub fn update_claude_skills() -> Result<String, String> {
    install_claude_skills()?;
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

    let sync_dir = files::sync_dir().to_string_lossy().to_string();
    let lang_enum = Lang::parse(&lang);

    // 1. Write gitmemo.mdc
    cursor_rules::inject(&cursor_rules_path(), &sync_dir, lang_enum)
        .map_err(|e| e.to_string())?;

    // 2. Write bundled skills
    install_cursor_skills(lang)?;

    Ok("enabled".into())
}

#[tauri::command]
pub fn update_cursor_skills(lang: String) -> Result<String, String> {
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
