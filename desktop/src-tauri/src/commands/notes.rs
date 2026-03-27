use gitmemo_core::storage::{files, git};
use serde::Serialize;
use std::path::PathBuf;

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
}

#[tauri::command]
pub fn create_note(content: String) -> Result<NoteResult, String> {
    let dir = sync_dir();
    if !dir.exists() {
        return Err("GitMemo 未初始化，请先运行 gitmemo init".into());
    }

    let rel_path = files::create_scratch(&dir, &content).map_err(|e| e.to_string())?;

    let msg = format!("note: {}", &content[..content.len().min(50)]);
    let _ = git::commit_and_push(&dir, &msg);

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

    let msg = format!("daily: {}", &content[..content.len().min(50)]);
    let _ = git::commit_and_push(&dir, &msg);

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
    let msg = format!("manual: {} {}", action, title);
    let _ = git::commit_and_push(&dir, &msg);

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
        let preview = content
            .lines()
            .filter(|l| !l.starts_with("---") && !l.starts_with("date:") && !l.starts_with("title:") && !l.is_empty())
            .take(3)
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(120)
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
        let modified = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .map(|t| {
                let dt: chrono::DateTime<chrono::Local> = t.into();
                dt.format("%Y-%m-%d %H:%M").to_string()
            })
            .unwrap_or_default();
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
        });
    }

    // Sort by modified desc
    entries.sort_by(|a, b| b.modified.cmp(&a.modified));

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

    let msg = format!("edit: {}", file_path);
    let _ = git::commit_and_push(&dir, &msg);

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

    let msg = format!("delete: {}", file_path);
    let _ = git::commit_and_push(&dir, &msg);

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
