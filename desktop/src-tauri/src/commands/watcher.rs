use gitmemo_core::storage::files;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

static WATCHER_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
pub struct FilesChangedEvent {
    /// Which folder changed: "conversations", "notes", "clips", "plans", etc.
    pub folder: String,
}

/// Determine which top-level folder a path belongs to.
fn classify_path(path: &Path, sync_dir: &Path) -> Option<String> {
    let rel = path.strip_prefix(sync_dir).ok()?;
    let first = rel.components().next()?;
    let folder = first.as_os_str().to_string_lossy().to_string();
    // Only emit for content folders, skip .git / .metadata
    match folder.as_str() {
        "conversations" | "notes" | "clips" | "plans" | "claude-config" | "cursor-config" | "imports" => {
            Some(folder)
        }
        _ => None,
    }
}

/// Start watching the sync directory for file changes.
/// Emits `files-changed` events to the frontend with debouncing.
/// Safe to call multiple times — only the first successful call starts a watcher.
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
        let mut last_emit: std::collections::HashMap<String, Instant> = std::collections::HashMap::new();
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
                            let now = Instant::now();
                            let should_emit = last_emit
                                .get(&folder)
                                .map(|t| now.duration_since(*t) >= debounce)
                                .unwrap_or(true);

                            if should_emit {
                                last_emit.insert(folder.clone(), now);
                                let _ = app_handle.emit("files-changed", FilesChangedEvent { folder });
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

/// Tauri command to (re)start the file watcher after initialization.
#[tauri::command]
pub fn restart_file_watcher(app_handle: AppHandle) {
    start_file_watcher(app_handle);
}
