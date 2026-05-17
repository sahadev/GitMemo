use gitmemo_core::storage::{files, git};
use gitmemo_core::utils::config::{Config, GitConfig};
use gitmemo_core::utils::ssh::{self, SshKeyCandidate};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

fn home_dir() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    Ok(std::path::PathBuf::from(home))
}


#[derive(Debug, Deserialize)]
pub struct InitRequest {
    pub lang: String,           // "en" or "zh"
    pub git_url: String,        // empty = local-only
    pub ssh_key_path: Option<String>,
    pub editors: Vec<String>,   // ["claude", "cursor", "codex"]
}

#[derive(Debug, Serialize)]
pub struct InitResult {
    pub success: bool,
    pub steps: Vec<InitStep>,
    pub ssh_public_key: Option<String>,
    pub deploy_keys_url: Option<String>,
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
            deploy_keys_url: None,
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

#[derive(Debug, Serialize)]
pub struct SshKeyScanResult {
    pub candidates: Vec<SshKeyCandidate>,
    pub recommended_key_path: Option<String>,
    pub deploy_keys_url: Option<String>,
}

#[tauri::command]
pub fn scan_ssh_keys(git_url: String) -> Result<SshKeyScanResult, String> {
    let candidates = ssh::list_ssh_key_candidates(&git_url);
    let recommended_key_path = candidates
        .iter()
        .find(|candidate| candidate.recommended)
        .map(|candidate| candidate.path.clone());

    Ok(SshKeyScanResult {
        candidates,
        recommended_key_path,
        deploy_keys_url: ssh::deploy_keys_url(&git_url),
    })
}

#[tauri::command]
pub fn generate_ssh_key(git_url: String) -> Result<SshKeyCandidate, String> {
    ssh::generate_key_candidate(&git_url).map_err(|e| e.to_string())
}


#[tauri::command]
pub fn init_gitmemo(request: InitRequest) -> Result<InitResult, String> {
    init_gitmemo_sync(request)
}

fn init_gitmemo_sync(request: InitRequest) -> Result<InitResult, String> {
    let mut result = InitResult::new();
    let sync_dir = files::sync_dir();
    let has_remote = !request.git_url.is_empty();

    // 1. Create local metadata directory needed by config and git locks
    if let Err(e) = std::fs::create_dir_all(sync_dir.join(".metadata")) {
        result.add_err("directories", &format!("Failed: {e}"));
        return Ok(result);
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
        if ssh::is_ssh_url(&request.git_url) {
            let Some(ssh_key_path) = request.ssh_key_path.as_deref() else {
                result.add_err("ssh_key", "SSH key selection required");
                return Ok(result);
            };

            let key_path = std::path::PathBuf::from(ssh_key_path);
            match ssh::read_public_key(&key_path) {
                Ok(pub_key) => {
                    result.ssh_public_key = Some(pub_key);
                    result.deploy_keys_url = ssh::deploy_keys_url(&request.git_url);
                    result.add_ok("ssh_key", "SSH key selected");
                }
                Err(e) => {
                    result.add_err("ssh_key", &format!("SSH key error: {e}"));
                    return Ok(result);
                }
            }
        } else {
            result.deploy_keys_url = ssh::deploy_keys_url(&request.git_url);
        }
    }

    // 4. Save config
    let branch = "main".to_string();

    let config = Config {
        git: GitConfig {
            remote: request.git_url.clone(),
            branch: branch.clone(),
            ssh_key_path: request.ssh_key_path.clone(),
        },
        lang: request.lang.clone(),
    };

    match config.save(&Config::config_path()) {
        Ok(()) => result.add_ok("config", "Configuration saved"),
        Err(e) => {
            result.add_err("config", &format!("Config save failed: {e}"));
        }
    }

    if has_remote {
        result.add_ok("remote", "Remote configured");
    }

    // 5. Create directory structure
    match files::create_directory_structure(&sync_dir) {
        Ok(()) => result.add_ok("directories", "Directory structure created"),
        Err(e) => {
            result.add_err("directories", &format!("Failed: {e}"));
            return Ok(result);
        }
    }

    for dir in ["clips", "plans", "imports", "claude-config"] {
        let _ = std::fs::create_dir_all(sync_dir.join(dir));
    }

    // 6. Editor integrations
    let install_claude = request.editors.contains(&"claude".to_string());
    let install_cursor = request.editors.contains(&"cursor".to_string());
    let install_codex = request.editors.contains(&"codex".to_string());
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

    if install_codex {
        result.add_ok("codex", "Codex capture enabled");
    }

    // 7. Initial commit
    match git::commit_only(&sync_dir, "init: gitmemo") {
        Ok(_) => result.add_ok("commit", "Initial commit created"),
        Err(e) => result.add_err("commit", &format!("Commit failed: {e}")),
    }

    // 8. Setup tracking if remote
    if has_remote {
        git::setup_tracking(&sync_dir, &branch);
        result.add_ok("tracking", "Branch tracking configured");
        result.needs_remote_sync = true;
    }

    Ok(result)
}

/// Set up Claude Code integration (CLAUDE.md + settings hook + MCP + skills)
fn setup_claude_full(sync_dir: &str, lang: &str) -> Result<(), String> {
    use gitmemo_core::inject::{claude_md, settings_hook, mcp_register, session_log_skill};
    use gitmemo_core::utils::i18n::Lang;

    let home = home_dir()?;
    let lang_enum = Lang::parse(lang);

    // 1. CLAUDE.md injection
    let claude_md_path = home.join(".claude").join("CLAUDE.md");
    claude_md::inject(&claude_md_path, sync_dir, lang_enum)
        .map_err(|e| format!("CLAUDE.md injection failed: {e}"))?;

    // 2. Settings hook injection
    let settings_path = home.join(".claude").join("settings.json");
    settings_hook::inject(&settings_path, sync_dir)
        .map_err(|e| format!("Settings hook failed: {e}"))?;

    // 3. MCP server registration
    let claude_json = home.join(".claude.json");
    let cli_path = which_gitmemo().unwrap_or_else(|| "gitmemo".to_string());
    mcp_register::register(&claude_json, &cli_path)
        .map_err(|e| format!("MCP registration failed: {e}"))?;

    // 4. Skills
    let skills_dir = home.join(".claude").join("skills");
    install_save_skill(&skills_dir)?;
    let session_dir = skills_dir.join("gitmemo-session-log");
    session_log_skill::install(&session_dir, sync_dir, lang_enum)
        .map_err(|e| format!("Session-log skill failed: {e}"))?;

    Ok(())
}

/// Set up Cursor integration (rules + MCP + skills)
fn setup_cursor_full(sync_dir: &str, lang: &str) -> Result<(), String> {
    use gitmemo_core::inject::{cursor_rules, cursor_mcp, session_log_skill};
    use gitmemo_core::utils::i18n::Lang;

    let home = home_dir()?;
    let lang_enum = Lang::parse(lang);

    // 1. Cursor rules
    let rules_path = home.join(".cursor").join("rules").join("gitmemo.mdc");
    cursor_rules::inject(&rules_path, sync_dir, lang_enum)
        .map_err(|e| format!("Cursor rules failed: {e}"))?;

    // 2. Skills (save + session-log)
    let skills_dir = home.join(".cursor").join("skills");
    install_save_skill(&skills_dir)?;
    let session_dir = skills_dir.join("gitmemo-session-log");
    session_log_skill::install(&session_dir, sync_dir, lang_enum)
        .map_err(|e| format!("Session-log skill failed: {e}"))?;

    // 3. MCP for Cursor
    let cursor_mcp_path = home.join(".cursor").join("mcp.json");
    let cli_path = which_gitmemo().unwrap_or_else(|| "gitmemo".to_string());
    cursor_mcp::register(&cursor_mcp_path, &cli_path)
        .map_err(|e| format!("Cursor MCP failed: {e}"))?;

    Ok(())
}

/// Install /save skill (uses include_str! with Desktop-relative path)
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
    let mut branch = if config_path.exists() {
        Config::load(&config_path)
            .map(|c| c.git.branch)
            .unwrap_or_else(|_| "main".to_string())
    } else {
        "main".to_string()
    };

    let detected_branch = git::detect_remote_branch(sync_dir);
    if !detected_branch.is_empty() {
        branch = detected_branch;
        if config_path.exists() {
            if let Ok(mut config) = Config::load(&config_path) {
                if config.git.branch != branch {
                    config.git.branch = branch.clone();
                    let _ = config.save(&config_path);
                }
            }
        }
    }

    // Step 1: check if remote has history
    let has_remote_commits = git::remote_branch_exists(sync_dir, &branch)
        .map_err(|e| format!("remote check failed: {e}"))?;

    if !has_remote_commits {
        let (pushed, push_err) = push_to_remote(sync_dir, &branch);
        return if pushed {
            Ok("Pushed to empty remote".into())
        } else {
            Err(format!("Push failed: {}", push_err.unwrap_or_default()))
        };
    }

    // Step 2: fetch remote
    let fetch = git::fetch_branch(sync_dir, &branch)
        .map_err(|e| format!("fetch failed: {e}"))?;

    if !fetch.0 {
        return Err(format!("Fetch failed (SSH key may not be configured yet): {}", fetch.2.trim()));
    }

    // Step 3: rebase local init commit(s) on top of remote history
    let rebase = git::rebase_onto_remote(sync_dir, &branch)
        .map_err(|e| format!("rebase failed: {e}"))?;

    if !rebase.0 {
        eprintln!("[gitmemo] init rebase failed, resetting to remote and re-applying init files");
        git::abort_rebase(sync_dir);
        git::reset_hard_to_remote(sync_dir, &branch);

        let _ = files::create_directory_structure(sync_dir);
        for dir in ["clips", "plans", "imports", "claude-config"] {
            let _ = std::fs::create_dir_all(sync_dir.join(dir));
        }

        let _ = git::commit_only(sync_dir, "init: gitmemo setup");
    }

    // Step 4: push
    let (pushed, push_err) = push_to_remote(sync_dir, &branch);
    if pushed {
        Ok("Synced with remote".into())
    } else {
        Err(format!("Merged remote history, but push failed: {}", push_err.unwrap_or_default()))
    }
}

fn push_to_remote(repo_path: &std::path::Path, branch: &str) -> (bool, Option<String>) {
    git::push_branch(repo_path, branch).unwrap_or_else(|e| (false, Some(e.to_string())))
}

// ── Capture conversations ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CaptureResponse {
    pub new_sessions: usize,
    pub updated_sessions: usize,
    pub skipped: usize,
}

#[tauri::command]
pub async fn capture_conversations() -> Result<CaptureResponse, String> {
    tokio::task::spawn_blocking(capture_conversations_sync)
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

pub(crate) fn capture_conversations_sync() -> Result<CaptureResponse, String> {
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
