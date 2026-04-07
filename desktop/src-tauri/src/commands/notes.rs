use gitmemo_core::storage::{database, files, git};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

fn local_timestamp(now: &chrono::DateTime<chrono::Local>) -> String {
    now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

pub fn set_app_handle(handle: AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

fn sync_dir() -> PathBuf {
    files::sync_dir()
}

fn refresh_index(dir: &Path) {
    let db_path = dir.join(".metadata").join("index.db");
    if let Ok(conn) = database::open_or_create(&db_path) {
        let _ = database::build_index(&conn, dir);
    }
}

#[derive(Debug, Serialize)]
pub struct NoteResult {
    pub success: bool,
    pub path: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct GitSyncEvent {
    pub ok: bool,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_image: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SavedAttachment {
    pub path: String,
    pub markdown: String,
    pub message: String,
}

fn frontmatter_value<'a>(content: &'a str, key: &str) -> Option<&'a str> {
    if !content.starts_with("---") {
        return None;
    }
    let rest = &content[3..];
    let end = rest.find("---")?;
    let fm = &rest[..end];
    let prefix = format!("{}:", key);
    for line in fm.lines() {
        let line = line.trim();
        if let Some(v) = line.strip_prefix(&prefix) {
            return Some(v.trim());
        }
    }
    None
}

fn extract_markdown_image_path(body: &str) -> Option<String> {
    let idx = body.find("![")?;
    let after = &body[idx + 2..];
    let rbrack = after.find(']')?;
    if !after[rbrack + 1..].starts_with('(') {
        return None;
    }
    let path_start = rbrack + 2;
    let path_rest = &after[path_start..];
    let rparen = path_rest.find(')')?;
    Some(path_rest[..rparen].to_string())
}

fn preview_from_body(body: &str) -> String {
    body.lines()
        .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
        .take(3)
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(200)
        .collect::<String>()
}

/// Spawn git commit+push in background so the UI isn't blocked.
/// Emits "git-sync-start" and "git-sync-end" events for the frontend.
fn bg_commit_and_push(msg: String) {
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit("git-sync-start", ());
    }
    std::thread::spawn(move || {
        let dir = sync_dir();
        let sync_event = match git::commit_and_push(&dir, &msg) {
            Ok(result) if result.push_error.is_some() => GitSyncEvent {
                ok: false,
                message: result.push_error.unwrap_or_else(|| "push failed".into()),
            },
            Ok(result) if !git::has_remote(&dir) => GitSyncEvent {
                ok: true,
                message: if result.committed { "Saved locally".into() } else { "No changes".into() },
            },
            Ok(result) => GitSyncEvent {
                ok: true,
                message: if result.committed { "Synced".into() } else { "No changes".into() },
            },
            Err(e) => GitSyncEvent {
                ok: false,
                message: e.to_string(),
            },
        };
        if let Some(handle) = APP_HANDLE.get() {
            let _ = handle.emit("git-sync-end", &sync_event);
        }
    });
}

fn run_full_sync(dir: &std::path::Path) -> Result<String, String> {
    // Pull latest from remote first (even if no local changes)
    let pulled = git::pull(dir).unwrap_or(false);

    // Copy plans from editor workspaces to plans/
    sync_external_plans_to_gitmemo(dir);

    // Sync Claude config (memory, skills, CLAUDE.md) to claude-config/
    sync_claude_config(dir);

    // Sync Cursor config (rules, skills, mcp) to cursor-config/
    sync_cursor_config(dir);

    let result = git::commit_and_push(dir, "auto: sync from desktop").map_err(|e| e.to_string())?;
    if result.committed && result.pushed {
        Ok("已同步到 Git".into())
    } else if result.committed {
        if let Some(err) = result.push_error {
            Err(format!("推送失败: {}", err))
        } else {
            Ok("已提交".into())
        }
    } else if pulled {
        Ok("已拉取最新".into())
    } else {
        Ok("无新变更".into())
    }
}

#[tauri::command]
pub fn create_note(content: String) -> Result<NoteResult, String> {
    let dir = sync_dir();
    if !dir.exists() {
        return Err("GitMemo 未初始化，请先运行 gitmemo init".into());
    }

    let rel_path = files::create_scratch(&dir, &content).map_err(|e| e.to_string())?;
    refresh_index(&dir);
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
    refresh_index(&dir);
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
    refresh_index(&dir);

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

/// Absolute path to a file under the GitMemo sync directory (for copy / display).
#[tauri::command]
pub fn resolve_sync_path(rel_path: String) -> Result<String, String> {
    let base = sync_dir();
    let base = base.canonicalize().map_err(|e| e.to_string())?;
    let rel = rel_path.trim().trim_start_matches('/');
    if rel.contains("..") {
        return Err("Invalid path".into());
    }
    let full = base.join(rel);
    let full = full.canonicalize().map_err(|e| e.to_string())?;
    if !full.starts_with(&base) {
        return Err("Invalid path".into());
    }
    Ok(full.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_files(folder: String) -> Result<Vec<FileEntry>, String> {
    let dir = sync_dir();
    if folder == "plans" {
        sync_external_plans_to_gitmemo(&dir);
    }
    let target = dir.join(&folder);

    if !target.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    for entry in walkdir::WalkDir::new(&target)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let ext = e.path().extension().and_then(|x| x.to_str()).unwrap_or("");
            ext == "md" || ((ext == "mdc" || ext == "json") && folder.starts_with("cursor-config"))
        })
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

        let is_clipboard_image = frontmatter_value(&content, "source") == Some("clipboard-image");
        let (preview, preview_image) = if is_clipboard_image {
            if let Some(img_file) = extract_markdown_image_path(body) {
                let parent = Path::new(&rel_path)
                    .parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .filter(|s| !s.is_empty());
                let img_rel = match parent {
                    Some(p) => format!("{}/{}", p, img_file),
                    None => img_file,
                };
                (String::new(), Some(img_rel.replace('\\', "/")))
            } else {
                (preview_from_body(body), None)
            }
        } else {
            (preview_from_body(body), None)
        };

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
                local_timestamp(&dt)
            })
            .unwrap_or_default();
        let modified_ts = modified_time
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
            .unwrap_or(0);
        let size = meta.map(|m| m.len()).unwrap_or(0);

        let source_type = if rel_path.starts_with("conversations") {
            "conversation"
        } else if rel_path.starts_with("clips") {
            "clip"
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
            preview_image,
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
    refresh_index(&dir);
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
    refresh_index(&dir);
    bg_commit_and_push(format!("delete: {}", file_path));

    Ok(NoteResult {
        success: true,
        path: file_path,
        message: "Note deleted".into(),
    })
}

#[tauri::command]
pub fn delete_clip(file_path: String) -> Result<NoteResult, String> {
    let dir = sync_dir();
    let norm = file_path
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string();
    if !norm.starts_with("clips/") || norm.contains("..") {
        return Err("Invalid clip path".into());
    }
    if !norm.ends_with(".md") {
        return Err("Invalid clip path".into());
    }

    let full_path = dir.join(&norm);
    if !full_path.is_file() {
        return Err(format!("File not found: {}", file_path));
    }

    if let Ok(content) = std::fs::read_to_string(&full_path) {
        if frontmatter_value(&content, "source") == Some("clipboard-image") {
            let body = if content.starts_with("---") {
                if let Some(end) = content[3..].find("---") {
                    content[3 + end + 3..].trim_start()
                } else {
                    content.as_str()
                }
            } else {
                content.as_str()
            };
            if let Some(img_name) = extract_markdown_image_path(body) {
                if !img_name.contains("..") && !img_name.contains('/') {
                    let png_path = full_path.parent().unwrap_or(&dir).join(&img_name);
                    if png_path.is_file() {
                        let _ = std::fs::remove_file(&png_path);
                    }
                }
            }
        }
    }

    std::fs::remove_file(&full_path).map_err(|e| e.to_string())?;
    refresh_index(&dir);
    bg_commit_and_push(format!("delete clip: {}", norm));

    Ok(NoteResult {
        success: true,
        path: norm,
        message: "Clip deleted".into(),
    })
}

#[tauri::command]
pub fn delete_plan(file_path: String, delete_source: Option<bool>) -> Result<NoteResult, String> {
    let dir = sync_dir();
    let norm = file_path
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string();
    let delete_source = delete_source.unwrap_or(false);
    if !norm.starts_with("plans/") || norm.contains("..") || !norm.ends_with(".md") {
        return Err("Invalid plan path".into());
    }

    let full_path = dir.join(&norm);
    if !full_path.is_file() {
        return Err(format!("File not found: {}", file_path));
    }
    std::fs::remove_file(&full_path).map_err(|e| e.to_string())?;

    if delete_source {
        if let Some(name) = Path::new(&norm).file_name().map(|s| s.to_string_lossy().to_string()) {
            if let Some(home) = std::env::var_os("HOME") {
                for source_dir in external_plan_dirs(&PathBuf::from(home)) {
                    let source_plan = source_dir.join(&name);
                    if source_plan.is_file() {
                        let _ = std::fs::remove_file(source_plan);
                    }
                }
            }
        }
    }

    bg_commit_and_push(format!("delete plan: {}", norm));
    refresh_index(&dir);

    Ok(NoteResult {
        success: true,
        path: norm,
        message: "Plan deleted".into(),
    })
}

fn sanitize_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    s.trim_matches('_').to_string()
}

fn ext_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "application/pdf" => "pdf",
        "text/markdown" => "md",
        "text/plain" => "txt",
        _ => "bin",
    }
}

#[tauri::command]
pub fn save_pasted_attachment(
    base64_data: String,
    mime_type: String,
    file_name: Option<String>,
) -> Result<SavedAttachment, String> {
    let sync_dir = sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo 未初始化".into());
    }

    let bytes = {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(base64_data.as_bytes())
            .map_err(|e| e.to_string())?
    };
    if bytes.is_empty() {
        return Err("Attachment is empty".into());
    }

    let now = chrono::Local::now();
    let ext = file_name
        .as_deref()
        .and_then(|n| Path::new(n).extension().map(|e| e.to_string_lossy().to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| ext_from_mime(&mime_type).to_string());
    let stem = file_name
        .as_deref()
        .and_then(|n| Path::new(n).file_stem().map(|s| s.to_string_lossy().to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            if mime_type.starts_with("image/") {
                "pasted-image".to_string()
            } else {
                "pasted-file".to_string()
            }
        });
    let stem = sanitize_name(&stem);
    let file_name = format!("{}-{}.{}", now.format("%H-%M-%S"), stem, ext);

    let (folder, markdown) = if mime_type.starts_with("image/") {
        let date_dir = now.format("%Y-%m-%d").to_string();
        let rel = format!("clips/{}/{}", date_dir, file_name);
        let md = format!("![{}](/{} )", stem, rel).replace(" )", ")");
        (rel, md)
    } else {
        let base_dir = if mime_type == "application/pdf" {
            "imports/docs"
        } else {
            "imports/other"
        };
        let rel = format!("{}/{}-{}", base_dir, now.format("%Y%m%d"), file_name);
        let md = format!("[{}](/{} )", stem, rel).replace(" )", ")");
        (rel, md)
    };

    let full = sync_dir.join(&folder);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full, bytes).map_err(|e| e.to_string())?;

    bg_commit_and_push(format!("attach: {}", folder));

    Ok(SavedAttachment {
        path: folder,
        markdown,
        message: "Attachment saved".into(),
    })
}

#[tauri::command]
pub fn sync_to_git() -> Result<String, String> {
    let dir = sync_dir();
    if !dir.exists() {
        return Err("GitMemo 未初始化".into());
    }
    run_full_sync(&dir)
}

fn external_plan_dirs(home: &Path) -> [PathBuf; 2] {
    [
        home.join(".claude").join("plans"),
        home.join(".cursor").join("plans"),
    ]
}

/// Copy editor-generated plan files into `<gitmemo>/plans/`.
pub fn sync_external_plans_to_gitmemo(dir: &std::path::Path) {
    let home = match std::env::var("HOME").ok() {
        Some(h) => std::path::PathBuf::from(h),
        None => return,
    };
    let plans_dst = dir.join("plans");
    let _ = std::fs::create_dir_all(&plans_dst);

    for plans_src in external_plan_dirs(&home) {
        if !plans_src.is_dir() {
            continue;
        }
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

/// Sync Cursor config files to <gitmemo>/cursor-config/
/// Syncs: rules/*.mdc, skills/, mcp.json
fn sync_cursor_config(dir: &std::path::Path) {
    let home = match std::env::var("HOME").ok() {
        Some(h) => std::path::PathBuf::from(h),
        None => return,
    };
    let cursor_dir = home.join(".cursor");
    if !cursor_dir.is_dir() {
        return;
    }

    let dst_root = dir.join("cursor-config");
    let _ = std::fs::create_dir_all(&dst_root);

    // 1. Rules (*.mdc files)
    let rules_src = cursor_dir.join("rules");
    if rules_src.is_dir() {
        let rules_dst = dst_root.join("rules");
        let _ = std::fs::create_dir_all(&rules_dst);
        if let Ok(entries) = std::fs::read_dir(&rules_src) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "mdc").unwrap_or(false) {
                    let dest = rules_dst.join(path.file_name().unwrap());
                    let _ = std::fs::copy(&path, &dest);
                }
            }
        }
    }

    // 2. Skills/
    copy_dir_recursive(&cursor_dir.join("skills"), &dst_root.join("skills"));

    // 3. mcp.json
    let mcp_json = cursor_dir.join("mcp.json");
    if mcp_json.exists() {
        let _ = std::fs::copy(&mcp_json, dst_root.join("mcp.json"));
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
