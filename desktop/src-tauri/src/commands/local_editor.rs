use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExternalFileEntry {
    pub file_path: String,
    pub file_name: String,
    pub parent_dir: String,
    pub exists: bool,
    pub last_opened_at: String,
    pub last_modified_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExternalFileOpenResult {
    pub entry: ExternalFileEntry,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct ExternalFileWriteResult {
    pub entry: ExternalFileEntry,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ExternalFileImportResult {
    pub rel_path: String,
    pub message: String,
}

const MAX_VIEW_BYTES: u64 = 8 * 1024 * 1024;
const MAX_INDEX_ENTRIES: usize = 200;

type EditorRootKind = &'static str;

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

fn anonymous_root_dir() -> Result<PathBuf, String> {
    let home = home_dir().ok_or_else(|| "HOME/USERPROFILE not set".to_string())?;
    Ok(home.join(".gitmemo").join("editor-anonymous"))
}

fn external_files_index_path() -> Result<PathBuf, String> {
    Ok(anonymous_root_dir()?.join("external-files-index.json"))
}

fn ensure_dir(path: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(path).map_err(|e| format!("{}: {}", path.display(), e))?;
    path.canonicalize()
        .map_err(|e| format!("{}: {}", path.display(), e))
}

fn editor_root_dir(root: &str) -> Result<PathBuf, String> {
    let root_name = root.trim();
    match root_name {
        "claude" | "cursor" | "codex" => {
            let home = home_dir().ok_or_else(|| "HOME/USERPROFILE not set".to_string())?;
            let p = match root_name {
                "claude" => home.join(".claude"),
                "cursor" => home.join(".cursor"),
                "codex" => home.join(".codex"),
                _ => unreachable!(),
            };
            if !p.is_dir() {
                return Err(format!("Directory does not exist: {}", p.display()));
            }
            p.canonicalize()
                .map_err(|e| format!("{}: {}", p.display(), e))
        }
        "anonymous" => ensure_dir(&anonymous_root_dir()?),
        _ => Err("root must be \"claude\", \"cursor\", \"codex\", or \"anonymous\"".into()),
    }
}

fn normalize_rel(rel: &str) -> Result<String, String> {
    let trimmed = rel.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    if trimmed.starts_with('/') {
        return Err("Invalid path".into());
    }
    if Path::new(&trimmed).is_absolute() {
        return Err("Invalid path".into());
    }

    let mut parts = Vec::new();
    for component in Path::new(&trimmed).components() {
        match component {
            std::path::Component::Normal(seg) => {
                let seg = seg.to_string_lossy();
                if seg.is_empty() || seg == "." {
                    return Err("Invalid path".into());
                }
                parts.push(seg.into_owned());
            }
            std::path::Component::CurDir => return Err("Invalid path".into()),
            std::path::Component::ParentDir
            | std::path::Component::RootDir
            | std::path::Component::Prefix(_) => return Err("Invalid path".into()),
        }
    }

    Ok(parts.join("/"))
}

fn detect_editor_root(abs_path: &Path) -> Result<Option<(EditorRootKind, PathBuf)>, String> {
    for root_name in ["claude", "cursor", "codex", "anonymous"] {
        let root = match editor_root_dir(root_name) {
            Ok(root) => root,
            Err(_) => continue,
        };
        if abs_path.starts_with(&root) {
            return Ok(Some((root_name, root)));
        }
    }
    Ok(None)
}

fn sync_page_for_rel(rel_path: &str) -> Option<&'static str> {
    if rel_path.starts_with("notes/") {
        Some("notes")
    } else if rel_path.starts_with("conversations/") {
        Some("conversations")
    } else if rel_path.starts_with("clips/") {
        Some("clipboard")
    } else if rel_path.starts_with("plans/") {
        Some("plans")
    } else if rel_path.starts_with("imports/") {
        Some("imports")
    } else {
        None
    }
}

fn is_supported_external_file(abs_path: &Path) -> bool {
    abs_path
        .extension()
        .and_then(OsStr::to_str)
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "mdx" | "txt"))
        .unwrap_or(false)
}

fn sanitize_file_stem(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches('_').trim_matches('.');
    if trimmed.is_empty() {
        "file".to_string()
    } else {
        trimmed.to_string()
    }
}

fn read_utf8_file(path: &Path) -> Result<String, String> {
    let len = path.metadata().map_err(|e| e.to_string())?.len();
    if len > MAX_VIEW_BYTES {
        return Err(format!(
            "File too large to preview ({} MB; max {} MB). Open in an external editor.",
            len / 1024 / 1024,
            MAX_VIEW_BYTES / 1024 / 1024
        ));
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn modified_at(path: &Path) -> Option<String> {
    let meta = path.metadata().ok()?;
    let modified = meta.modified().ok()?;
    let dt: chrono::DateTime<chrono::Utc> = modified.into();
    Some(dt.to_rfc3339())
}

fn entry_from_abs_path(abs_path: &Path, last_opened_at: String) -> ExternalFileEntry {
    ExternalFileEntry {
        file_path: abs_path.to_string_lossy().into_owned(),
        file_name: abs_path
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("file")
            .to_string(),
        parent_dir: abs_path
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
        exists: abs_path.is_file(),
        last_opened_at,
        last_modified_at: modified_at(abs_path),
    }
}

fn read_external_files_index() -> Result<Vec<ExternalFileEntry>, String> {
    let path = external_files_index_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid external files index path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("{}: {}", parent.display(), e))?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("{}: {}", path.display(), e))?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str::<Vec<ExternalFileEntry>>(&raw)
        .map_err(|e| format!("{}: {}", path.display(), e))
}

fn write_external_files_index(entries: &[ExternalFileEntry]) -> Result<(), String> {
    let path = external_files_index_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid external files index path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("{}: {}", parent.display(), e))?;
    let json = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("{}: {}", path.display(), e))
}

fn save_external_file_entry(abs_path: &Path) -> Result<ExternalFileEntry, String> {
    let mut entries = read_external_files_index()?;
    let existing = entries
        .iter()
        .find(|item| item.file_path == abs_path.to_string_lossy());
    let last_opened_at = existing
        .map(|item| item.last_opened_at.clone())
        .unwrap_or_else(now_rfc3339);
    let entry = entry_from_abs_path(abs_path, last_opened_at);
    entries.retain(|item| item.file_path != entry.file_path);
    entries.insert(0, entry.clone());
    if entries.len() > MAX_INDEX_ENTRIES {
        entries.truncate(MAX_INDEX_ENTRIES);
    }
    write_external_files_index(&entries)?;
    Ok(entry)
}

fn upsert_external_file_entry(abs_path: &Path) -> Result<ExternalFileEntry, String> {
    let mut entries = read_external_files_index()?;
    let now = now_rfc3339();
    let entry = entry_from_abs_path(abs_path, now);
    entries.retain(|item| item.file_path != entry.file_path);
    entries.insert(0, entry.clone());
    if entries.len() > MAX_INDEX_ENTRIES {
        entries.truncate(MAX_INDEX_ENTRIES);
    }
    write_external_files_index(&entries)?;
    Ok(entry)
}

fn refresh_external_files_index() -> Result<Vec<ExternalFileEntry>, String> {
    let mut entries = read_external_files_index()?;
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut deduped: Vec<ExternalFileEntry> = Vec::with_capacity(entries.len());
    for entry in entries.drain(..) {
        let canonical = PathBuf::from(&entry.file_path)
            .canonicalize()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| entry.file_path.clone());
        if !seen.insert(canonical.clone()) {
            continue;
        }
        let mut entry = entry;
        entry.file_path = canonical;
        deduped.push(entry);
    }
    let mut entries = deduped;
    for entry in &mut entries {
        let path = PathBuf::from(&entry.file_path);
        entry.exists = path.is_file();
        entry.last_modified_at = modified_at(&path);
        if entry.file_name.is_empty() {
            entry.file_name = path
                .file_name()
                .and_then(OsStr::to_str)
                .unwrap_or("file")
                .to_string();
        }
        if entry.parent_dir.is_empty() {
            entry.parent_dir = path
                .parent()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default();
        }
    }
    entries.sort_by(|a, b| {
        let a_key = a
            .last_modified_at
            .as_deref()
            .unwrap_or(a.last_opened_at.as_str());
        let b_key = b
            .last_modified_at
            .as_deref()
            .unwrap_or(b.last_opened_at.as_str());
        b_key
            .cmp(a_key)
            .then_with(|| a.file_name.cmp(&b.file_name))
            .then_with(|| a.file_path.cmp(&b.file_path))
    });
    write_external_files_index(&entries)?;
    Ok(entries)
}

/// Resolve `rel` under `root` and ensure the result stays inside `root` (no `..` escape).
fn resolve_under_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = normalize_rel(rel)?;
    let joined = if rel.is_empty() {
        root.to_path_buf()
    } else {
        root.join(rel)
    };
    let joined = joined.canonicalize().map_err(|e| format!("{}", e))?;
    if !joined.starts_with(root) {
        return Err("Path escapes editor root".into());
    }
    Ok(joined)
}

fn resolve_target_under_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = normalize_rel(rel)?;
    if rel.is_empty() {
        return Err("Invalid path".into());
    }

    let rel_path = Path::new(&rel);
    let file_name = rel_path
        .file_name()
        .ok_or_else(|| "Invalid path".to_string())?;
    let parent = rel_path.parent().unwrap_or_else(|| Path::new(""));
    let parent_abs = if parent.as_os_str().is_empty() {
        root.to_path_buf()
    } else {
        let dir = root.join(parent);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        dir.canonicalize().map_err(|e| e.to_string())?
    };
    if !parent_abs.starts_with(root) {
        return Err("Path escapes editor root".into());
    }
    Ok(parent_abs.join(file_name))
}

fn next_untitled_path(root: &Path) -> Result<PathBuf, String> {
    for index in 0..10_000 {
        let name = if index == 0 {
            "untitled.md".to_string()
        } else {
            format!("untitled-{}.md", index + 1)
        };
        let path = root.join(&name);
        if !path.exists() {
            return Ok(path);
        }
    }
    Err("Unable to allocate anonymous file name".into())
}

#[derive(Debug, Serialize)]
pub struct EditorRootsStatus {
    pub claude_path: String,
    pub claude_exists: bool,
    pub cursor_path: String,
    pub cursor_exists: bool,
    pub codex_path: String,
    pub codex_exists: bool,
    pub anonymous_path: String,
    pub anonymous_exists: bool,
}

#[derive(Debug, Serialize)]
pub struct EditorDirEntry {
    pub name: String,
    pub rel_path: String,
    pub is_dir: bool,
}

#[derive(Debug, Serialize)]
pub struct EditorWriteResult {
    pub success: bool,
    pub rel_path: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ExternalOpenTarget {
    pub kind: String,
    pub page: Option<String>,
    pub root: Option<String>,
    pub rel_path: Option<String>,
    pub file_path: String,
}

#[tauri::command]
pub fn get_editor_data_roots() -> Result<EditorRootsStatus, String> {
    let Some(home) = home_dir() else {
        let anonymous = ensure_dir(&anonymous_root_dir()?)?;
        return Ok(EditorRootsStatus {
            claude_path: String::new(),
            claude_exists: false,
            cursor_path: String::new(),
            cursor_exists: false,
            codex_path: String::new(),
            codex_exists: false,
            anonymous_path: anonymous.to_string_lossy().into(),
            anonymous_exists: true,
        });
    };
    let claude = home.join(".claude");
    let cursor = home.join(".cursor");
    let codex = home.join(".codex");
    let claude_exists = claude.is_dir();
    let cursor_exists = cursor.is_dir();
    let codex_exists = codex.is_dir();
    let anonymous = ensure_dir(&anonymous_root_dir()?)?;
    Ok(EditorRootsStatus {
        claude_path: claude.to_string_lossy().into(),
        claude_exists,
        cursor_path: cursor.to_string_lossy().into(),
        cursor_exists,
        codex_path: codex.to_string_lossy().into(),
        codex_exists,
        anonymous_path: anonymous.to_string_lossy().into(),
        anonymous_exists: true,
    })
}

#[tauri::command]
pub fn classify_external_open_target(file_path: String) -> Result<ExternalOpenTarget, String> {
    let abs_path = PathBuf::from(file_path.trim());
    let abs_path = abs_path.canonicalize().map_err(|e| e.to_string())?;
    if !abs_path.is_file() {
        return Err("Not a file".into());
    }

    let sync_dir = gitmemo_core::storage::files::sync_dir();
    if sync_dir.exists() {
        let sync_dir = sync_dir.canonicalize().map_err(|e| e.to_string())?;
        if abs_path.starts_with(&sync_dir) {
            let rel_path = abs_path
                .strip_prefix(&sync_dir)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if let Some(page) = sync_page_for_rel(&rel_path) {
                return Ok(ExternalOpenTarget {
                    kind: "sync".into(),
                    page: Some(page.into()),
                    root: None,
                    rel_path: Some(rel_path),
                    file_path: abs_path.to_string_lossy().into(),
                });
            }
        }
    }

    if let Some((root_name, root_dir)) = detect_editor_root(&abs_path)? {
        let rel_path = abs_path
            .strip_prefix(&root_dir)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        return Ok(ExternalOpenTarget {
            kind: "editor".into(),
            page: Some("editor-home".into()),
            root: Some(root_name.into()),
            rel_path: Some(rel_path),
            file_path: abs_path.to_string_lossy().into(),
        });
    }

    if is_supported_external_file(&abs_path) {
        return Ok(ExternalOpenTarget {
            kind: "external-file".into(),
            page: Some("external-files".into()),
            root: None,
            rel_path: None,
            file_path: abs_path.to_string_lossy().into(),
        });
    }

    Ok(ExternalOpenTarget {
        kind: "unsupported".into(),
        page: None,
        root: None,
        rel_path: None,
        file_path: abs_path.to_string_lossy().into(),
    })
}

#[tauri::command]
pub fn list_external_files() -> Result<Vec<ExternalFileEntry>, String> {
    refresh_external_files_index()
}

#[tauri::command]
pub fn open_external_file(file_path: String) -> Result<ExternalFileOpenResult, String> {
    let abs_path = PathBuf::from(file_path.trim())
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !abs_path.is_file() {
        return Err("Not a file".into());
    }
    if !is_supported_external_file(&abs_path) {
        return Err("Unsupported file type".into());
    }
    let content = read_utf8_file(&abs_path)?;
    let entry = upsert_external_file_entry(&abs_path)?;
    Ok(ExternalFileOpenResult { entry, content })
}

#[tauri::command]
pub fn save_external_file(
    file_path: String,
    content: String,
) -> Result<ExternalFileWriteResult, String> {
    let abs_path = PathBuf::from(file_path.trim())
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !abs_path.is_file() {
        return Err("Not a file".into());
    }
    if !is_supported_external_file(&abs_path) {
        return Err("Unsupported file type".into());
    }
    fs::write(&abs_path, content).map_err(|e| e.to_string())?;
    let entry = save_external_file_entry(&abs_path)?;
    Ok(ExternalFileWriteResult {
        entry,
        message: "File saved".into(),
    })
}

#[tauri::command]
pub fn remove_external_file(file_path: String) -> Result<Vec<ExternalFileEntry>, String> {
    let mut entries = read_external_files_index()?;
    entries.retain(|item| item.file_path != file_path.trim());
    write_external_files_index(&entries)?;
    refresh_external_files_index()
}

#[tauri::command]
pub fn clear_external_files() -> Result<Vec<ExternalFileEntry>, String> {
    write_external_files_index(&[])?;
    Ok(Vec::new())
}

#[tauri::command]
pub fn reveal_external_file_in_finder(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg("-R")
            .arg(file_path.trim())
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open -R exited with status {status}"))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = file_path;
        Err("Reveal in file manager is only supported on macOS here".into())
    }
}

#[tauri::command]
pub fn import_external_file_to_anonymous(
    file_path: String,
) -> Result<ExternalFileImportResult, String> {
    let abs_path = PathBuf::from(file_path.trim())
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !abs_path.is_file() {
        return Err("Not a file".into());
    }
    let base = ensure_dir(&anonymous_root_dir()?)?;
    let stem = abs_path
        .file_stem()
        .and_then(OsStr::to_str)
        .map(sanitize_file_stem)
        .unwrap_or_else(|| "file".to_string());
    let ext = abs_path
        .extension()
        .and_then(OsStr::to_str)
        .map(|s| s.to_ascii_lowercase());

    for index in 0..10_000 {
        let suffix = if index == 0 {
            String::new()
        } else {
            format!("-{}", index + 1)
        };
        let file_name = match ext.as_deref() {
            Some(ext) if !ext.is_empty() => format!("{}{suffix}.{}", stem, ext),
            _ => format!("{}{suffix}", stem),
        };
        let candidate = base.join(&file_name);
        if candidate.exists() {
            continue;
        }
        fs::copy(&abs_path, &candidate).map_err(|e| format!("{}: {}", candidate.display(), e))?;
        let rel_path = candidate
            .strip_prefix(&base)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        return Ok(ExternalFileImportResult {
            rel_path,
            message: "Imported to anonymous drafts".into(),
        });
    }

    Err("Unable to import file".into())
}

#[tauri::command]
pub fn list_editor_directory(root: String, rel: String) -> Result<Vec<EditorDirEntry>, String> {
    let base = editor_root_dir(root.trim())?;
    let rel = normalize_rel(rel.trim())?;
    let target = resolve_under_root(&base, &rel)?;
    if !target.is_dir() {
        return Err("Not a directory".into());
    }

    let mut out: Vec<EditorDirEntry> = Vec::new();
    for entry in fs::read_dir(&target).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        let is_dir = path.is_dir();
        let rel_path = if rel.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", rel.trim_end_matches('/'), name)
        };
        out.push(EditorDirEntry {
            name,
            rel_path,
            is_dir,
        });
    }

    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(out)
}

#[tauri::command]
pub fn read_editor_home_file(root: String, rel: String) -> Result<String, String> {
    let base = editor_root_dir(root.trim())?;
    let path = resolve_under_root(&base, rel.trim())?;
    if !path.is_file() {
        return Err("Not a file".into());
    }
    read_utf8_file(&path)
}

#[tauri::command]
pub fn resolve_editor_file_abs(root: String, rel: String) -> Result<String, String> {
    let base = editor_root_dir(root.trim())?;
    let path = resolve_under_root(&base, rel.trim())?;
    if !path.is_file() {
        return Err("Not a file".into());
    }
    Ok(path.to_string_lossy().into())
}

#[tauri::command]
pub fn create_editor_file(
    root: String,
    rel: Option<String>,
    initial_content: Option<String>,
) -> Result<EditorWriteResult, String> {
    let base = editor_root_dir(root.trim())?;
    let path = match rel
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(rel) => resolve_target_under_root(&base, rel)?,
        None if root.trim() == "anonymous" => next_untitled_path(&base)?,
        None => return Err("Invalid path".into()),
    };
    if path.exists() {
        return Err("File already exists".into());
    }
    let rel_path = path
        .strip_prefix(&base)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    fs::write(&path, initial_content.unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(EditorWriteResult {
        success: true,
        rel_path,
        message: "File created".into(),
    })
}

#[tauri::command]
pub fn write_editor_file(
    root: String,
    rel: String,
    content: String,
) -> Result<EditorWriteResult, String> {
    let base = editor_root_dir(root.trim())?;
    let path = resolve_target_under_root(&base, rel.trim())?;
    let rel_path = path
        .strip_prefix(&base)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(EditorWriteResult {
        success: true,
        rel_path,
        message: "File saved".into(),
    })
}

#[tauri::command]
pub fn delete_editor_file(root: String, rel: String) -> Result<EditorWriteResult, String> {
    let base = editor_root_dir(root.trim())?;
    let path = resolve_under_root(&base, rel.trim())?;
    if !path.is_file() {
        return Err("Not a file".into());
    }
    let rel_path = path
        .strip_prefix(&base)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(EditorWriteResult {
        success: true,
        rel_path,
        message: "File deleted".into(),
    })
}

#[tauri::command]
pub fn create_editor_directory(root: String, rel: String) -> Result<EditorWriteResult, String> {
    let base = editor_root_dir(root.trim())?;
    let path = resolve_target_under_root(&base, rel.trim())?;
    if path.exists() {
        return Err("Directory already exists".into());
    }
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let rel_path = path
        .strip_prefix(&base)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    Ok(EditorWriteResult {
        success: true,
        rel_path,
        message: "Directory created".into(),
    })
}
