use gitmemo_core::storage::{database, files, git};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppStats {
    pub conversations: u32,
    pub daily_notes: u32,
    pub manuals: u32,
    pub scratch_notes: u32,
    pub clips: usize,
    pub plans: usize,
    pub total_size_kb: f64,
    pub unpushed: usize,
}

#[derive(Debug, Serialize)]
pub struct AppStatus {
    pub initialized: bool,
    pub sync_dir: String,
    pub git_remote: String,
    pub git_branch: String,
    pub unpushed: usize,
    pub last_commit_id: String,
    pub last_commit_msg: String,
    pub last_commit_time: String,
}

#[tauri::command]
pub fn get_stats() -> Result<AppStats, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo 未初始化".into());
    }

    let db_path = sync_dir.join(".metadata").join("index.db");
    let conn = database::open_or_create(&db_path).map_err(|e| e.to_string())?;
    database::build_index(&conn, &sync_dir).map_err(|e| e.to_string())?;
    let stats = database::get_stats(&conn).map_err(|e| e.to_string())?;

    let total_size: u64 = walkdir::WalkDir::new(&sync_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum();

    let unpushed = git::unpushed_count(&sync_dir).unwrap_or(0);

    let clips = {
        let clips_dir = sync_dir.join("clips");
        if clips_dir.exists() {
            walkdir::WalkDir::new(&clips_dir)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
                .count()
        } else {
            0
        }
    };

    let plans = {
        let plans_dir = sync_dir.join("plans");
        if plans_dir.exists() {
            walkdir::WalkDir::new(&plans_dir)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
                .count()
        } else {
            0
        }
    };

    Ok(AppStats {
        conversations: stats.conversation_count,
        daily_notes: stats.note_daily_count,
        manuals: stats.note_manual_count,
        scratch_notes: stats.note_scratch_count,
        clips,
        plans,
        total_size_kb: total_size as f64 / 1024.0,
        unpushed,
    })
}

#[tauri::command]
pub fn get_status() -> Result<AppStatus, String> {
    let sync_dir = files::sync_dir();
    let initialized = sync_dir.exists();

    if !initialized {
        return Ok(AppStatus {
            initialized: false,
            sync_dir: sync_dir.to_string_lossy().to_string(),
            git_remote: String::new(),
            git_branch: String::new(),
            unpushed: 0,
            last_commit_id: String::new(),
            last_commit_msg: String::new(),
            last_commit_time: String::new(),
        });
    }

    let config_path = gitmemo_core::utils::config::Config::config_path();
    let (remote, branch) = if config_path.exists() {
        match gitmemo_core::utils::config::Config::load(&config_path) {
            Ok(c) => (c.git.remote, c.git.branch),
            Err(_) => (String::new(), String::new()),
        }
    } else {
        (String::new(), String::new())
    };

    let unpushed = git::unpushed_count(&sync_dir).unwrap_or(0);

    // Get last commit info
    let (last_commit_id, last_commit_msg, last_commit_time) = get_last_commit(&sync_dir);

    Ok(AppStatus {
        initialized: true,
        sync_dir: sync_dir.to_string_lossy().to_string(),
        git_remote: remote,
        git_branch: branch,
        unpushed,
        last_commit_id,
        last_commit_msg,
        last_commit_time,
    })
}

fn get_last_commit(repo_path: &std::path::Path) -> (String, String, String) {
    let output = std::process::Command::new("git")
        .args(["log", "-1", "--format=%h|%s|%cd", "--date=format:%Y-%m-%d %H:%M:%S"])
        .current_dir(repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let line = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            if parts.len() == 3 {
                (parts[0].to_string(), parts[1].to_string(), parts[2].to_string())
            } else {
                (String::new(), String::new(), String::new())
            }
        }
        _ => (String::new(), String::new(), String::new()),
    }
}
