use gitmemo_core::storage::{files, git};
use gitmemo_core::utils::config::{Config, GitConfig};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

fn home_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    Ok(PathBuf::from(home))
}

#[derive(Debug, Deserialize)]
pub struct InitRequest {
    pub lang: String,           // "en" or "zh"
    pub git_url: String,        // empty = local-only
    pub editors: Vec<String>,   // ["claude", "cursor"]
}

#[derive(Debug, Serialize)]
pub struct InitResult {
    pub success: bool,
    pub steps: Vec<InitStep>,
    pub ssh_public_key: Option<String>,
    pub needs_remote_sync: bool,
}

#[derive(Debug, Serialize)]
pub struct InitStep {
    pub name: String,
    pub ok: bool,
    pub message: String,
}

impl InitResult {
    fn new() -> Self {
        Self {
            success: true,
            steps: Vec::new(),
            ssh_public_key: None,
            needs_remote_sync: false,
        }
    }

    fn add_ok(&mut self, name: &str, msg: &str) {
        self.steps.push(InitStep {
            name: name.to_string(),
            ok: true,
            message: msg.to_string(),
        });
    }

    fn add_err(&mut self, name: &str, msg: &str) {
        self.success = false;
        self.steps.push(InitStep {
            name: name.to_string(),
            ok: false,
            message: msg.to_string(),
        });
    }
}

#[tauri::command]
pub fn init_gitmemo(request: InitRequest) -> Result<InitResult, String> {
    let mut result = InitResult::new();
    let sync_dir = files::sync_dir();
    let has_remote = !request.git_url.is_empty();

    // 1. Create directory structure
    match files::create_directory_structure(&sync_dir) {
        Ok(()) => result.add_ok("directories", "Directory structure created"),
        Err(e) => {
            result.add_err("directories", &format!("Failed: {e}"));
            return Ok(result);
        }
    }

    // Also create clips, plans, imports directories
    for dir in ["clips", "plans", "imports", "claude-config"] {
        let _ = std::fs::create_dir_all(sync_dir.join(dir));
    }

    // 2. Init git repo
    match git::init_repo(&sync_dir, &request.git_url) {
        Ok(_) => result.add_ok("git_init", "Git repository initialized"),
        Err(e) => {
            result.add_err("git_init", &format!("Git init failed: {e}"));
            return Ok(result);
        }
    }

    // 3. SSH key (only if remote)
    if has_remote {
        match find_or_generate_ssh_key() {
            Ok((pub_key, is_new)) => {
                result.ssh_public_key = Some(pub_key.clone());
                if is_new {
                    result.add_ok("ssh_key", "SSH key generated");
                } else {
                    result.add_ok("ssh_key", "Existing SSH key found");
                }
            }
            Err(e) => {
                result.add_err("ssh_key", &format!("SSH key error: {e}"));
                // Continue anyway — user can set up SSH later
            }
        }
    }

    // 4. Save config
    let branch = if has_remote {
        git::detect_remote_branch(&sync_dir)
    } else {
        "main".to_string()
    };

    let config = Config {
        git: GitConfig {
            remote: request.git_url.clone(),
            branch: branch.clone(),
        },
        lang: request.lang.clone(),
    };

    match config.save(&Config::config_path()) {
        Ok(()) => result.add_ok("config", "Configuration saved"),
        Err(e) => {
            result.add_err("config", &format!("Config save failed: {e}"));
        }
    }

    // 5. Editor integrations
    let install_claude = request.editors.contains(&"claude".to_string());
    let install_cursor = request.editors.contains(&"cursor".to_string());
    let sync_dir_str = sync_dir.to_string_lossy().to_string();

    if install_claude {
        match setup_claude_full(&sync_dir_str, &request.lang) {
            Ok(()) => result.add_ok("claude", "Claude Code integration enabled"),
            Err(e) => result.add_err("claude", &format!("Claude setup failed: {e}")),
        }
    }

    if install_cursor {
        match setup_cursor_full(&sync_dir_str, &request.lang) {
            Ok(()) => result.add_ok("cursor", "Cursor integration enabled"),
            Err(e) => result.add_err("cursor", &format!("Cursor setup failed: {e}")),
        }
    }

    // 6. Initial commit (skip push — user hasn't configured SSH key on remote yet)
    match git::commit_only(&sync_dir, "init: gitmemo") {
        Ok(_) => result.add_ok("commit", "Initial commit created"),
        Err(e) => result.add_err("commit", &format!("Commit failed: {e}")),
    }

    // 7. Setup tracking if remote
    if has_remote {
        git::setup_tracking(&sync_dir, &branch);
        result.add_ok("tracking", "Branch tracking configured");
        result.needs_remote_sync = true;
    }

    Ok(result)
}

/// Find existing or generate new SSH key
fn find_or_generate_ssh_key() -> Result<(String, bool), String> {
    let home = home_dir()?;
    let ssh_dir = home.join(".ssh");

    // Check existing keys
    for name in ["id_ed25519", "id_rsa", "id_ecdsa"] {
        let key_path = ssh_dir.join(name);
        let pub_path = ssh_dir.join(format!("{name}.pub"));
        if key_path.exists() && pub_path.exists() {
            let pub_key = std::fs::read_to_string(&pub_path).map_err(|e| e.to_string())?;
            return Ok((pub_key.trim().to_string(), false));
        }
    }

    // Generate new ED25519 key
    std::fs::create_dir_all(&ssh_dir).map_err(|e| e.to_string())?;
    let key_path = ssh_dir.join("id_ed25519");
    let output = std::process::Command::new("ssh-keygen")
        .args([
            "-t", "ed25519",
            "-f", &key_path.to_string_lossy(),
            "-N", "",
            "-q",
        ])
        .output()
        .map_err(|e| format!("ssh-keygen failed: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "ssh-keygen error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let pub_path = ssh_dir.join("id_ed25519.pub");
    let pub_key = std::fs::read_to_string(&pub_path).map_err(|e| e.to_string())?;
    Ok((pub_key.trim().to_string(), true))
}

/// Set up Claude Code integration (CLAUDE.md + settings hook + MCP + skills)
fn setup_claude_full(sync_dir: &str, lang: &str) -> Result<(), String> {
    let home = home_dir()?;

    // 1. CLAUDE.md injection — reuse existing Tauri command logic
    super::settings::setup_claude_integration()
        .map_err(|e| format!("CLAUDE.md injection failed: {e}"))?;

    // 2. Settings hook injection
    let settings_path = home.join(".claude").join("settings.json");
    inject_settings_hook(&settings_path, sync_dir)?;

    // 3. MCP server registration
    let claude_json = home.join(".claude.json");
    inject_mcp_server(&claude_json)?;

    // 4. Skills (save + session-log)
    let skills_dir = home.join(".claude").join("skills");
    install_save_skill(&skills_dir)?;
    install_session_log_skill(&skills_dir, sync_dir, lang)?;

    Ok(())
}

/// Set up Cursor integration (rules + MCP + skills)
fn setup_cursor_full(_sync_dir: &str, lang: &str) -> Result<(), String> {
    // Reuse existing Tauri command
    super::settings::setup_cursor_integration(lang.to_string())?;

    // Also register MCP for Cursor
    let home = home_dir()?;
    let cursor_mcp = home.join(".cursor").join("mcp.json");
    inject_cursor_mcp(&cursor_mcp)?;

    Ok(())
}

/// Inject PostToolUse hook into Claude Code settings.json
fn inject_settings_hook(settings_path: &std::path::Path, sync_dir: &str) -> Result<(), String> {
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = if settings_path.exists() {
        std::fs::read_to_string(settings_path).map_err(|e| e.to_string())?
    } else {
        "{}".to_string()
    };

    let mut json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;

    // Ensure hooks.PostToolUse is an array
    let hooks = json
        .as_object_mut()
        .ok_or("settings.json root is not an object")?
        .entry("hooks")
        .or_insert(serde_json::json!({}));
    let post_tool = hooks
        .as_object_mut()
        .ok_or("hooks is not an object")?
        .entry("PostToolUse")
        .or_insert(serde_json::json!([]));
    let arr = post_tool.as_array_mut().ok_or("PostToolUse is not an array")?;

    // Remove existing gitmemo hook
    arr.retain(|h| {
        h.get("_source").and_then(|s| s.as_str()) != Some("gitmemo")
    });

    // Add new hook
    let hook = serde_json::json!({
        "_source": "gitmemo",
        "matcher": format!("Write|Edit|NotebookEdit"),
        "hooks": [{
            "type": "command",
            "command": format!(
                "FILE=\"$TOOL_INPUT_file_path$TOOL_INPUT_notebook_path\"; if echo \"$FILE\" | grep -q '{}'; then cd '{}' && git add -A && git diff --cached --quiet || git commit -m \"auto: save $(basename \"$FILE\")\" && git push origin HEAD 2>/dev/null & fi",
                sync_dir.replace('\'', "'\\''"),
                sync_dir.replace('\'', "'\\''"),
            ),
        }],
    });
    arr.push(hook);

    let output = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    std::fs::write(settings_path, output).map_err(|e| e.to_string())?;
    Ok(())
}

/// Register MCP server in ~/.claude.json
fn inject_mcp_server(claude_json: &std::path::Path) -> Result<(), String> {
    let binary = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    // For desktop app, we need the CLI binary path
    // Try to find gitmemo CLI in PATH
    let cli_path = which_gitmemo().unwrap_or(binary);

    if let Some(parent) = claude_json.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = if claude_json.exists() {
        std::fs::read_to_string(claude_json).map_err(|e| e.to_string())?
    } else {
        "{}".to_string()
    };

    let mut json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;

    let servers = json
        .as_object_mut()
        .ok_or("root is not an object")?
        .entry("mcpServers")
        .or_insert(serde_json::json!({}));

    servers.as_object_mut().ok_or("mcpServers not object")?.insert(
        "gitmemo".to_string(),
        serde_json::json!({
            "command": cli_path,
            "args": ["mcp-serve"],
        }),
    );

    let output = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    std::fs::write(claude_json, output).map_err(|e| e.to_string())?;
    Ok(())
}

/// Register MCP server in ~/.cursor/mcp.json
fn inject_cursor_mcp(cursor_mcp: &std::path::Path) -> Result<(), String> {
    let cli_path = which_gitmemo().unwrap_or_else(|| "gitmemo".to_string());

    if let Some(parent) = cursor_mcp.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = if cursor_mcp.exists() {
        std::fs::read_to_string(cursor_mcp).map_err(|e| e.to_string())?
    } else {
        "{}".to_string()
    };

    let mut json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;

    let servers = json
        .as_object_mut()
        .ok_or("root is not an object")?
        .entry("mcpServers")
        .or_insert(serde_json::json!({}));

    servers.as_object_mut().ok_or("mcpServers not object")?.insert(
        "gitmemo".to_string(),
        serde_json::json!({
            "command": cli_path,
            "args": ["mcp-serve"],
        }),
    );

    let output = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    std::fs::write(cursor_mcp, output).map_err(|e| e.to_string())?;
    Ok(())
}

/// Install /save skill
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

/// Install session-log skill
fn install_session_log_skill(
    skills_dir: &std::path::Path,
    sync_dir: &str,
    lang: &str,
) -> Result<(), String> {
    let session_dir = skills_dir.join("gitmemo-session-log");
    std::fs::create_dir_all(&session_dir).map_err(|e| e.to_string())?;

    // Generate the skill content using the same function from settings
    let content = super::settings::generate_session_log_skill_content(sync_dir, lang);
    std::fs::write(session_dir.join("SKILL.md"), content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Try to find the gitmemo CLI binary in PATH
fn which_gitmemo() -> Option<String> {
    let output = std::process::Command::new("which")
        .arg("gitmemo")
        .output()
        .ok()?;
    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }
    None
}

// ── Post-init remote sync ─────────────────────────────────────────────────

/// Background sync with remote after initial setup.
/// Fetches remote history and rebases local init commit on top of it,
/// so the local repo shares a common ancestor with the remote.
#[tauri::command]
pub fn sync_remote_init(app_handle: AppHandle) {
    let _ = app_handle.emit("git-sync-start", ());

    std::thread::spawn(move || {
        let sync_dir = files::sync_dir();
        let event = match do_remote_init_sync(&sync_dir) {
            Ok(msg) => super::notes::GitSyncEvent { ok: true, message: msg },
            Err(e) => super::notes::GitSyncEvent { ok: false, message: e },
        };
        let _ = app_handle.emit("git-sync-end", &event);
    });
}

fn do_remote_init_sync(sync_dir: &std::path::Path) -> Result<String, String> {
    let config_path = Config::config_path();
    let branch = if config_path.exists() {
        Config::load(&config_path).map(|c| c.git.branch).unwrap_or_else(|_| "main".to_string())
    } else {
        "main".to_string()
    };

    // Step 1: fetch remote
    let fetch = std::process::Command::new("git")
        .args(["fetch", "origin", &branch])
        .current_dir(sync_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("fetch failed: {e}"))?;

    if !fetch.status.success() {
        let stderr = String::from_utf8_lossy(&fetch.stderr).to_string();
        // Network error or SSH not configured yet — not fatal, user can retry via sync
        return Err(format!("Fetch failed (SSH key may not be configured yet): {}", stderr.trim()));
    }

    // Step 2: check if remote has history
    let has_remote_commits = std::process::Command::new("git")
        .args(["rev-parse", &format!("origin/{}", branch)])
        .current_dir(sync_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !has_remote_commits {
        // Remote is empty — just push our init commit
        let (pushed, push_err) = push_to_remote(sync_dir, &branch);
        return if pushed {
            Ok("Pushed to empty remote".into())
        } else {
            Err(format!("Push failed: {}", push_err.unwrap_or_default()))
        };
    }

    // Step 3: rebase local init commit(s) on top of remote history
    let rebase = std::process::Command::new("git")
        .args(["rebase", &format!("origin/{}", branch)])
        .current_dir(sync_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("rebase failed: {e}"))?;

    if !rebase.status.success() {
        // Rebase conflict — abort, then reset to remote and re-commit init files
        eprintln!("[gitmemo] init rebase failed, resetting to remote and re-applying init files");
        let _ = std::process::Command::new("git")
            .args(["rebase", "--abort"])
            .current_dir(sync_dir)
            .output();

        // Reset to remote HEAD
        let _ = std::process::Command::new("git")
            .args(["reset", "--hard", &format!("origin/{}", branch)])
            .current_dir(sync_dir)
            .output();

        // Re-create directory structure (in case remote doesn't have all dirs)
        let _ = files::create_directory_structure(sync_dir);
        for dir in ["clips", "plans", "imports", "claude-config"] {
            let _ = std::fs::create_dir_all(sync_dir.join(dir));
        }

        // Re-commit any new init files
        let _ = git::commit_only(sync_dir, "init: gitmemo setup");
    }

    // Step 4: push
    let (pushed, push_err) = push_to_remote(sync_dir, &branch);
    if pushed {
        Ok("Synced with remote".into())
    } else {
        // Push failed but local is now on the right history — user can retry
        Err(format!("Merged remote history, but push failed: {}", push_err.unwrap_or_default()))
    }
}

fn push_to_remote(repo_path: &std::path::Path, branch: &str) -> (bool, Option<String>) {
    let output = std::process::Command::new("git")
        .args(["push", "-u", "origin", &format!("HEAD:{}", branch)])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    match output {
        Ok(o) if o.status.success() => (true, None),
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
            (false, Some(if stderr.is_empty() { "push failed".into() } else { stderr }))
        }
        Err(e) => (false, Some(e.to_string())),
    }
}

// ── Capture conversations ──────────────────────────────────────────���───────

#[derive(Debug, Serialize)]
pub struct CaptureResponse {
    pub new_sessions: usize,
    pub updated_sessions: usize,
    pub skipped: usize,
}

#[tauri::command]
pub fn capture_conversations() -> Result<CaptureResponse, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized".into());
    }

    let result = gitmemo_core::storage::capture::run_capture(&sync_dir, None, false)
        .map_err(|e| format!("Capture failed: {e}"))?;

    if result.new_sessions > 0 || result.updated_sessions > 0 {
        let _ = git::commit_and_push(&sync_dir, "auto: capture conversations");
    }

    Ok(CaptureResponse {
        new_sessions: result.new_sessions,
        updated_sessions: result.updated_sessions,
        skipped: result.skipped,
    })
}
