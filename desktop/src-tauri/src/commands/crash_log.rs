use std::fs;
use std::io::Write;
use std::path::PathBuf;

/// Directory for crash logs
#[cfg(desktop)]
fn crash_log_dir() -> PathBuf {
    // Use the gitmemo sync dir's .metadata/crash_logs for cross-platform consistency.
    // Fallback to HOME-based path if sync dir doesn't exist yet.
    let sync_dir = gitmemo_core::storage::files::sync_dir();
    if sync_dir.exists() {
        return sync_dir.join(".metadata").join("crash_logs");
    }
    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    home.join(".gitmemo").join(".metadata").join("crash_logs")
}

#[cfg(not(desktop))]
fn crash_log_dir() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir())
        .join(".gitmemo")
        .join(".metadata")
        .join("crash_logs")
}

/// Write a crash log entry (panic or unhandled error).
pub fn write_crash_log(kind: &str, message: &str) {
    let dir = crash_log_dir();
    let _ = fs::create_dir_all(&dir);

    let now = chrono::Local::now();
    let filename = now.format("crash_%Y-%m-%d_%H-%M-%S.log").to_string();
    let path = dir.join(&filename);

    let content = format!(
        "=== GitMemo Crash Log ===\nTime: {}\nKind: {}\nVersion: {}\nOS: {}/{}\n\n{}\n",
        now.to_rfc3339(),
        kind,
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH,
        message,
    );

    if let Ok(mut file) = fs::File::create(&path) {
        let _ = file.write_all(content.as_bytes());
    }

    // Also append to a rolling "latest.log" for quick access
    let latest = dir.join("latest.log");
    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&latest)
    {
        let _ = file.write_all(format!("\n---\n{}", content).as_bytes());
    }
}

/// Install a global panic hook that logs before aborting.
pub fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic payload".to_string()
        };

        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());

        let message = format!(
            "PANIC at {}\nPayload: {}\n\nBacktrace:\n{}",
            location,
            payload,
            std::backtrace::Backtrace::force_capture(),
        );

        write_crash_log("panic", &message);

        // Still call the default hook (prints to stderr)
        default_hook(info);
    }));
}

/// Tauri command: read all crash logs for the frontend to display.
#[tauri::command]
pub fn get_crash_logs() -> Result<Vec<CrashLogEntry>, String> {
    let dir = crash_log_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<CrashLogEntry> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .file_name()
                .map(|n| {
                    n.to_string_lossy().starts_with("crash_")
                        && n.to_string_lossy().ends_with(".log")
                })
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let path = e.path();
            let content = fs::read_to_string(&path).ok()?;
            let filename = path.file_name()?.to_string_lossy().to_string();
            Some(CrashLogEntry { filename, content })
        })
        .collect();

    // Most recent first
    entries.sort_by(|a, b| b.filename.cmp(&a.filename));
    // Limit to 50 entries
    entries.truncate(50);

    Ok(entries)
}

/// Tauri command: clear all crash logs.
#[tauri::command]
pub fn clear_crash_logs() -> Result<String, String> {
    let dir = crash_log_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok("cleared".into())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CrashLogEntry {
    pub filename: String,
    pub content: String,
}
