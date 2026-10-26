use gitmemo_core::storage::{database, files, git};
use gitmemo_core::utils::datetime::record_timestamp_for_markdown;
use gitmemo_core::utils::title::extract_display_title;
use serde::Serialize;
use std::collections::HashSet;
use std::io::Read;
use std::path::Path;
use std::process::Command;

const DASHBOARD_RECENT_LIMIT: usize = 8;
const DASHBOARD_RECENT_FOLDERS: [&str; 5] = [
    "conversations",
    "notes/scratch",
    "notes/manual",
    "clips",
    "plans",
];

fn local_timestamp(now: &chrono::DateTime<chrono::Local>) -> String {
    now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

/// Read the start of a Markdown file (frontmatter + head) without loading the whole file.
fn read_md_head(path: &Path) -> String {
    const MAX: usize = 64 * 1024;
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return String::new(),
    };
    let mut buf = vec![0u8; MAX];
    let n = file.read(&mut buf).unwrap_or(0);
    String::from_utf8_lossy(&buf[..n]).into_owned()
}

fn display_name_for_markdown(path: &Path, rel_path: &str, content: &str) -> String {
    extract_display_title(path, rel_path, content)
}

fn display_name_for_indexed_markdown(
    path: &Path,
    rel_path: &str,
    indexed_title: &str,
    content: &str,
) -> String {
    if content.is_empty() {
        indexed_title.to_string()
    } else {
        display_name_for_markdown(path, rel_path, content)
    }
}

/// Count .md files under a directory (recursive).
fn count_md_files(dir: &Path) -> usize {
    if !dir.exists() {
        return 0;
    }
    walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        .count()
}

/// 统计 conversations/ 下的一级子目录数量；没有子目录时按 1 计（平铺存放）。
fn count_subdirs(dir: &Path) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    let count = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .count();
    if count == 0 && dir.exists() { 1 } else { count }
}

fn is_image_ext(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "heic")
    )
}

fn count_image_files(dir: &Path) -> usize {
    if !dir.exists() {
        return 0;
    }
    walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && is_image_ext(e.path()))
        .count()
}

/// 最近 N 秒内活动过的条目数；索引不可用时返回 None，由调用方退化。
fn count_activity_since(sync_dir: &Path, window_secs: i64) -> Option<usize> {
    let db_path = sync_dir.join(".metadata").join("index.db");
    if !db_path.exists() {
        return None;
    }
    let conn = database::open_or_create(&db_path).ok()?;
    let cutoff = chrono::Utc::now().timestamp_millis() - window_secs * 1000;
    database::count_documents_active_since(&conn, cutoff).ok()
}

fn latest_activity_ts(sync_dir: &Path) -> Option<i64> {
    let db_path = sync_dir.join(".metadata").join("index.db");
    if !db_path.exists() {
        return None;
    }
    let conn = database::open_or_create(&db_path).ok()?;
    database::latest_activity_ts(&conn).ok()
}

#[derive(Debug, Serialize)]
pub struct AppStats {
    pub conversations: usize,
    pub manuals: usize,
    pub scratch_notes: usize,
    pub clips: usize,
    pub plans: usize,
    pub tracked_files: usize,
    pub total_size_kb: f64,
    pub repository_size_kb: f64,
    /// 本周新增（索引里 7 天内活动过的条目数）
    pub added_this_week: usize,
    /// 对话的工具来源数量（conversations/ 下的子目录数）
    pub conversation_sources: usize,
    /// 剪贴板里的图片张数（clips/ 下的图片文件）
    pub clip_images: usize,
    /// 最近一次写入的时间戳（毫秒）
    pub last_activity_ts: i64,
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
pub async fn get_stats() -> Result<AppStats, String> {
    tokio::task::spawn_blocking(get_stats_sync)
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn get_stats_sync() -> Result<AppStats, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized".into());
    }

    get_stats_from_index(&sync_dir).or_else(|_| get_stats_from_filesystem(&sync_dir))
}

fn get_stats_from_index(sync_dir: &Path) -> Result<AppStats, String> {
    let db_path = sync_dir.join(".metadata").join("index.db");
    if !db_path.exists() {
        return Err("Search index is not initialized".into());
    }

    let conn = database::open_or_create(&db_path).map_err(|e| e.to_string())?;
    if !database::index_is_ready(&conn).map_err(|e| e.to_string())? {
        return Err("Search index is not ready".into());
    }

    let stats = database::get_dashboard_stats(&conn).map_err(|e| e.to_string())?;
    let repository_size = git::repository_storage_size(sync_dir);

    let week_cutoff = chrono::Utc::now().timestamp_millis() - 7 * 24 * 3600 * 1000;
    Ok(AppStats {
        added_this_week: database::count_documents_active_since(&conn, week_cutoff).unwrap_or(0),
        conversation_sources: count_subdirs(&sync_dir.join("conversations")),
        clip_images: count_image_files(&sync_dir.join("clips")),
        last_activity_ts: database::latest_activity_ts(&conn).unwrap_or(0),
        conversations: stats.conversation_count,
        manuals: stats.note_manual_count,
        scratch_notes: stats.note_scratch_count,
        clips: stats.clip_count,
        plans: stats.plan_count,
        tracked_files: stats.indexed_file_count,
        total_size_kb: stats.total_size_bytes as f64 / 1024.0,
        repository_size_kb: repository_size as f64 / 1024.0,
    })
}

fn get_stats_from_filesystem(sync_dir: &Path) -> Result<AppStats, String> {
    let total_size = git::worktree_content_size(&sync_dir);
    let tracked_files = git::tracked_file_count(&sync_dir);
    let repository_size = git::repository_storage_size(&sync_dir);

    Ok(AppStats {
        conversations: count_md_files(&sync_dir.join("conversations")),
        manuals: count_md_files(&sync_dir.join("notes").join("manual")),
        scratch_notes: count_md_files(&sync_dir.join("notes").join("scratch")),
        clips: count_md_files(&sync_dir.join("clips")),
        plans: count_md_files(&sync_dir.join("plans")),
        tracked_files,
        total_size_kb: total_size as f64 / 1024.0,
        repository_size_kb: repository_size as f64 / 1024.0,
        added_this_week: count_activity_since(sync_dir, 7 * 24 * 3600).unwrap_or(0),
        conversation_sources: count_subdirs(&sync_dir.join("conversations")),
        clip_images: count_image_files(&sync_dir.join("clips")),
        last_activity_ts: latest_activity_ts(sync_dir).unwrap_or(0),
    })
}

#[tauri::command]
pub async fn get_status() -> Result<AppStatus, String> {
    tokio::task::spawn_blocking(get_status_sync)
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn get_status_sync() -> Result<AppStatus, String> {
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
    /// 产出来源：对话的工具目录名、剪贴板类型、manual / plan
    pub source: String,
    /// git 状态：new（未跟踪）/ draft（有改动）/ synced（已提交）
    pub state: String,
}

#[tauri::command]
pub async fn get_recent_activity() -> Result<Vec<RecentItem>, String> {
    tokio::task::spawn_blocking(get_recent_activity_sync)
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn get_recent_activity_sync() -> Result<Vec<RecentItem>, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Ok(vec![]);
    }

    let mut items = get_recent_activity_from_index(&sync_dir)
        .or_else(|_| get_recent_activity_from_filesystem(&sync_dir))?;
    let (untracked, modified) = collect_git_states(&sync_dir);
    for item in items.iter_mut() {
        item.state = state_for_path(&item.path, &untracked, &modified);
    }
    Ok(items)
}

fn is_dashboard_recent_path(rel_path: &str) -> bool {
    DASHBOARD_RECENT_FOLDERS
        .iter()
        .any(|folder| rel_path.starts_with(&format!("{folder}/")))
}

fn recent_category_for_path(rel_path: &str) -> &'static str {
    if rel_path.starts_with("conversations/") {
        "conversation"
    } else if rel_path.starts_with("clips/") {
        "clip"
    } else if rel_path.starts_with("plans/") {
        "plan"
    } else if rel_path.starts_with("notes/manual/") {
        "manual"
    } else {
        "scratch"
    }
}

/// 从路径推导「来源」：对话取工具目录（claude/codex/…），剪贴板取 frontmatter 的 source，
/// 笔记与计划直接用目录名。
fn recent_source_for(rel_path: &str, head: &str) -> String {
    if let Some(rest) = rel_path.strip_prefix("conversations/") {
        let tool = rest.split('/').next().unwrap_or("");
        // 平铺存放时没有子目录，退回 "conversation"
        return if rest.contains('/') && !tool.is_empty() {
            tool.to_string()
        } else {
            "conversation".to_string()
        };
    }
    if rel_path.starts_with("clips/") {
        let source = frontmatter_field(head, "source").unwrap_or_default();
        return match source.as_str() {
            "clipboard-image" => "image".to_string(),
            "clipboard" => "clipboard".to_string(),
            "" => "clipboard".to_string(),
            other => other.to_string(),
        };
    }
    if rel_path.starts_with("notes/manual/") {
        return "manual".to_string();
    }
    if rel_path.starts_with("notes/scratch/") {
        return "scratch".to_string();
    }
    if rel_path.starts_with("plans/") {
        return "plan".to_string();
    }
    "file".to_string()
}

fn frontmatter_field(head: &str, key: &str) -> Option<String> {
    let mut lines = head.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    for line in lines {
        let line = line.trim();
        if line == "---" {
            break;
        }
        if let Some(rest) = line.strip_prefix(key) {
            if let Some(value) = rest.strip_prefix(':') {
                return Some(value.trim().to_string());
            }
        }
    }
    None
}

/// 一次 git status 建立「未跟踪 / 有改动」集合，逐行查表，避免每行起一个进程。
fn collect_git_states(sync_dir: &Path) -> (HashSet<String>, HashSet<String>) {
    let mut untracked = HashSet::new();
    let mut modified = HashSet::new();
    let Ok(output) = Command::new("git").arg("status").arg("--porcelain").current_dir(sync_dir).output() else {
        return (untracked, modified);
    };
    if !output.status.success() {
        return (untracked, modified);
    }
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if line.len() < 4 {
            continue;
        }
        let code = &line[..2];
        let path = line[3..].trim().trim_matches('"').to_string();
        if code.contains("??") {
            untracked.insert(path);
        } else if code.trim() != "" {
            modified.insert(path);
        }
    }
    (untracked, modified)
}

fn state_for_path(path: &str, untracked: &HashSet<String>, modified: &HashSet<String>) -> String {
    if untracked.contains(path) {
        "new".to_string()
    } else if modified.contains(path) {
        "draft".to_string()
    } else {
        "synced".to_string()
    }
}

fn recent_item_from_index(sync_dir: &Path, row: database::RecentDocumentItem) -> RecentItem {
    let full_path = sync_dir.join(&row.file_path);
    let head = read_md_head(&full_path);
    let name = display_name_for_indexed_markdown(&full_path, &row.file_path, &row.title, &head);
    let category = recent_category_for_path(&row.file_path).to_string();
    RecentItem {
        name,
        source: recent_source_for(&row.file_path, &head),
        state: "synced".to_string(),
        path: row.file_path,
        category,
        modified: row.activity_at,
        modified_ts: row.activity_ts,
    }
}

fn get_recent_activity_from_index(sync_dir: &Path) -> Result<Vec<RecentItem>, String> {
    let db_path = sync_dir.join(".metadata").join("index.db");
    if !db_path.exists() {
        return Err("Search index is not initialized".into());
    }

    let conn = database::open_or_create(&db_path).map_err(|e| e.to_string())?;
    if !database::index_is_ready(&conn).map_err(|e| e.to_string())? {
        return Err("Search index is not ready".into());
    }

    database::list_recent_documents(&conn, DASHBOARD_RECENT_LIMIT)
        .map_err(|e| e.to_string())
        .map(|items| {
            items
                .into_iter()
                .map(|row| recent_item_from_index(sync_dir, row))
                .collect()
        })
}

fn get_recent_activity_from_filesystem(sync_dir: &Path) -> Result<Vec<RecentItem>, String> {
    let mut items: Vec<RecentItem> = Vec::new();

    for folder in &DASHBOARD_RECENT_FOLDERS {
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
            if !is_dashboard_recent_path(&rel_path) {
                continue;
            }
            let head = read_md_head(path);
            let meta = path.metadata().ok();
            let modified_time = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .unwrap_or(std::time::UNIX_EPOCH);
            let (modified, modified_ts) = record_timestamp_for_markdown(&head, modified_time);

            let name = display_name_for_markdown(path, &rel_path, &head);
            let category = recent_category_for_path(&rel_path).to_string();

            items.push(RecentItem {
                source: recent_source_for(&rel_path, ""),
                state: "synced".to_string(),
                name,
                path: rel_path,
                category,
                modified,
                modified_ts,
            });
        }
    }

    items.sort_by(|a, b| b.modified_ts.cmp(&a.modified_ts));
    items.truncate(DASHBOARD_RECENT_LIMIT);
    Ok(items)
}

/// Get a random historical item for "Today's Review" feature
#[tauri::command]
pub async fn get_review_item() -> Result<Option<RecentItem>, String> {
    tokio::task::spawn_blocking(get_review_item_sync)
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn get_review_item_sync() -> Result<Option<RecentItem>, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Ok(None);
    }

    let min_age_days = 7; // Only show items at least 7 days old
    let now = std::time::SystemTime::now();
    let min_age = std::time::Duration::from_secs(min_age_days * 24 * 60 * 60);

    let folders = ["conversations", "notes/scratch", "notes/manual"];
    let mut candidates: Vec<RecentItem> = Vec::new();

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
            let head = read_md_head(path);
            let meta = path.metadata().ok();
            let modified_time = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .unwrap_or(std::time::UNIX_EPOCH);
            let (modified, modified_ts) = record_timestamp_for_markdown(&head, modified_time);

            let record_system = std::time::UNIX_EPOCH
                .checked_add(std::time::Duration::from_millis(modified_ts.max(0) as u64))
                .unwrap_or(std::time::UNIX_EPOCH);
            match now.duration_since(record_system) {
                Ok(age) if age < min_age => continue,
                Err(_) => continue,
                Ok(_) => {}
            }

            let rel_path = path
                .strip_prefix(&sync_dir)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();
            let name = display_name_for_markdown(path, &rel_path, &head);

            let category = if rel_path.starts_with("conversations") {
                "conversation"
            } else if rel_path.starts_with("notes/manual") {
                "manual"
            } else {
                "scratch"
            };

            candidates.push(RecentItem {
                source: recent_source_for(&rel_path, ""),
                state: "synced".to_string(),
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
    let Ok(repo) = git2::Repository::open(repo_path) else {
        return (String::new(), String::new(), String::new());
    };
    let Ok(commit) = repo.head().and_then(|head| head.peel_to_commit()) else {
        return (String::new(), String::new(), String::new());
    };

    let id = commit.id().to_string().chars().take(7).collect::<String>();
    let msg = commit.summary().unwrap_or_default().to_string();
    let time = commit.time();
    let timestamp = time.seconds();
    let offset = time.offset_minutes() * 60;
    let Some(fixed_offset) = chrono::FixedOffset::east_opt(offset) else {
        return (id, msg, String::new());
    };
    let Some(datetime) = chrono::DateTime::from_timestamp(timestamp, 0) else {
        return (id, msg, String::new());
    };
    (id, msg, datetime.with_timezone(&fixed_offset).to_rfc3339())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_display_name_prefers_frontmatter_title() {
        let content = "---\ntitle: Claude 会话总结\n---\n# fallback\nbody";
        let name = display_name_for_markdown(
            Path::new("conversations/session.md"),
            "conversations/session.md",
            content,
        );
        assert_eq!(name, "Claude 会话总结");
    }

    #[test]
    fn indexed_recent_display_name_corrects_stale_title() {
        let content = "---\ntitle: Dashboard 快记\n---\n\n正文";
        let name = display_name_for_indexed_markdown(
            Path::new("notes/scratch/2026-07-10-002.md"),
            "notes/scratch/2026-07-10-002.md",
            "2026-07-10-002",
            content,
        );
        assert_eq!(name, "Dashboard 快记");
    }

    #[test]
    fn recent_display_name_prefers_heading_over_file_stem() {
        let content = "# 产品核心构成\n\n正文内容";
        let name = display_name_for_markdown(
            Path::new("notes/manual/2026-05-27-003.md"),
            "notes/manual/2026-05-27-003.md",
            content,
        );
        assert_eq!(name, "产品核心构成");
    }

    #[test]
    fn recent_display_name_uses_body_summary_for_generated_note_names() {
        let content =
            "---\nupdated: 2026-05-27T15:00:00+08:00\n---\n\n这是一段没有标题的草稿内容。\n第二行";
        let name = display_name_for_markdown(
            Path::new("notes/scratch/2026-05-27-003.md"),
            "notes/scratch/2026-05-27-003.md",
            content,
        );
        assert_eq!(name, "这是一段没有标题的草稿内容。\n第二行");
    }

    #[test]
    fn recent_display_name_uses_body_summary_for_text_clip() {
        let content = "---\nsource: clipboard\n---\nhttps://example.com/page";
        let name = display_name_for_markdown(
            Path::new("clips/15-19-34-http.md"),
            "clips/15-19-34-http.md",
            content,
        );
        assert_eq!(name, "https://example.com/page");
    }

    #[test]
    fn recent_display_name_keeps_file_stem_for_image_clip_without_text_title() {
        let content = "---\nsource: clipboard-image\n---\n![screenshot](15-23-33-screenshot.png)";
        let name = display_name_for_markdown(
            Path::new("clips/15-23-33-screenshot.md"),
            "clips/15-23-33-screenshot.md",
            content,
        );
        assert_eq!(name, "15-23-33-screenshot");
    }
}
