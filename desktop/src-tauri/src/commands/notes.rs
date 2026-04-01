use gitmemo_core::storage::{files, git};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub fn set_app_handle(handle: AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

fn sync_dir() -> PathBuf {
    files::sync_dir()
}

#[derive(Debug, Serialize)]
pub struct NoteResult {
    pub success: bool,
    pub path: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub source_type: String,
    pub modified: String,
    pub size: u64,
    pub preview: String,
    #[serde(rename = "modifiedTs")]
    pub modified_ts: i64,
}

/// Spawn git commit+push in background so the UI isn't blocked.
/// Emits "git-sync-start" and "git-sync-end" events for the frontend.
fn bg_commit_and_push(msg: String) {
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit("git-sync-start", ());
    }
    std::thread::spawn(move || {
        let dir = sync_dir();
        let _ = git::commit_and_push(&dir, &msg);
        if let Some(handle) = APP_HANDLE.get() {
            let _ = handle.emit("git-sync-end", ());
        }
    });
}

#[tauri::command]
pub fn create_note(content: String) -> Result<NoteResult, String> {
    let dir = sync_dir();
    if !dir.exists() {
        return Err("GitMemo 未初始化，请先运行 gitmemo init".into());
    }

    let rel_path = files::create_scratch(&dir, &content).map_err(|e| e.to_string())?;
    bg_commit_and_push(format!("note: {}", content.chars().take(50).collect::<String>()));

    Ok(NoteResult {
        success: true,
        path: rel_path.clone(),
        message: format!("便签已创建: {}", rel_path),
    })
}

#[tauri::command]
pub fn append_daily(content: String) -> Result<NoteResult, String> {
    let dir = sync_dir();
    if !dir.exists() {
        return Err("GitMemo 未初始化".into());
    }

    let rel_path = files::append_daily(&dir, &content).map_err(|e| e.to_string())?;
    bg_commit_and_push(format!("daily: {}", content.chars().take(50).collect::<String>()));

    Ok(NoteResult {
        success: true,
        path: rel_path.clone(),
        message: format!("已追加到今日笔记: {}", rel_path),
    })
}

#[tauri::command]
pub fn create_manual(title: String, content: String, append: bool) -> Result<NoteResult, String> {
    let dir = sync_dir();
    if !dir.exists() {
        return Err("GitMemo 未初始化".into());
    }

    let rel_path =
        files::write_manual(&dir, &title, &content, append).map_err(|e| e.to_string())?;

    let action = if append { "update" } else { "create" };
    bg_commit_and_push(format!("manual: {} {}", action, title));

    Ok(NoteResult {
        success: true,
        path: rel_path.clone(),
        message: format!("手册已保存: {}", rel_path),
    })
}

#[tauri::command]
pub fn read_file(file_path: String) -> Result<String, String> {
    let dir = sync_dir();
    let full_path = dir.join(&file_path);
    std::fs::read_to_string(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_file_base64(file_path: String) -> Result<String, String> {
    use std::io::Read;
    let dir = sync_dir();
    let full_path = dir.join(&file_path);
    let mut buf = Vec::new();
    std::fs::File::open(&full_path)
        .and_then(|mut f| f.read_to_end(&mut buf))
        .map_err(|e| e.to_string())?;

    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

#[tauri::command]
pub fn list_files(folder: String) -> Result<Vec<FileEntry>, String> {
    let dir = sync_dir();
    let target = dir.join(&folder);

    if !target.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    for entry in walkdir::WalkDir::new(&target)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
    {
        let path = entry.path();
        let rel_path = path
            .strip_prefix(&dir)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let content = std::fs::read_to_string(path).unwrap_or_default();
        // Strip frontmatter block then take first meaningful lines as preview
        let body = if content.starts_with("---") {
            if let Some(end) = content[3..].find("---") {
                content[3 + end + 3..].trim_start()
            } else {
                content.as_str()
            }
        } else {
            content.as_str()
        };
        let preview = body
            .lines()
            .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
            .take(3)
            .collect::<Vec<_>>()
            .join("\n")
            .chars()
            .take(200)
            .collect::<String>();

        let name = content
            .lines()
            .find(|l| l.starts_with("# "))
            .map(|l| l.trim_start_matches("# ").to_string())
            .unwrap_or_else(|| {
                path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string()
            });

        let meta = path.metadata().ok();
        let modified_time = meta
            .as_ref()
            .and_then(|m| m.modified().ok());
        let modified = modified_time
            .map(|t| {
                let dt: chrono::DateTime<chrono::Local> = t.into();
                dt.format("%Y-%m-%d %H:%M:%S").to_string()
            })
            .unwrap_or_default();
        let modified_ts = modified_time
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
            .unwrap_or(0);
        let size = meta.map(|m| m.len()).unwrap_or(0);

        let source_type = if rel_path.starts_with("conversations") {
            "conversation"
        } else {
            "note"
        };

        entries.push(FileEntry {
            name,
            path: rel_path,
            source_type: source_type.to_string(),
            modified,
            size,
            preview,
            modified_ts,
        });
    }

    // Sort by timestamp desc (millisecond precision)
    entries.sort_by(|a, b| b.modified_ts.cmp(&a.modified_ts));

    Ok(entries)
}

#[tauri::command]
pub fn update_note(file_path: String, content: String) -> Result<NoteResult, String> {
    let dir = sync_dir();
    let full_path = dir.join(&file_path);
    if !full_path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    std::fs::write(&full_path, &content).map_err(|e| e.to_string())?;
    bg_commit_and_push(format!("edit: {}", file_path));

    Ok(NoteResult {
        success: true,
        path: file_path,
        message: "Note saved".into(),
    })
}

#[tauri::command]
pub fn delete_note(file_path: String) -> Result<NoteResult, String> {
    let dir = sync_dir();
    let full_path = dir.join(&file_path);
    if !full_path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    std::fs::remove_file(&full_path).map_err(|e| e.to_string())?;
    bg_commit_and_push(format!("delete: {}", file_path));

    Ok(NoteResult {
        success: true,
        path: file_path,
        message: "Note deleted".into(),
    })
}

#[tauri::command]
pub fn sync_to_git() -> Result<String, String> {
    let dir = sync_dir();
    if !dir.exists() {
        return Err("GitMemo 未初始化".into());
    }

    // Copy plans from ~/.claude/plans/ to plans/
    copy_plans_to_gitmemo(&dir);

    // Sync Claude config (memory, skills, CLAUDE.md) to claude-config/
    sync_claude_config(&dir);

    let result = git::commit_and_push(&dir, "auto: sync from desktop").map_err(|e| e.to_string())?;
    if result.committed && result.pushed {
        Ok("已同步到 Git".into())
    } else if result.committed {
        Ok(format!(
            "已提交，推送失败: {}",
            result.push_error.unwrap_or_default()
        ))
    } else {
        Ok("无新变更".into())
    }
}

/// Copy .md files from ~/.claude/plans/ to <gitmemo>/plans/
fn copy_plans_to_gitmemo(dir: &std::path::Path) {
    let home = match std::env::var("HOME").ok() {
        Some(h) => std::path::PathBuf::from(h),
        None => return,
    };
    let plans_src = home.join(".claude").join("plans");
    if !plans_src.is_dir() {
        return;
    }
    let plans_dst = dir.join("plans");
    let _ = std::fs::create_dir_all(&plans_dst);

    if let Ok(entries) = std::fs::read_dir(&plans_src) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "md").unwrap_or(false) {
                let dest = plans_dst.join(path.file_name().unwrap());
                let _ = std::fs::copy(&path, &dest);
            }
        }
    }
}

/// Sync valuable Claude config files to <gitmemo>/claude-config/
/// Syncs: memory/ (global), projects/*/memory/ (per-project), skills/, CLAUDE.md
fn sync_claude_config(dir: &std::path::Path) {
    let home = match std::env::var("HOME").ok() {
        Some(h) => std::path::PathBuf::from(h),
        None => return,
    };
    let claude_dir = home.join(".claude");
    if !claude_dir.is_dir() {
        return;
    }

    let dst_root = dir.join("claude-config");
    let _ = std::fs::create_dir_all(&dst_root);

    // 1. Global CLAUDE.md
    let claude_md = claude_dir.join("CLAUDE.md");
    if claude_md.exists() {
        let _ = std::fs::copy(&claude_md, dst_root.join("CLAUDE.md"));
    }

    // 2. Global memory/
    copy_dir_md(&claude_dir.join("memory"), &dst_root.join("memory"));

    // 3. Skills/
    copy_dir_recursive(&claude_dir.join("skills"), &dst_root.join("skills"));

    // 4. Per-project memory/ (projects/*/memory/)
    let projects_dir = claude_dir.join("projects");
    if projects_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&projects_dir) {
            for entry in entries.flatten() {
                let proj_path = entry.path();
                let proj_memory = proj_path.join("memory");
                if proj_memory.is_dir() {
                    let proj_name = proj_path.file_name().unwrap().to_string_lossy().to_string();
                    let dst = dst_root.join("projects").join(&proj_name).join("memory");
                    copy_dir_md(&proj_memory, &dst);
                }
            }
        }
    }
}

/// Copy all .md files from src to dst (non-recursive)
fn copy_dir_md(src: &std::path::Path, dst: &std::path::Path) {
    if !src.is_dir() {
        return;
    }
    let _ = std::fs::create_dir_all(dst);
    if let Ok(entries) = std::fs::read_dir(src) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "md").unwrap_or(false) {
                let dest = dst.join(path.file_name().unwrap());
                let _ = std::fs::copy(&path, &dest);
            }
        }
    }
}

/// Copy directory recursively (for skills which may have subdirectories)
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) {
    if !src.is_dir() {
        return;
    }
    let _ = std::fs::create_dir_all(dst);
    if let Ok(entries) = std::fs::read_dir(src) {
        for entry in entries.flatten() {
            let path = entry.path();
            let dest = dst.join(path.file_name().unwrap());
            if path.is_dir() {
                copy_dir_recursive(&path, &dest);
            } else {
                let _ = std::fs::copy(&path, &dest);
            }
        }
    }
}
