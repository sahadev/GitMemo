use super::markdown::{frontmatter_value, markdown_body};
use super::sync_log;
use gitmemo_core::storage::{files, git};
use gitmemo_core::utils::sanitize::git_error_for_user;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

const FAVORITES_DIR: &str = "favorites";
const FAVORITES_ITEMS_DIR: &str = "items";
const LEGACY_SYNC_FAVORITES_FILE: &str = "index.json";
const LEGACY_FAVORITES_FILE: &str = "favorites.json";
const FAVORITE_VIEW_BYTES: u64 = 8 * 1024 * 1024;
const FAVORITE_PREVIEW_BYTES: usize = 64 * 1024;

#[derive(Debug, Serialize)]
struct GitSyncEvent {
    ok: bool,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FavoriteRecord {
    pub target_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rel_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub absolute_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub source_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favorited_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FavoriteEntry {
    pub target_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rel_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub absolute_path: Option<String>,
    pub title: String,
    pub source_type: String,
    pub favorited_at: String,
    pub modified: String,
    pub preview: String,
    pub exists: bool,
    pub is_external: bool,
}

#[derive(Debug, Serialize)]
pub struct FavoriteContent {
    pub target_id: String,
    pub title: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rel_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub absolute_path: Option<String>,
    pub source_type: String,
    pub exists: bool,
}

fn sync_dir() -> PathBuf {
    files::sync_dir()
}

fn favorites_items_dir() -> PathBuf {
    sync_dir().join(FAVORITES_DIR).join(FAVORITES_ITEMS_DIR)
}

fn legacy_sync_favorites_path() -> PathBuf {
    sync_dir()
        .join(FAVORITES_DIR)
        .join(LEGACY_SYNC_FAVORITES_FILE)
}

fn legacy_favorites_path() -> PathBuf {
    sync_dir().join(".metadata").join(LEGACY_FAVORITES_FILE)
}

fn normalize_rel_path(input: &str) -> Result<String, String> {
    let trimmed = input.trim().trim_start_matches('/').replace('\\', "/");
    if trimmed.is_empty() || Path::new(&trimmed).is_absolute() {
        return Err("Invalid path".into());
    }

    let mut parts = Vec::new();
    for component in Path::new(&trimmed).components() {
        match component {
            std::path::Component::Normal(part) => {
                let part = part.to_string_lossy();
                if part.is_empty() || part == "." {
                    return Err("Invalid path".into());
                }
                parts.push(part.into_owned());
            }
            _ => return Err("Invalid path".into()),
        }
    }

    Ok(parts.join("/"))
}

fn normalize_absolute_path(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Invalid path".into());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("Invalid path".into());
    }
    Ok(path
        .canonicalize()
        .unwrap_or(path)
        .to_string_lossy()
        .into_owned())
}

fn target_id_for(rel_path: Option<&str>, absolute_path: Option<&str>) -> Result<String, String> {
    if let Some(rel_path) = rel_path {
        return Ok(format!("sync:{}", normalize_rel_path(rel_path)?));
    }
    if let Some(absolute_path) = absolute_path {
        return Ok(format!("file:{}", normalize_absolute_path(absolute_path)?));
    }
    Err("Favorite target is missing".into())
}

fn favorite_file_name(target_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(target_id.as_bytes());
    format!("{:x}.json", hasher.finalize())
}

fn favorite_item_path(target_id: &str) -> PathBuf {
    favorites_items_dir().join(favorite_file_name(target_id))
}

fn infer_source_type(
    rel_path: Option<&str>,
    absolute_path: Option<&str>,
    source_type: Option<&str>,
) -> String {
    if let Some(source_type) = source_type {
        if !source_type.trim().is_empty() {
            return source_type.trim().to_string();
        }
    }
    if let Some(path) = rel_path {
        if path.starts_with("conversations/") {
            return "conversation".into();
        }
        if path.starts_with("clips/") {
            return "clip".into();
        }
        if path.starts_with("plans/") {
            return "plan".into();
        }
        if path.starts_with("imports/") {
            return "import".into();
        }
        if path.starts_with("claude-config/") || path.starts_with("cursor-config/") {
            return "config".into();
        }
        if path.starts_with("notes/") {
            return "note".into();
        }
    }
    if absolute_path.is_some() {
        return "external".into();
    }
    "unknown".into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn favorite_target_rejects_parent_paths() {
        assert!(target_id_for(Some("notes/scratch/a.md"), None).is_ok());
        assert!(target_id_for(Some("../secret.md"), None).is_err());
    }

    #[test]
    fn favorite_file_names_are_stable_hashes() {
        let a = favorite_file_name("sync:notes/scratch/a.md");
        let b = favorite_file_name("sync:notes/scratch/a.md");
        let c = favorite_file_name("sync:notes/scratch/b.md");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert!(a.ends_with(".json"));
    }

    #[test]
    fn favorite_source_type_prefers_known_prefixes() {
        assert_eq!(infer_source_type(Some("clips/a.md"), None, None), "clip");
        assert_eq!(infer_source_type(Some("plans/a.md"), None, None), "plan");
        assert_eq!(infer_source_type(None, Some("/tmp/a.md"), None), "external");
        assert_eq!(
            infer_source_type(Some("notes/a.md"), None, Some("custom")),
            "custom"
        );
    }
}

fn fallback_title(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .or_else(|| Path::new(path).file_name())
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| path.to_string())
}

fn preview_from_content(content: &str) -> String {
    markdown_body(content)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .take(3)
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(200)
        .collect()
}

fn read_file_head(path: &Path) -> String {
    let Ok(file) = std::fs::File::open(path) else {
        return String::new();
    };
    let mut limited = std::io::Read::take(file, FAVORITE_PREVIEW_BYTES as u64);
    let mut buf = Vec::new();
    if std::io::Read::read_to_end(&mut limited, &mut buf).is_err() {
        return String::new();
    }
    String::from_utf8_lossy(&buf).into_owned()
}

fn read_text_file(path: &Path) -> Result<String, String> {
    let len = path.metadata().map_err(|e| e.to_string())?.len();
    if len > FAVORITE_VIEW_BYTES {
        return Err(format!(
            "File too large to preview ({} MB; max {} MB).",
            len / 1024 / 1024,
            FAVORITE_VIEW_BYTES / 1024 / 1024
        ));
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn modified_at(path: &Path) -> Option<String> {
    let modified = path.metadata().ok()?.modified().ok()?;
    let dt: chrono::DateTime<chrono::Local> = modified.into();
    Some(dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, false))
}

fn sync_full_path(rel_path: &str) -> Result<PathBuf, String> {
    let base = sync_dir();
    let rel = normalize_rel_path(rel_path)?;
    Ok(base.join(rel))
}

fn read_record_from_path(path: &Path) -> Result<FavoriteRecord, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("{}: {}", path.display(), e))?;
    serde_json::from_str::<FavoriteRecord>(&raw).map_err(|e| format!("{}: {}", path.display(), e))
}

fn read_legacy_records_from_path(path: &Path) -> Result<Vec<FavoriteRecord>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("{}: {}", path.display(), e))?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str::<Vec<FavoriteRecord>>(&raw)
        .map_err(|e| format!("{}: {}", path.display(), e))
}

fn load_item_records() -> Result<Vec<FavoriteRecord>, String> {
    let dir = favorites_items_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut records = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| format!("{}: {}", dir.display(), e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        match read_record_from_path(&path) {
            Ok(record) => records.push(record),
            Err(err) => log::warn!("favorite record skipped: {}", err),
        }
    }
    Ok(records)
}

fn load_records() -> Result<Vec<FavoriteRecord>, String> {
    let mut merged = BTreeMap::<String, FavoriteRecord>::new();
    for record in read_legacy_records_from_path(&legacy_favorites_path())? {
        merged.insert(record.target_id.clone(), record);
    }
    for record in read_legacy_records_from_path(&legacy_sync_favorites_path())? {
        merged.insert(record.target_id.clone(), record);
    }
    for record in load_item_records()? {
        merged.insert(record.target_id.clone(), record);
    }
    Ok(merged.into_values().collect())
}

fn write_item_record(record: &FavoriteRecord) -> Result<(), String> {
    let path = favorite_item_path(&record.target_id);
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid favorite item path".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| format!("{}: {}", parent.display(), e))?;
    let json = serde_json::to_string_pretty(record).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("{}: {}", path.display(), e))
}

fn remove_item_record(target_id: &str) -> Result<(), String> {
    let path = favorite_item_path(target_id);
    if path.is_file() {
        std::fs::remove_file(&path).map_err(|e| format!("{}: {}", path.display(), e))?;
    }
    Ok(())
}

fn remove_legacy_record(target_id: &str, path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let mut records = read_legacy_records_from_path(path)?;
    let original_len = records.len();
    records.retain(|record| record.target_id != target_id);
    if records.len() == original_len {
        return Ok(());
    }
    if records.is_empty() {
        std::fs::remove_file(path).map_err(|e| format!("{}: {}", path.display(), e))?;
        return Ok(());
    }
    let json = serde_json::to_string_pretty(&records).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("{}: {}", path.display(), e))
}

fn remove_legacy_records(target_id: &str) -> Result<(), String> {
    remove_legacy_record(target_id, &legacy_favorites_path())?;
    remove_legacy_record(target_id, &legacy_sync_favorites_path())
}

fn bg_commit_and_push(app: AppHandle, msg: String) {
    let _ = app.emit("git-sync-start", ());
    std::thread::spawn(move || {
        let dir = sync_dir();
        let sync_event = match git::commit_and_push(&dir, &msg) {
            Ok(result) if result.push_error.is_some() => GitSyncEvent {
                ok: false,
                message: git_error_for_user(
                    result.push_error.unwrap_or_else(|| "push failed".into()),
                ),
            },
            Ok(result) if !git::has_remote(&dir) => GitSyncEvent {
                ok: true,
                message: if result.committed {
                    "Saved locally".into()
                } else {
                    "No changes".into()
                },
            },
            Ok(result) => GitSyncEvent {
                ok: true,
                message: if result.committed {
                    "Synced".into()
                } else if result.pushed {
                    "Pushed".into()
                } else {
                    "No changes".into()
                },
            },
            Err(e) => GitSyncEvent {
                ok: false,
                message: git_error_for_user(e.to_string()),
            },
        };
        let _ = app.emit("git-sync-end", &sync_event);
        if !sync_event.ok {
            sync_log::write_sync_log("background sync", false, &sync_event.message, None);
        }
        let _ = app.emit(
            "files-changed",
            serde_json::json!({ "folder": FAVORITES_DIR }),
        );
    });
}

fn entry_from_record(record: FavoriteRecord) -> FavoriteEntry {
    let path = record
        .rel_path
        .as_deref()
        .and_then(|rel_path| sync_full_path(rel_path).ok())
        .or_else(|| record.absolute_path.as_deref().map(PathBuf::from));
    let exists = path.as_ref().is_some_and(|path| path.is_file());
    let head = path
        .as_ref()
        .filter(|path| path.is_file())
        .map(|path| read_file_head(path))
        .unwrap_or_default();
    let fallback = record
        .title
        .clone()
        .or_else(|| {
            record
                .rel_path
                .as_deref()
                .or(record.absolute_path.as_deref())
                .map(fallback_title)
        })
        .unwrap_or_else(|| record.target_id.clone());
    let title = frontmatter_value(&head, "title")
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or(fallback);
    let source_modified = path.as_ref().and_then(|path| modified_at(path));
    let favorited_at = record
        .favorited_at
        .clone()
        .or_else(|| modified_at(&favorite_item_path(&record.target_id)))
        .or_else(|| source_modified.clone())
        .unwrap_or_default();
    let modified = source_modified.unwrap_or_else(|| favorited_at.clone());
    let is_external = record.rel_path.is_none();

    FavoriteEntry {
        target_id: record.target_id,
        rel_path: record.rel_path,
        absolute_path: record.absolute_path,
        title,
        source_type: record.source_type,
        favorited_at,
        modified,
        preview: preview_from_content(&head),
        exists,
        is_external,
    }
}

#[tauri::command]
pub fn list_favorites() -> Result<Vec<FavoriteEntry>, String> {
    let mut entries: Vec<FavoriteEntry> =
        load_records()?.into_iter().map(entry_from_record).collect();
    entries.sort_by(|a, b| b.favorited_at.cmp(&a.favorited_at));
    Ok(entries)
}

#[tauri::command]
pub fn get_favorite_status(
    rel_path: Option<String>,
    absolute_path: Option<String>,
) -> Result<bool, String> {
    let target_id = target_id_for(rel_path.as_deref(), absolute_path.as_deref())?;
    Ok(favorite_item_path(&target_id).is_file()
        || load_records()?
            .iter()
            .any(|record| record.target_id == target_id))
}

#[tauri::command]
pub fn set_favorite(
    app: AppHandle,
    rel_path: Option<String>,
    absolute_path: Option<String>,
    title: Option<String>,
    source_type: Option<String>,
    favorited: bool,
) -> Result<bool, String> {
    let target_id = target_id_for(rel_path.as_deref(), absolute_path.as_deref())?;
    let normalized_rel = rel_path.as_deref().map(normalize_rel_path).transpose()?;
    let normalized_abs = absolute_path
        .as_deref()
        .map(normalize_absolute_path)
        .transpose()?;
    let commit_target = normalized_rel
        .as_deref()
        .or(normalized_abs.as_deref())
        .unwrap_or(&target_id)
        .to_string();

    if favorited {
        let fallback_title = title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .filter(|_| normalized_abs.is_some());
        let source_type = infer_source_type(
            normalized_rel.as_deref(),
            normalized_abs.as_deref(),
            source_type.as_deref(),
        );
        let record = FavoriteRecord {
            target_id,
            rel_path: normalized_rel,
            absolute_path: normalized_abs,
            title: fallback_title,
            source_type,
            favorited_at: None,
        };
        write_item_record(&record)?;
    } else {
        remove_item_record(&target_id)?;
        remove_legacy_records(&target_id)?;
    }

    let _ = app.emit("favorites-changed", ());
    bg_commit_and_push(
        app,
        format!(
            "{}: {}",
            if favorited { "favorite" } else { "unfavorite" },
            commit_target
        ),
    );
    Ok(favorited)
}

#[tauri::command]
pub fn read_favorite_content(target_id: String) -> Result<FavoriteContent, String> {
    let record = load_records()?
        .into_iter()
        .find(|record| record.target_id == target_id)
        .ok_or_else(|| "Favorite not found".to_string())?;
    let path = record
        .rel_path
        .as_deref()
        .and_then(|rel_path| sync_full_path(rel_path).ok())
        .or_else(|| record.absolute_path.as_deref().map(PathBuf::from))
        .ok_or_else(|| "Favorite target is missing".to_string())?;
    let exists = path.is_file();
    let content = if exists {
        read_text_file(&path)?
    } else {
        String::new()
    };
    let title = frontmatter_value(&content, "title")
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or(record.title.clone())
        .or_else(|| {
            record
                .rel_path
                .as_deref()
                .or(record.absolute_path.as_deref())
                .map(fallback_title)
        })
        .unwrap_or_else(|| record.target_id.clone());
    Ok(FavoriteContent {
        target_id: record.target_id,
        title,
        content,
        rel_path: record.rel_path,
        absolute_path: record.absolute_path,
        source_type: record.source_type,
        exists,
    })
}
