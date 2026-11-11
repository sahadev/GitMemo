//! Local-only "new changes" tracking.
//!
//! A note is unread when its on-disk signature (mtime + byte size) differs from
//! the signature recorded the last time the user opened it. The bookkeeping file
//! lives outside the sync repo on purpose: unread state never syncs between
//! devices, it only describes what changed on this machine.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use gitmemo_core::storage::files;
use serde::{Deserialize, Serialize};
use tauri::Manager;

const STATE_VERSION: u32 = 1;
const STATE_FILE_NAME: &str = "unread-state.json";

/// Folders the UI is allowed to ask about.
const SUPPORTED_FOLDERS: [&str; 3] = ["notes", "conversations", "plans"];

static STATE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct FolderState {
    /// False until the first snapshot took the current files as already seen.
    #[serde(default)]
    initialized: bool,
    /// Relative path -> signature at the moment the file was last read.
    #[serde(default)]
    seen: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UnreadState {
    #[serde(default = "default_version")]
    version: u32,
    #[serde(default)]
    folders: BTreeMap<String, FolderState>,
}

fn default_version() -> u32 {
    STATE_VERSION
}

impl Default for UnreadState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            folders: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnreadSnapshot {
    /// folder -> number of changed files the user has not opened yet.
    pub counts: BTreeMap<String, usize>,
    /// Relative paths (same shape as `FileEntry.path`) that are unread.
    pub unread_paths: Vec<String>,
}

struct ScannedFile {
    rel_path: String,
    signature: String,
}

fn state_path(app: &tauri::AppHandle) -> PathBuf {
    match app.path().app_data_dir() {
        Ok(dir) => dir.join(STATE_FILE_NAME),
        // `.metadata` is gitignored, so this fallback still stays local.
        Err(_) => files::sync_dir().join(".metadata").join(STATE_FILE_NAME),
    }
}

fn load_state(path: &Path) -> UnreadState {
    let raw = match std::fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(_) => return UnreadState::default(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_state(path: &Path, state: &UnreadState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let raw = serde_json::to_string_pretty(state).map_err(|err| err.to_string())?;
    std::fs::write(path, raw).map_err(|err| err.to_string())
}

fn signature_of(meta: &std::fs::Metadata) -> String {
    let millis = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|dur| dur.as_millis())
        .unwrap_or(0);
    format!("{millis}:{}", meta.len())
}

/// One top-level folder name, no separators, no traversal.
fn is_supported_folder(folder: &str) -> bool {
    SUPPORTED_FOLDERS.contains(&folder)
}

fn is_tracked_file(path: &Path) -> bool {
    if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
        return false;
    }
    // Skip dot-entries such as `.metadata/` or editor swap files.
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| !name.starts_with('.'))
        .unwrap_or(false)
}

fn scan_folder(dir: &Path, folder: &str) -> Vec<ScannedFile> {
    let target = dir.join(folder);
    if !target.exists() {
        return vec![];
    }

    let mut files_out = Vec::new();
    for entry in walkdir::WalkDir::new(&target)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| is_tracked_file(entry.path()))
    {
        if entry.path().components().any(|part| {
            part.as_os_str()
                .to_str()
                .map(|name| name.starts_with('.'))
                .unwrap_or(false)
        }) {
            continue;
        }
        let meta = match entry.path().metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        let rel_path = entry
            .path()
            .strip_prefix(dir)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .to_string();
        files_out.push(ScannedFile {
            rel_path,
            signature: signature_of(&meta),
        });
    }
    files_out
}

/// Count unread files for one folder and refresh the pruned seen-set.
fn snapshot_folder(state: &mut UnreadState, dir: &Path, folder: &str) -> (usize, Vec<String>) {
    let scanned = scan_folder(dir, folder);
    let folder_state = state.folders.entry(folder.to_string()).or_default();

    // First run for this folder: treat what is already on disk as read so the
    // user is not greeted with a wall of dots on a fresh install.
    if !folder_state.initialized {
        folder_state.seen = scanned
            .into_iter()
            .map(|file| (file.rel_path, file.signature))
            .collect();
        folder_state.initialized = true;
        return (0, Vec::new());
    }

    let present: BTreeSet<&str> = scanned.iter().map(|file| file.rel_path.as_str()).collect();
    folder_state
        .seen
        .retain(|rel_path, _| present.contains(rel_path.as_str()));

    let mut unread_paths = Vec::new();
    for file in &scanned {
        let changed = folder_state
            .seen
            .get(&file.rel_path)
            .map(|seen| seen != &file.signature)
            .unwrap_or(true);
        if changed {
            unread_paths.push(file.rel_path.clone());
        }
    }
    (unread_paths.len(), unread_paths)
}

#[tauri::command]
pub fn unread_snapshot(
    app: tauri::AppHandle,
    folders: Vec<String>,
) -> Result<UnreadSnapshot, String> {
    let dir = files::sync_dir();
    let path = state_path(&app);
    let _guard = STATE_LOCK.lock().map_err(|err| err.to_string())?;

    let mut state = load_state(&path);
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut unread_paths: Vec<String> = Vec::new();

    for folder in folders {
        if !is_supported_folder(&folder) {
            continue;
        }
        let (count, paths) = snapshot_folder(&mut state, &dir, &folder);
        counts.insert(folder, count);
        unread_paths.extend(paths);
    }

    save_state(&path, &state)?;
    Ok(UnreadSnapshot {
        counts,
        unread_paths,
    })
}

#[tauri::command]
pub fn mark_file_read(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let dir = files::sync_dir();
    let path = state_path(&app);
    let _guard = STATE_LOCK.lock().map_err(|err| err.to_string())?;

    let mut state = load_state(&path);
    let rel_path = file_path.replace('\\', "/");
    let folder = match rel_path.split('/').next() {
        Some(folder) if !folder.is_empty() => folder.to_string(),
        _ => return Ok(()),
    };

    let absolute = dir.join(&rel_path);
    let signature = absolute
        .metadata()
        .ok()
        .map(|meta| signature_of(&meta));

    let folder_state = state.folders.entry(folder).or_default();
    match signature {
        Some(signature) => {
            folder_state.seen.insert(rel_path, signature);
        }
        // File vanished: nothing left to read, drop the stale record.
        None => {
            folder_state.seen.remove(&rel_path);
        }
    }

    save_state(&path, &state)
}

#[tauri::command]
pub fn mark_folder_read(app: tauri::AppHandle, folder: String) -> Result<(), String> {
    if !is_supported_folder(&folder) {
        return Ok(());
    }
    let dir = files::sync_dir();
    let path = state_path(&app);
    let _guard = STATE_LOCK.lock().map_err(|err| err.to_string())?;

    let mut state = load_state(&path);
    let scanned = scan_folder(&dir, &folder);
    let folder_state = state.folders.entry(folder).or_default();
    folder_state.seen = scanned
        .into_iter()
        .map(|file| (file.rel_path, file.signature))
        .collect();
    folder_state.initialized = true;

    save_state(&path, &state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gitmemo-unread-{name}-{}",
            SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(dir.join("notes")).unwrap();
        dir
    }

    fn write_note(dir: &Path, rel: &str, body: &str) {
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn age_file(dir: &Path, rel: &str) {
        // Push mtime back so a rewrite is guaranteed to look newer.
        let path = dir.join(rel);
        let file = std::fs::OpenOptions::new().write(true).open(&path).unwrap();
        file.set_modified(SystemTime::now() - Duration::from_secs(60))
            .unwrap();
    }

    #[test]
    fn first_snapshot_baselines_existing_files() {
        let dir = temp_dir("baseline");
        write_note(&dir, "notes/a.md", "# a");
        write_note(&dir, "notes/nested/b.md", "# b");

        let mut state = UnreadState::default();
        let (count, paths) = snapshot_folder(&mut state, &dir, "notes");
        assert_eq!(count, 0);
        assert!(paths.is_empty());
        assert_eq!(state.folders["notes"].seen.len(), 2);
        assert!(state.folders["notes"].initialized);
    }

    #[test]
    fn new_and_changed_files_are_unread() {
        let dir = temp_dir("changed");
        write_note(&dir, "notes/a.md", "# a");
        let mut state = UnreadState::default();
        snapshot_folder(&mut state, &dir, "notes");

        write_note(&dir, "notes/created-later.md", "# new");
        let (count, paths) = snapshot_folder(&mut state, &dir, "notes");
        assert_eq!(count, 1);
        assert_eq!(paths, vec!["notes/created-later.md".to_string()]);

        age_file(&dir, "notes/a.md");
        write_note(&dir, "notes/a.md", "# a edited");
        let (count, paths) = snapshot_folder(&mut state, &dir, "notes");
        assert_eq!(count, 2);
        assert!(paths.contains(&"notes/a.md".to_string()));
    }

    #[test]
    fn deleted_files_are_pruned_not_counted() {
        let dir = temp_dir("prune");
        write_note(&dir, "notes/a.md", "# a");
        write_note(&dir, "notes/b.md", "# b");
        let mut state = UnreadState::default();
        snapshot_folder(&mut state, &dir, "notes");

        std::fs::remove_file(dir.join("notes/b.md")).unwrap();
        let (count, _) = snapshot_folder(&mut state, &dir, "notes");
        assert_eq!(count, 0);
        assert_eq!(state.folders["notes"].seen.len(), 1);
    }

    #[test]
    fn unsupported_folders_are_ignored() {
        assert!(is_supported_folder("notes"));
        assert!(!is_supported_folder("clips"));
        assert!(!is_supported_folder("../notes"));
    }
}
