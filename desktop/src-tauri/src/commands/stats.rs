use gitmemo_core::storage::{database, files, git};
use gitmemo_core::utils::datetime::record_timestamp_for_markdown;
use serde::Serialize;
use std::io::Read;
use std::path::Path;

use super::markdown::{frontmatter_value, markdown_body};

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

fn preview_from_body(body: &str) -> String {
    body.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with("!["))
        .take(3)
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(200)
        .collect::<String>()
}

fn first_heading(content: &str) -> Option<String> {
    content
        .lines()
        .find_map(|l| l.strip_prefix("# ").map(str::trim))
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
}

fn file_stem(path: &Path) -> String {
    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

fn is_generated_date_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.len() < 10 {
        return false;
    }
    bytes[0..4].iter().all(u8::is_ascii_digit)
        && bytes[4] == b'-'
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[7] == b'-'
        && bytes[8..10].iter().all(u8::is_ascii_digit)
}

fn display_name_for_markdown(path: &Path, rel_path: &str, content: &str) -> String {
    if let Some(title) = frontmatter_value(content, "title") {
        return title.to_string();
    }
    if let Some(heading) = first_heading(content) {
        return heading;
    }

    let fallback = file_stem(path);
    let body = markdown_body(content);
    let preview = preview_from_body(body);
    let is_clip = rel_path.starts_with("clips/");
    let is_clipboard_image = frontmatter_value(content, "source") == Some("clipboard-image");
    if !preview.is_empty()
        && ((is_clip && !is_clipboard_image) || is_generated_date_name(&fallback))
    {
        return preview;
    }

    fallback
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

    get_recent_activity_from_index(&sync_dir)
        .or_else(|_| get_recent_activity_from_filesystem(&sync_dir))
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

fn recent_item_from_index(row: database::RecentDocumentItem) -> RecentItem {
    let category = recent_category_for_path(&row.file_path).to_string();
    RecentItem {
        name: row.title,
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
        .map(|items| items.into_iter().map(recent_item_from_index).collect())
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
    fn recent_display_name_uses_preview_for_generated_note_names() {
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
    fn recent_display_name_uses_preview_for_text_clip() {
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
