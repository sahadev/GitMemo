use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;

static WATCHING: AtomicBool = AtomicBool::new(false);

pub fn is_watching() -> bool {
    WATCHING.load(Ordering::SeqCst)
}

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

// ── get_clipboard_status — works on all platforms ──

#[tauri::command]
pub fn get_clipboard_status() -> Result<ClipboardStatus, String> {
    let sync_dir = gitmemo_core::storage::files::sync_dir();
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

// ── save_clipboard_now — works on all platforms (text only) ──

#[tauri::command]
pub fn save_clipboard_now(content: String) -> Result<ClipboardEvent, String> {
    save_clip_content(&content)
}

// ── Desktop: full clipboard polling with arboard/image ──

#[cfg(desktop)]
#[tauri::command]
pub fn start_clipboard_watch(app: tauri::AppHandle) -> Result<String, String> {
    let sync_dir = gitmemo_core::storage::files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized. Run `gitmemo init` first.".into());
    }
    if WATCHING.load(Ordering::SeqCst) {
        return Ok("Clipboard watch already running".into());
    }
    WATCHING.store(true, Ordering::SeqCst);
    let _ = app.emit("tray-clipboard-update", ());
    std::thread::spawn(move || {
        desktop_poll::clipboard_poll_loop(app);
    });
    Ok("Clipboard watch started".into())
}

#[cfg(desktop)]
#[tauri::command]
pub fn stop_clipboard_watch(app: tauri::AppHandle) -> Result<String, String> {
    WATCHING.store(false, Ordering::SeqCst);
    let _ = app.emit("tray-clipboard-update", ());
    Ok("Clipboard watch stopped".into())
}

// ── Mobile stubs ──

#[cfg(not(desktop))]
#[tauri::command]
pub fn start_clipboard_watch(_app: tauri::AppHandle) -> Result<String, String> {
    Err("Background clipboard monitoring is not available on mobile".into())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn stop_clipboard_watch(_app: tauri::AppHandle) -> Result<String, String> {
    Ok("Not running".into())
}

// ── Shared text clip saving (no arboard/image dependency) ──

fn local_timestamp(now: &chrono::DateTime<chrono::Local>) -> String {
    now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

pub(crate) fn save_clip_content(content: &str) -> Result<ClipboardEvent, String> {
    use gitmemo_core::storage::{files, git};

    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized".into());
    }

    let now = chrono::Local::now();
    let date_str = now.format("%Y-%m-%d").to_string();
    let time_str = now.format("%H-%M-%S").to_string();

    let clips_dir = sync_dir.join("clips").join(&date_str);
    std::fs::create_dir_all(&clips_dir).map_err(|e| e.to_string())?;

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

    let md = format!(
        "---\ndate: {}\nsource: clipboard\nchars: {}\n---\n\n{}\n",
        local_timestamp(&now),
        content.len(),
        content
    );
    std::fs::write(&full_path, &md).map_err(|e| e.to_string())?;

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

// ── Desktop polling internals (arboard, image, dispatch2) ──

#[cfg(desktop)]
pub(crate) mod desktop_poll {
    use super::*;
    use gitmemo_core::storage::{files, git};
    use sha2::{Digest, Sha256};
    use std::path::Path;
    use std::sync::atomic::Ordering;
    #[cfg(target_os = "macos")]
    use std::sync::{Arc, Mutex};
    use tauri::{AppHandle, Emitter};

    use super::super::import;

    const MIN_LENGTH: usize = 10;
    const POLL_INTERVAL_MS: u64 = 300;

    fn local_timestamp(now: &chrono::DateTime<chrono::Local>) -> String {
        now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
    }

    enum PendingClip {
        Text(String),
        Files(Vec<String>),
        Image { width: usize, height: usize, bytes: Vec<u8> },
    }

    fn is_redundant_image_data_url(text: &str) -> bool {
        let t = text.trim_start();
        t.starts_with("data:image/") && t.contains(";base64,")
    }

    fn clipboard_file_paths(text: &str) -> Vec<String> {
        let mut paths = Vec::new();
        for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
            if let Some(url) = line.strip_prefix("file://") {
                let candidate = format!("file://{}", url);
                if let Ok(parsed) = url::Url::parse(&candidate) {
                    if let Ok(path) = parsed.to_file_path() {
                        if path.exists() {
                            paths.push(path.to_string_lossy().to_string());
                            continue;
                        }
                    }
                }
            }
            let path = Path::new(line);
            if path.is_absolute() && path.exists() {
                paths.push(path.to_string_lossy().to_string());
            }
        }
        paths.sort();
        paths.dedup();
        paths
    }

    fn collect_pending_clips(
        clipboard: &mut arboard::Clipboard,
        last_text_hash: &mut String,
        last_image_hash: &mut String,
    ) -> Vec<PendingClip> {
        let mut pending = Vec::new();
        let img_result = clipboard.get_image();
        let has_raster_image = matches!(&img_result, Ok(img) if img.width > 0 && img.height > 0);

        if let Ok(text) = clipboard.get_text() {
            if !text.is_empty() {
                let hash = content_hash(&text);
                if hash != *last_text_hash {
                    if has_raster_image && is_redundant_image_data_url(&text) {
                        *last_text_hash = hash;
                    } else {
                        let file_paths = clipboard_file_paths(&text);
                        if !file_paths.is_empty() {
                            *last_text_hash = hash;
                            pending.push(PendingClip::Files(file_paths));
                        } else if text.len() >= MIN_LENGTH {
                            *last_text_hash = hash;
                            pending.push(PendingClip::Text(text));
                        }
                    }
                }
            }
        }

        if let Ok(img) = img_result {
            if img.width > 0 && img.height > 0 {
                let hash = image_hash(&img);
                if hash != *last_image_hash {
                    *last_image_hash = hash;
                    pending.push(PendingClip::Image {
                        width: img.width,
                        height: img.height,
                        bytes: img.bytes.to_vec(),
                    });
                }
            }
        }

        pending
    }

    fn flush_pending_clips(pending: Vec<PendingClip>) -> Vec<ClipboardEvent> {
        let mut events = Vec::new();
        for item in pending {
            match item {
                PendingClip::Text(text) => {
                    if let Ok(event) = save_clip_content(&text) {
                        events.push(event);
                    }
                }
                PendingClip::Files(paths) => {
                    if let Ok(result) = import::import_paths(paths) {
                        if let Some(first) = result.imported.first() {
                            let now = chrono::Local::now();
                            let preview = if result.imported.len() == 1 {
                                format!("Imported {}", first.original_name)
                            } else {
                                format!("Imported {} files", result.imported.len())
                            };
                            events.push(ClipboardEvent {
                                saved: true,
                                path: first.dest_path.clone(),
                                preview,
                                timestamp: now.format("%H:%M:%S").to_string(),
                            });
                        }
                    }
                }
                PendingClip::Image { width, height, bytes } => {
                    match save_clip_image_from_rgba(width, height, bytes) {
                        Ok(event) => events.push(event),
                        Err(e) => log::warn!("clipboard image save skipped: {}", e),
                    }
                }
            }
        }
        events
    }

    pub fn clipboard_poll_loop(app: AppHandle) {
        #[cfg(target_os = "macos")]
        {
            let state = Arc::new(Mutex::new((String::new(), String::new())));
            dispatch2::run_on_main(|_mtm| {
                let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
                let (ref mut last_text_hash, _) = *guard;
                let mut clipboard = match arboard::Clipboard::new() {
                    Ok(cb) => cb,
                    Err(e) => { log::error!("Failed to init clipboard: {}", e); return; }
                };
                if let Ok(t) = clipboard.get_text() {
                    if !t.is_empty() { *last_text_hash = content_hash(&t); }
                }
            });
            while WATCHING.load(Ordering::SeqCst) {
                let state_c = Arc::clone(&state);
                let events = dispatch2::run_on_main(move |_mtm| {
                    let mut guard = state_c.lock().unwrap_or_else(|e| e.into_inner());
                    let (ref mut last_text_hash, ref mut last_image_hash) = *guard;
                    let mut clipboard = match arboard::Clipboard::new() {
                        Ok(cb) => cb,
                        Err(e) => { log::error!("Failed to init clipboard: {}", e); return Vec::new(); }
                    };
                    collect_pending_clips(&mut clipboard, last_text_hash, last_image_hash)
                });
                let events = flush_pending_clips(events);
                for event in events { let _ = app.emit("clipboard-saved", &event); }
                std::thread::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS));
            }
            return;
        }

        #[cfg(not(target_os = "macos"))]
        {
            let mut clipboard = match arboard::Clipboard::new() {
                Ok(cb) => cb,
                Err(e) => { log::error!("Failed to init clipboard: {}", e); WATCHING.store(false, Ordering::SeqCst); return; }
            };
            let mut last_text_hash = clipboard.get_text().ok().filter(|t| !t.is_empty()).map(|t| content_hash(&t)).unwrap_or_default();
            let mut last_image_hash = String::new();
            while WATCHING.load(Ordering::SeqCst) {
                let pending = collect_pending_clips(&mut clipboard, &mut last_text_hash, &mut last_image_hash);
                for event in flush_pending_clips(pending) { let _ = app.emit("clipboard-saved", &event); }
                std::thread::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS));
            }
        }
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
        let bytes = img.bytes.as_ref();
        let sample_len = 8192.min(bytes.len());
        hasher.update(&bytes[..sample_len]);
        if bytes.len() > sample_len { hasher.update(&bytes[bytes.len() - sample_len..]); }
        format!("{:x}", hasher.finalize())
    }

    const MAX_CLIPBOARD_IMAGE_PIXELS: u64 = 25_000_000;

    fn save_clip_image_from_rgba(width: usize, height: usize, bytes: Vec<u8>) -> Result<ClipboardEvent, String> {
        let sync_dir = files::sync_dir();
        if !sync_dir.exists() { return Err("GitMemo not initialized".into()); }

        let w = width as u64;
        let h = height as u64;
        let pixels = w.checked_mul(h).ok_or("Invalid image dimensions")?;
        if pixels == 0 { return Err("Empty image".into()); }
        if pixels > MAX_CLIPBOARD_IMAGE_PIXELS {
            return Err(format!("Image too large ({}x{}), max {} pixels", width, height, MAX_CLIPBOARD_IMAGE_PIXELS));
        }
        let expected_len = (pixels as usize).checked_mul(4).ok_or("Image buffer size overflow")?;
        if bytes.len() != expected_len {
            return Err(format!("Bad RGBA size: got {} bytes, need {} for {}x{}", bytes.len(), expected_len, width, height));
        }

        let w32 = u32::try_from(width).map_err(|_| "Width too large")?;
        let h32 = u32::try_from(height).map_err(|_| "Height too large")?;

        let now = chrono::Local::now();
        let date_str = now.format("%Y-%m-%d").to_string();
        let time_str = now.format("%H-%M-%S").to_string();

        let clips_dir = sync_dir.join("clips").join(&date_str);
        std::fs::create_dir_all(&clips_dir).map_err(|e| e.to_string())?;

        let png_filename = format!("{}-screenshot.png", time_str);
        let png_path = clips_dir.join(&png_filename);

        let img_buf: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> =
            image::ImageBuffer::from_raw(w32, h32, bytes).ok_or("Failed to create image buffer")?;
        img_buf.save_with_format(&png_path, image::ImageFormat::Png)
            .map_err(|e| format!("Failed to save PNG: {}", e))?;

        let md_filename = format!("{}-screenshot.md", time_str);
        let md_path = clips_dir.join(&md_filename);
        let rel_path = format!("clips/{}/{}", date_str, md_filename);

        let md = format!(
            "---\ndate: {}\nsource: clipboard-image\nwidth: {}\nheight: {}\n---\n\n![screenshot]({})\n",
            local_timestamp(&now), width, height, png_filename
        );
        std::fs::write(&md_path, &md).map_err(|e| e.to_string())?;

        let dir = sync_dir.clone();
        std::thread::spawn(move || { let _ = git::commit_and_push(&dir, "clip: screenshot"); });

        Ok(ClipboardEvent {
            saved: true,
            path: rel_path,
            preview: format!("Screenshot {}x{}", width, height),
            timestamp: now.format("%H:%M:%S").to_string(),
        })
    }
}
