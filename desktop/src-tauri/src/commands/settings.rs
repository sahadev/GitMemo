use gitmemo_core::storage::{files, git};
use serde::{Deserialize, Serialize};
use tauri_plugin_autostart::ManagerExt;

const SETTINGS_FILE: &str = "desktop_settings.toml";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopSettings {
    pub autostart: bool,
    #[serde(default = "default_true")]
    pub clipboard_autostart: bool,
}

fn default_true() -> bool { true }

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            autostart: false,
            clipboard_autostart: true,
        }
    }
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

const CLAUDE_MARKER_START: &str = "<!-- [gitmemo:start] -->";
const CLAUDE_MARKER_END: &str = "<!-- [gitmemo:end] -->";

fn claude_md_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home).join(".claude").join("CLAUDE.md")
}

fn generate_claude_config() -> String {
    let sync_dir = files::sync_dir().to_string_lossy().to_string();
    format!(
        r#"{CLAUDE_MARKER_START}
## GitMemo - Auto Conversation Saving

**Important**: After answering the user's question, save the conversation as a Markdown file. This is a core responsibility.

**When to save**:
- After completing an answer to the user's question
- When the user says "save", "保存会话"

**Save location**: `{sync_dir}/conversations/{{YYYY-MM}}/{{MM-DD}}-{{title_summary}}.md`

**Format**:
```markdown
---
title: {{conversation title}}
date: {{YYYY-MM-DD HH:MM:SS}}
model: {{model name}}
messages: {{message count}}
---

# {{conversation title}}

### User (HH:MM:SS)
{{user message}}

### Assistant (HH:MM:SS)
{{assistant response}}
```

**Rules**:
- Append follow-ups to the existing file, don't create new ones for the same session
- New session creates a new file
- Save silently, don't tell the user
- Auto-generate title from content, Chinese max 20 chars
- Preserve code blocks with original language tags
- Filter API keys/passwords → replace with `***`

## GitMemo - Plan File Sync

When creating or updating plan files in Plan mode, also copy the plan content to `{sync_dir}/plans/`. Keep the same filename. This ensures plans are synced via Git.

## GitMemo - Auto-save Standalone Documents

When you generate **standalone, reference-worthy documents** (not ordinary conversation replies), auto-save them to GitMemo.

**Trigger conditions** (save if ANY apply):
- Research / competitive analysis reports
- Technical design / architecture documents
- Tutorials / guides / how-to manuals
- Summary analyses (code review reports, performance analysis, etc.)
- User explicitly asks to "write a document/report/analysis"

**Do NOT trigger**: Regular Q&A, short replies, code edits, debugging

**Save location**: `{sync_dir}/notes/manual/{{{{title}}}}.md`

**Format**:
```markdown
---
title: {{{{document title}}}}
date: {{{{YYYY-MM-DD}}}}
tags: {{{{comma-separated tags}}}}
---

{{{{document body, preserve original Markdown format}}}}
```

**Rules**:
- Title should reflect the document topic, max 60 characters
- Save silently, do not tell the user
- Tags should include document type (research/design/tutorial/analysis etc.)
- If a file with the same name already exists, overwrite it
{CLAUDE_MARKER_END}"#
    )
}

#[tauri::command]
pub fn get_claude_integration_status() -> Result<bool, String> {
    let path = claude_md_path();
    if !path.exists() {
        return Ok(false);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content.contains(CLAUDE_MARKER_START))
}

#[tauri::command]
pub fn setup_claude_integration() -> Result<String, String> {
    let path = claude_md_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let config_block = generate_claude_config();

    if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if content.contains(CLAUDE_MARKER_START) {
            // Replace existing block
            let start = content.find(CLAUDE_MARKER_START).unwrap();
            let end = content.find(CLAUDE_MARKER_END).map(|i| i + CLAUDE_MARKER_END.len()).unwrap_or(content.len());
            let new_content = format!("{}{}{}", &content[..start], config_block, &content[end..]);
            std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
            return Ok("updated".into());
        } else {
            // Append
            let new_content = format!("{}\n\n{}\n", content.trim_end(), config_block);
            std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
            return Ok("enabled".into());
        }
    } else {
        std::fs::write(&path, format!("{}\n", config_block)).map_err(|e| e.to_string())?;
        return Ok("enabled".into());
    }
}

#[tauri::command]
pub fn remove_claude_integration() -> Result<String, String> {
    let path = claude_md_path();
    if !path.exists() {
        return Ok("disabled".into());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if let Some(start) = content.find(CLAUDE_MARKER_START) {
        let end = content.find(CLAUDE_MARKER_END).map(|i| i + CLAUDE_MARKER_END.len()).unwrap_or(content.len());
        let new_content = format!("{}{}", content[..start].trim_end(), &content[end..]);
        let new_content = new_content.trim().to_string();
        if new_content.is_empty() {
            let _ = std::fs::remove_file(&path);
        } else {
            std::fs::write(&path, format!("{}\n", new_content)).map_err(|e| e.to_string())?;
        }
    }
    Ok("disabled".into())
}
