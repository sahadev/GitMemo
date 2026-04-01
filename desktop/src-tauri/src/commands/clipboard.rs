use gitmemo_core::storage::{files, git};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

static WATCHING: AtomicBool = AtomicBool::new(false);

/// Minimum characters to save (filter out passwords, short copies)
const MIN_LENGTH: usize = 10;

/// Interval between clipboard checks (ms)
const POLL_INTERVAL_MS: u64 = 300;

#[derive(Debug, Clone, Serialize)]
pub struct ClipboardEvent {
    pub saved: bool,
    pub path: String,
    pub preview: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize)]
pub struct ClipboardStatus {
    pub watching: bool,
    pub clips_count: usize,
    pub clips_dir: String,
}

#[tauri::command]
pub fn get_clipboard_status() -> Result<ClipboardStatus, String> {
    let sync_dir = files::sync_dir();
    let clips_dir = sync_dir.join("clips");

    let count = if clips_dir.exists() {
        walkdir::WalkDir::new(&clips_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
            .count()
    } else {
        0
    };

    Ok(ClipboardStatus {
        watching: WATCHING.load(Ordering::SeqCst),
        clips_count: count,
        clips_dir: clips_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn start_clipboard_watch(app: AppHandle) -> Result<String, String> {
    if WATCHING.load(Ordering::SeqCst) {
        return Ok("Clipboard watch already running".into());
    }

    WATCHING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        clipboard_poll_loop(app);
    });

    Ok("Clipboard watch started".into())
}

#[tauri::command]
pub fn stop_clipboard_watch() -> Result<String, String> {
    WATCHING.store(false, Ordering::SeqCst);
    Ok("Clipboard watch stopped".into())
}

#[tauri::command]
pub fn save_clipboard_now(content: String) -> Result<ClipboardEvent, String> {
    save_clip_content(&content)
}

fn clipboard_poll_loop(app: AppHandle) {
    // Use arboard for native clipboard access (no subprocess overhead)
    let mut clipboard = match arboard::Clipboard::new() {
        Ok(cb) => cb,
        Err(e) => {
            log::error!("Failed to init clipboard: {}", e);
            WATCHING.store(false, Ordering::SeqCst);
            return;
        }
    };

    // Initialize with current clipboard content hash
    let mut last_hash = clipboard
        .get_text()
        .ok()
        .filter(|t| !t.is_empty())
        .map(|t| content_hash(&t))
        .unwrap_or_default();

    let mut last_image_hash = String::new();

    while WATCHING.load(Ordering::SeqCst) {
        // Check for text
        if let Ok(text) = clipboard.get_text() {
            if !text.is_empty() && text.len() >= MIN_LENGTH {
                let hash = content_hash(&text);
                if hash != last_hash {
                    last_hash = hash;
                    last_image_hash.clear();
                    if let Ok(event) = save_clip_content(&text) {
                        let _ = app.emit("clipboard-saved", &event);
                    }
                }
            }
        }

        // Check for image
        if let Ok(img) = clipboard.get_image() {
            if img.width > 0 && img.height > 0 {
                let hash = image_hash(&img);
                if hash != last_image_hash {
                    last_image_hash = hash;
                    last_hash.clear();
                    if let Ok(event) = save_clip_image(&img) {
                        let _ = app.emit("clipboard-saved", &event);
                    }
                }
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS));
    }
}

fn save_clip_content(content: &str) -> Result<ClipboardEvent, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized".into());
    }

    let now = chrono::Local::now();
    let date_str = now.format("%Y-%m-%d").to_string();
    let time_str = now.format("%H-%M-%S").to_string();

    // Create clips directory
    let clips_dir = sync_dir.join("clips").join(&date_str);
    std::fs::create_dir_all(&clips_dir).map_err(|e| e.to_string())?;

    // Generate title from first line
    let title: String = content
        .lines()
        .next()
        .unwrap_or("clip")
        .chars()
        .take(30)
        .collect::<String>()
        .trim()
        .to_string();

    let safe_title: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();

    let filename = format!("{}-{}.md", time_str, safe_title);
    let full_path = clips_dir.join(&filename);
    let rel_path = format!("clips/{}/{}", date_str, filename);

    // Write markdown
    let md = format!(
        "---\ndate: {}\nsource: clipboard\nchars: {}\n---\n\n{}\n",
        now.format("%Y-%m-%d %H:%M:%S"),
        content.len(),
        content
    );
    std::fs::write(&full_path, &md).map_err(|e| e.to_string())?;

    // Async git sync (don't block)
    let dir = sync_dir.clone();
    let msg = format!("clip: {}", title.chars().take(40).collect::<String>());
    std::thread::spawn(move || {
        let _ = git::commit_and_push(&dir, &msg);
    });

    let preview: String = content.chars().take(80).collect();

    Ok(ClipboardEvent {
        saved: true,
        path: rel_path,
        preview,
        timestamp: now.format("%H:%M:%S").to_string(),
    })
}

fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn image_hash(img: &arboard::ImageData) -> String {
    let mut hasher = Sha256::new();
    hasher.update(&(img.width as u32).to_le_bytes());
    hasher.update(&(img.height as u32).to_le_bytes());
    // Sample bytes for speed — hash first 8KB + last 8KB instead of full image
    let bytes = img.bytes.as_ref();
    let sample_len = 8192.min(bytes.len());
    hasher.update(&bytes[..sample_len]);
    if bytes.len() > sample_len {
        hasher.update(&bytes[bytes.len() - sample_len..]);
    }
    format!("{:x}", hasher.finalize())
}

fn save_clip_image(img: &arboard::ImageData) -> Result<ClipboardEvent, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized".into());
    }

    let now = chrono::Local::now();
    let date_str = now.format("%Y-%m-%d").to_string();
    let time_str = now.format("%H-%M-%S").to_string();

    let clips_dir = sync_dir.join("clips").join(&date_str);
    std::fs::create_dir_all(&clips_dir).map_err(|e| e.to_string())?;

    // Save PNG image
    let png_filename = format!("{}-screenshot.png", time_str);
    let png_path = clips_dir.join(&png_filename);

    let img_buf: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> =
        image::ImageBuffer::from_raw(img.width as u32, img.height as u32, img.bytes.to_vec())
            .ok_or("Failed to create image buffer")?;

    img_buf
        .save_with_format(&png_path, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to save PNG: {}", e))?;

    // Save companion markdown referencing the image
    let md_filename = format!("{}-screenshot.md", time_str);
    let md_path = clips_dir.join(&md_filename);
    let rel_path = format!("clips/{}/{}", date_str, md_filename);

    let md = format!(
        "---\ndate: {}\nsource: clipboard-image\nwidth: {}\nheight: {}\n---\n\n![screenshot]({})\n",
        now.format("%Y-%m-%d %H:%M:%S"),
        img.width,
        img.height,
        png_filename
    );
    std::fs::write(&md_path, &md).map_err(|e| e.to_string())?;

    // Async git sync
    let dir = sync_dir.clone();
    std::thread::spawn(move || {
        let _ = git::commit_and_push(&dir, "clip: screenshot");
    });

    let preview = format!("Screenshot {}x{}", img.width, img.height);

    Ok(ClipboardEvent {
        saved: true,
        path: rel_path,
        preview,
        timestamp: now.format("%H:%M:%S").to_string(),
    })
}
