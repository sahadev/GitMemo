use gitmemo_core::storage::files;
use serde::{Deserialize, Serialize};
use tauri_plugin_autostart::ManagerExt;

const SETTINGS_FILE: &str = "desktop_settings.toml";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DesktopSettings {
    pub autostart: bool,
    pub clipboard_autostart: bool,
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
pub fn get_settings(app: tauri::AppHandle) -> Result<DesktopSettings, String> {
    let mut settings = load_settings();
    // Check actual autostart state from plugin
    if let Ok(autostart) = app.autolaunch().is_enabled() {
        settings.autostart = autostart;
    }
    Ok(settings)
}

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
