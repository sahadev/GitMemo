#[cfg(desktop)]
use gitmemo_core::storage::{database, files};
#[cfg(desktop)]
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
#[cfg(desktop)]
use serde::Serialize;
#[cfg(desktop)]
use std::ffi::OsStr;
#[cfg(desktop)]
use std::path::{Path, PathBuf};
#[cfg(desktop)]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(desktop)]
use std::sync::{mpsc, Mutex, OnceLock};
#[cfg(desktop)]
use std::time::{Duration, Instant};
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Emitter;

#[cfg(desktop)]
static WATCHER_RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(desktop)]
static EXTERNAL_FILE_WATCHER: OnceLock<Mutex<Option<ExternalFileWatcherSession>>> = OnceLock::new();

#[cfg(desktop)]
struct ExternalFileWatcherSession {
    target_path: PathBuf,
    stop_tx: mpsc::Sender<()>,
}

#[cfg(desktop)]
#[derive(Debug, Clone, Serialize)]
pub struct FilesChangedEvent {
    /// Which folder changed: "conversations", "notes", "clips", "plans", etc.
    pub folder: String,
}

#[cfg(desktop)]
#[derive(Debug, Clone, Serialize)]
pub struct ExternalFileChangedEvent {
    pub file_path: String,
    pub exists: bool,
    pub last_modified_at: Option<String>,
}

/// Determine which top-level folder a path belongs to.
#[cfg(desktop)]
fn classify_path(path: &Path, sync_dir: &Path) -> Option<String> {
    let rel = path.strip_prefix(sync_dir).ok()?;
    let first = rel.components().next()?;
    let folder = first.as_os_str().to_string_lossy().to_string();
    // Only emit for content folders, skip .git / .metadata
    match folder.as_str() {
        "conversations" | "notes" | "clips" | "plans" | "favorites" | "claude-config"
        | "cursor-config" | "imports" => Some(folder),
        _ => None,
    }
}

#[cfg(desktop)]
fn update_index_for_path(path: &Path, sync_dir: &Path, removed: bool) {
    let Ok(rel) = path.strip_prefix(sync_dir) else {
        return;
    };
    let rel = rel.to_string_lossy().replace('\\', "/");
    if !rel.ends_with(".md") {
        return;
    }

    let db_path = sync_dir.join(".metadata").join("index.db");
    let Ok(conn) = database::open_or_create(&db_path) else {
        return;
    };
    if removed || !path.is_file() {
        let _ = database::remove_relative_file(&conn, &rel);
    } else {
        let _ = database::index_relative_file(&conn, sync_dir, &rel);
    }
}

#[cfg(desktop)]
fn modified_at(path: &Path) -> Option<String> {
    let meta = path.metadata().ok()?;
    let modified = meta.modified().ok()?;
    let dt: chrono::DateTime<chrono::Utc> = modified.into();
    Some(dt.to_rfc3339())
}

#[cfg(desktop)]
fn external_file_watcher_state() -> &'static Mutex<Option<ExternalFileWatcherSession>> {
    EXTERNAL_FILE_WATCHER.get_or_init(|| Mutex::new(None))
}

#[cfg(desktop)]
fn stop_external_file_watcher_session() {
    let mut session = external_file_watcher_state().lock().unwrap();
    if let Some(session) = session.take() {
        let _ = session.stop_tx.send(());
    }
}

#[cfg(desktop)]
fn external_event_targets_file(
    event: &Event,
    target_path: &Path,
    parent_dir: &Path,
    file_name: &OsStr,
) -> bool {
    event.paths.iter().any(|path| {
        if path == target_path {
            return true;
        }
        if path.file_name() != Some(file_name) {
            return false;
        }
        let Some(parent) = path.parent() else {
            return false;
        };
        parent == parent_dir
            || parent
                .canonicalize()
                .ok()
                .is_some_and(|canonical_parent| canonical_parent == parent_dir)
    })
}

#[cfg(desktop)]
fn emit_external_file_changed(app_handle: &AppHandle, target_path: &Path) {
    let _ = app_handle.emit(
        "external-file-changed",
        ExternalFileChangedEvent {
            file_path: target_path.to_string_lossy().into_owned(),
            exists: target_path.is_file(),
            last_modified_at: modified_at(target_path),
        },
    );
}

#[cfg(desktop)]
fn is_internal_path(path: &Path, sync_dir: &Path) -> bool {
    path.strip_prefix(sync_dir).ok().is_some_and(|rel| {
        rel.components().any(|component| {
            let name = component.as_os_str().to_string_lossy();
            name == ".git" || name == ".metadata"
        })
    })
}

/// Start watching the sync directory for file changes.
/// Emits `files-changed` events to the frontend with debouncing.
/// Safe to call multiple times — only the first successful call starts a watcher.
#[cfg(desktop)]
pub fn start_file_watcher(app_handle: AppHandle) {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return;
    }

    // Prevent duplicate watchers
    if WATCHER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<Event>();

        let mut watcher = match RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.send(event);
                }
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[gitmemo] Failed to create file watcher: {}", e);
                WATCHER_RUNNING.store(false, Ordering::SeqCst);
                return;
            }
        };

        if let Err(e) = watcher.watch(&sync_dir, RecursiveMode::Recursive) {
            eprintln!("[gitmemo] Failed to watch {}: {}", sync_dir.display(), e);
            WATCHER_RUNNING.store(false, Ordering::SeqCst);
            return;
        }

        // Debounce: collect events, emit at most once per folder per 500ms
        let mut last_emit: std::collections::HashMap<String, Instant> =
            std::collections::HashMap::new();
        let debounce = Duration::from_millis(500);

        loop {
            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(event) => {
                    // Only react to create/modify/remove events
                    let dominated = matches!(
                        event.kind,
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                    );
                    if !dominated {
                        continue;
                    }

                    for path in &event.paths {
                        // Skip .git and .metadata internal changes
                        if is_internal_path(path, &sync_dir) {
                            continue;
                        }

                        if let Some(folder) = classify_path(path, &sync_dir) {
                            update_index_for_path(
                                path,
                                &sync_dir,
                                matches!(event.kind, EventKind::Remove(_)),
                            );

                            let now = Instant::now();
                            let should_emit = last_emit
                                .get(&folder)
                                .map(|t| now.duration_since(*t) >= debounce)
                                .unwrap_or(true);

                            if should_emit {
                                last_emit.insert(folder.clone(), now);
                                let _ =
                                    app_handle.emit("files-changed", FilesChangedEvent { folder });
                            }
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // Keep the loop alive
                    continue;
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }

        WATCHER_RUNNING.store(false, Ordering::SeqCst);
    });
}

#[cfg(not(desktop))]
pub fn start_file_watcher(_app_handle: AppHandle) {}

#[cfg(desktop)]
#[tauri::command]
pub fn watch_external_file(file_path: String, app_handle: AppHandle) -> Result<(), String> {
    let target_path = PathBuf::from(file_path.trim())
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !target_path.is_file() {
        return Err("Not a file".into());
    }
    let parent_dir = target_path
        .parent()
        .ok_or_else(|| "Invalid file path".to_string())?
        .to_path_buf();
    let file_name = target_path
        .file_name()
        .ok_or_else(|| "Invalid file path".to_string())?
        .to_os_string();

    {
        let mut session = external_file_watcher_state().lock().unwrap();
        if session
            .as_ref()
            .is_some_and(|current| current.target_path == target_path)
        {
            return Ok(());
        }
        if let Some(current) = session.take() {
            let _ = current.stop_tx.send(());
        }
    }

    let (event_tx, event_rx) = mpsc::channel::<Event>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = event_tx.send(event);
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create external file watcher: {}", e))?;
    watcher
        .watch(&parent_dir, RecursiveMode::NonRecursive)
        .map_err(|e| {
            format!(
                "Failed to watch external file parent {}: {}",
                parent_dir.display(),
                e
            )
        })?;
    let thread_target_path = target_path.clone();
    let thread_parent_dir = parent_dir.clone();
    let thread_file_name = file_name.clone();
    let thread_app_handle = app_handle.clone();

    std::thread::spawn(move || {
        let _watcher = watcher;

        let debounce = Duration::from_millis(250);
        let mut pending_emit_at: Option<Instant> = None;

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            let timeout = pending_emit_at
                .map(|deadline| deadline.saturating_duration_since(Instant::now()))
                .unwrap_or_else(|| Duration::from_secs(1));

            match event_rx.recv_timeout(timeout) {
                Ok(event) => {
                    if !matches!(
                        event.kind,
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                    ) {
                        continue;
                    }
                    if external_event_targets_file(
                        &event,
                        &thread_target_path,
                        &thread_parent_dir,
                        &thread_file_name,
                    ) {
                        pending_emit_at = Some(Instant::now() + debounce);
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if pending_emit_at.is_some_and(|deadline| Instant::now() >= deadline) {
                        emit_external_file_changed(&thread_app_handle, &thread_target_path);
                        pending_emit_at = None;
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }
    });

    let mut session = external_file_watcher_state().lock().unwrap();
    *session = Some(ExternalFileWatcherSession {
        target_path,
        stop_tx,
    });
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn watch_external_file(_file_path: String, _app_handle: AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
pub fn stop_external_file_watcher() {
    stop_external_file_watcher_session();
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn stop_external_file_watcher() {}

/// Tauri command to (re)start the file watcher after initialization.
#[cfg(desktop)]
#[tauri::command]
pub fn restart_file_watcher(app_handle: AppHandle) {
    start_file_watcher(app_handle);
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn restart_file_watcher(_app_handle: AppHandle) {}
