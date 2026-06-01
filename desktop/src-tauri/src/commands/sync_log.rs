use gitmemo_core::storage::files;
use gitmemo_core::utils::sanitize::filter_sensitive;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

fn sync_log_dir() -> PathBuf {
    let sync_dir = files::sync_dir();
    if sync_dir.exists() {
        return sync_dir.join(".metadata").join("sync_logs");
    }

    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir())
        .join(".gitmemo")
        .join(".metadata")
        .join("sync_logs")
}

pub fn write_sync_log(operation: &str, ok: bool, message: &str, detail: Option<&str>) {
    let dir = sync_log_dir();
    let _ = fs::create_dir_all(&dir);

    let now = chrono::Local::now();
    let filename = now.format("sync_%Y-%m-%d_%H-%M-%S_%3f.log").to_string();
    let path = dir.join(filename);

    let mut content = format!(
        "=== GitMemo Sync Log ===\nTime: {}\nOperation: {}\nResult: {}\nVersion: {}\nOS: {}/{}\n\nMessage:\n{}\n",
        now.to_rfc3339(),
        filter_sensitive(operation),
        if ok { "success" } else { "failed" },
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH,
        filter_sensitive(message),
    );

    if let Some(detail) = detail.filter(|value| !value.trim().is_empty()) {
        content.push_str("\nDetail:\n");
        content.push_str(&filter_sensitive(detail));
        content.push('\n');
    }

    if let Ok(mut file) = fs::File::create(path) {
        let _ = file.write_all(content.as_bytes());
    }
}

#[tauri::command]
pub fn get_sync_logs() -> Result<Vec<SyncLogEntry>, String> {
    let dir = sync_log_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<SyncLogEntry> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .file_name()
                .map(|name| {
                    let name = name.to_string_lossy();
                    name.starts_with("sync_") && name.ends_with(".log")
                })
                .unwrap_or(false)
        })
        .filter_map(|entry| {
            let path = entry.path();
            let content = fs::read_to_string(&path).ok()?;
            let filename = path.file_name()?.to_string_lossy().to_string();
            Some(SyncLogEntry { filename, content })
        })
        .collect();

    entries.sort_by(|a, b| b.filename.cmp(&a.filename));
    entries.truncate(50);

    Ok(entries)
}

#[tauri::command]
pub fn clear_sync_logs() -> Result<String, String> {
    let dir = sync_log_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok("cleared".into())
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncLogEntry {
    pub filename: String,
    pub content: String,
}
