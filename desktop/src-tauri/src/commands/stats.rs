use gitmemo_core::storage::{database, files, git};
use serde::Serialize;

fn local_timestamp(now: &chrono::DateTime<chrono::Local>) -> String {
    now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

#[derive(Debug, Serialize)]
pub struct AppStats {
    pub conversations: u32,
    pub daily_notes: u32,
    pub manuals: u32,
    pub scratch_notes: u32,
    pub clips: usize,
    pub plans: usize,
    pub total_size_kb: f64,
}

#[derive(Debug, Serialize)]
pub struct AppStatus {
    pub initialized: bool,
    pub sync_dir: String,
    pub git_remote: String,
    pub git_branch: String,
    pub unpushed: usize,
    pub behind: usize,
    pub last_commit_id: String,
    pub last_commit_msg: String,
    pub last_commit_time: String,
    pub checked_at: String,
}

#[tauri::command]
pub fn get_stats() -> Result<AppStats, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo 未初始化".into());
    }

    let db_path = sync_dir.join(".metadata").join("index.db");
    let conn = database::open_or_create(&db_path).map_err(|e| e.to_string())?;
    // Auto-rebuild index if empty (e.g. first load after init)
    let stats = database::get_stats(&conn).map_err(|e| e.to_string())?;
    let stats = if stats.conversation_count == 0
        && stats.note_daily_count == 0
        && stats.note_manual_count == 0
        && stats.note_scratch_count == 0
    {
        database::build_index(&conn, &sync_dir).ok();
        database::get_stats(&conn).map_err(|e| e.to_string())?
    } else {
        stats
    };

    let total_size: u64 = walkdir::WalkDir::new(&sync_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum();

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
            behind: 0,
            last_commit_id: String::new(),
            last_commit_msg: String::new(),
            last_commit_time: String::new(),
            checked_at: String::new(),
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

    let (unpushed, behind) = git::ahead_behind(&sync_dir).unwrap_or((0, 0));

    // Get last commit info
    let (last_commit_id, last_commit_msg, last_commit_time) = get_last_commit(&sync_dir);
    let checked_at = local_timestamp(&chrono::Local::now());

    Ok(AppStatus {
        initialized: true,
        sync_dir: sync_dir.to_string_lossy().to_string(),
        git_remote: remote,
        git_branch: branch,
        unpushed,
        behind,
        last_commit_id,
        last_commit_msg,
        last_commit_time,
        checked_at,
    })
}

#[derive(Debug, Serialize)]
pub struct RecentItem {
    pub name: String,
    pub path: String,
    pub category: String,
    pub modified: String,
    pub modified_ts: i64,
}

#[tauri::command]
pub fn get_recent_activity() -> Result<Vec<RecentItem>, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Ok(vec![]);
    }

    let folders = ["conversations", "notes/scratch", "notes/daily", "notes/manual", "clips", "plans"];
    let mut items: Vec<RecentItem> = Vec::new();

    for folder in &folders {
        let target = sync_dir.join(folder);
        if !target.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&target)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        {
            let path = entry.path();
            let rel_path = path
                .strip_prefix(&sync_dir)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();
            let meta = path.metadata().ok();
            let modified_time = meta.as_ref().and_then(|m| m.modified().ok());
            let modified_ts = modified_time
                .map(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64
                })
                .unwrap_or(0);
            let modified = modified_time
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Local> = t.into();
                    local_timestamp(&dt)
                })
                .unwrap_or_default();

            let name = path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let category = if rel_path.starts_with("conversations") {
                "conversation"
            } else if rel_path.starts_with("clips") {
                "clip"
            } else if rel_path.starts_with("plans") {
                "plan"
            } else if rel_path.starts_with("notes/daily") {
                "daily"
            } else if rel_path.starts_with("notes/manual") {
                "manual"
            } else {
                "scratch"
            };

            items.push(RecentItem {
                name,
                path: rel_path,
                category: category.to_string(),
                modified,
                modified_ts,
            });
        }
    }

    items.sort_by(|a, b| b.modified_ts.cmp(&a.modified_ts));
    items.truncate(8);
    Ok(items)
}

/// Get a random historical item for "Today's Review" feature
#[tauri::command]
pub fn get_review_item() -> Result<Option<RecentItem>, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Ok(None);
    }

    let min_age_days = 7; // Only show items at least 7 days old
    let now = std::time::SystemTime::now();
    let min_age = std::time::Duration::from_secs(min_age_days * 24 * 60 * 60);

    let folders = ["conversations", "notes/scratch", "notes/daily", "notes/manual"];
    let mut candidates: Vec<RecentItem> = Vec::new();

    for folder in &folders {
        let target = sync_dir.join(folder);
        if !target.exists() { continue; }
        for entry in walkdir::WalkDir::new(&target)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        {
            let path = entry.path();
            let meta = path.metadata().ok();
            let modified_time = meta.as_ref().and_then(|m| m.modified().ok());

            // Only include items older than min_age
            if let Some(mt) = modified_time {
                if let Ok(age) = now.duration_since(mt) {
                    if age < min_age { continue; }
                }
            }

            let rel_path = path.strip_prefix(&sync_dir).unwrap_or(path).to_string_lossy().to_string();
            let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let modified_ts = modified_time
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
                .unwrap_or(0);
            let modified = modified_time
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Local> = t.into();
                    local_timestamp(&dt)
                })
                .unwrap_or_default();

            let category = if rel_path.starts_with("conversations") { "conversation" }
                else if rel_path.starts_with("notes/daily") { "daily" }
                else if rel_path.starts_with("notes/manual") { "manual" }
                else { "scratch" };

            candidates.push(RecentItem {
                name,
                path: rel_path,
                category: category.to_string(),
                modified,
                modified_ts,
            });
        }
    }

    if candidates.is_empty() {
        return Ok(None);
    }

    // Pick a pseudo-random item based on current time
    let idx = (chrono::Local::now().timestamp() as usize) % candidates.len();
    Ok(Some(candidates.remove(idx)))
}

fn get_last_commit(repo_path: &std::path::Path) -> (String, String, String) {
    let output = std::process::Command::new("git")
        .args(["log", "-1", "--format=%h|%s|%cI"])
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
