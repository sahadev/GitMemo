#[cfg(desktop)]
use gitmemo_core::storage::{database, files};
#[cfg(desktop)]
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
#[cfg(desktop)]
use serde::Serialize;
#[cfg(desktop)]
use std::path::Path;
#[cfg(desktop)]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(desktop)]
use std::sync::mpsc;
#[cfg(desktop)]
use std::time::{Duration, Instant};
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Emitter;

#[cfg(desktop)]
static WATCHER_RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(desktop)]
#[derive(Debug, Clone, Serialize)]
pub struct FilesChangedEvent {
    /// Which folder changed: "conversations", "notes", "clips", "plans", etc.
    pub folder: String,
}

/// Determine which top-level folder a path belongs to.
#[cfg(desktop)]
fn classify_path(path: &Path, sync_dir: &Path) -> Option<String> {
    let rel = path.strip_prefix(sync_dir).ok()?;
    let first = rel.components().next()?;
    let folder = first.as_os_str().to_string_lossy().to_string();
    // Only emit for content folders, skip .git / .metadata
    match folder.as_str() {
        "conversations" | "notes" | "clips" | "plans" | "claude-config" | "cursor-config"
        | "imports" => Some(folder),
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
                        let path_str = path.to_string_lossy();
                        if path_str.contains("/.git/") || path_str.contains("/.metadata/") {
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

/// Tauri command to (re)start the file watcher after initialization.
#[cfg(desktop)]
#[tauri::command]
pub fn restart_file_watcher(app_handle: AppHandle) {
    start_file_watcher(app_handle);
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn restart_file_watcher(_app_handle: AppHandle) {}
