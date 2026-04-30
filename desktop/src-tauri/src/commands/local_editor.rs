use serde::Serialize;
use std::ffi::OsStr;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

const MAX_VIEW_BYTES: u64 = 8 * 1024 * 1024;

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

fn ensure_dir(path: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(path).map_err(|e| format!("{}: {}", path.display(), e))?;
    path.canonicalize()
        .map_err(|e| format!("{}: {}", path.display(), e))
}

fn editor_root_dir(root: &str) -> Result<PathBuf, String> {
    let root_name = root.trim();
    match root_name {
        "claude" | "cursor" => {
            let home = home_dir().ok_or_else(|| "HOME/USERPROFILE not set".to_string())?;
            let p = match root_name {
                "claude" => home.join(".claude"),
                "cursor" => home.join(".cursor"),
                _ => unreachable!(),
            };
            if !p.is_dir() {
                return Err(format!("Directory does not exist: {}", p.display()));
            }
            p.canonicalize()
                .map_err(|e| format!("{}: {}", p.display(), e))
        }
        "anonymous" => ensure_dir(&anonymous_root_dir()?),
        _ => Err("root must be \"claude\", \"cursor\", or \"anonymous\"".into()),
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
            Component::Normal(seg) => {
                let seg = seg.to_string_lossy();
                if seg.is_empty() || seg == "." {
                    return Err("Invalid path".into());
                }
                parts.push(seg.into_owned());
            }
            Component::CurDir => return Err("Invalid path".into()),
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Invalid path".into())
            }
        }
    }

    Ok(parts.join("/"))
}

fn detect_editor_root(abs_path: &Path) -> Result<Option<(EditorRootKind, PathBuf)>, String> {
    for root_name in ["claude", "cursor", "anonymous"] {
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

fn ensure_external_open_staging_dir() -> Result<PathBuf, String> {
    let dir = anonymous_root_dir()?.join("external-open");
    fs::create_dir_all(&dir).map_err(|e| format!("{}: {}", dir.display(), e))?;
    dir.canonicalize()
        .map_err(|e| format!("{}: {}", dir.display(), e))
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

fn stage_external_file(abs_path: &Path) -> Result<String, String> {
    let base = ensure_external_open_staging_dir()?;
    let stem = abs_path
        .file_stem()
        .and_then(OsStr::to_str)
        .map(sanitize_file_stem)
        .unwrap_or_else(|| "file".to_string());
    let ext = abs_path.extension().and_then(OsStr::to_str).map(|s| s.to_ascii_lowercase());

    for index in 0..10_000 {
        let suffix = if index == 0 { String::new() } else { format!("-{}", index + 1) };
        let file_name = match ext.as_deref() {
            Some(ext) if !ext.is_empty() => format!("{}{suffix}.{}", stem, ext),
            _ => format!("{}{suffix}", stem),
        };
        let candidate = base.join(&file_name);
        if candidate.exists() {
            continue;
        }
        fs::copy(abs_path, &candidate).map_err(|e| format!("{}: {}", candidate.display(), e))?;
        return Ok(
            candidate
                .strip_prefix(&base)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/"),
        );
    }

    Err("Unable to stage external file".into())
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
    pub anonymous_path: String,
    pub anonymous_exists: bool,
}

#[derive(Debug, Serialize)]
pub struct EditorDirEntry {
    pub name: String,
    /// Relative path from root using `/`.
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
            anonymous_path: anonymous.to_string_lossy().into(),
            anonymous_exists: true,
        });
    };
    let claude = home.join(".claude");
    let cursor = home.join(".cursor");
    let claude_exists = claude.is_dir();
    let cursor_exists = cursor.is_dir();
    let anonymous = ensure_dir(&anonymous_root_dir()?)?;
    Ok(EditorRootsStatus {
        claude_path: claude.to_string_lossy().into(),
        claude_exists,
        cursor_path: cursor.to_string_lossy().into(),
        cursor_exists,
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
        let rel_path = stage_external_file(&abs_path)?;
        return Ok(ExternalOpenTarget {
            kind: "editor".into(),
            page: Some("editor-home".into()),
            root: Some("anonymous".into()),
            rel_path: Some(format!("external-open/{}", rel_path)),
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
    let len = path.metadata().map_err(|e| e.to_string())?.len();
    if len > MAX_VIEW_BYTES {
        return Err(format!(
            "File too large to preview ({} MB; max {} MB). Open in an external editor.",
            len / 1024 / 1024,
            MAX_VIEW_BYTES / 1024 / 1024
        ));
    }
    let f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    f.take(MAX_VIEW_BYTES)
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
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
pub fn create_editor_file(root: String, rel: Option<String>, initial_content: Option<String>) -> Result<EditorWriteResult, String> {
    let base = editor_root_dir(root.trim())?;
    let path = match rel.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
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
pub fn write_editor_file(root: String, rel: String, content: String) -> Result<EditorWriteResult, String> {
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
