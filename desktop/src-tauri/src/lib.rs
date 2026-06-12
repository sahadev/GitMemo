mod commands;
mod platform;

use commands::{
    clipboard, crash_log, favorites, import, init, local_editor, mobile_git_spike, notes,
    notifications, search, settings, stats, sync_log, vault, watcher,
};
#[cfg(desktop)]
use gitmemo_core::services::sync::StartupMode;
use serde::Serialize;
#[cfg(target_os = "macos")]
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Listener, WebviewWindow,
};
#[cfg(target_os = "macos")]
use tauri::RunEvent;
#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;

#[derive(Default)]
struct PendingExternalOpen(Mutex<PendingExternalOpenState>);

#[derive(Default)]
struct PendingExternalOpenState {
    frontend_ready: bool,
    paths: Vec<String>,
}

#[cfg(desktop)]
fn versioned_entry_url(entry: &str, version: &str) -> std::path::PathBuf {
    format!("{entry}?v={version}").into()
}

#[cfg(desktop)]
fn version_desktop_window_entry_urls(config: &mut tauri::Config) {
    let version = env!("CARGO_PKG_VERSION");

    for window in &mut config.app.windows {
        let entry = match window.label.as_str() {
            "main" => Some("index.html"),
            "quick-paste" => Some("/quick-paste.html"),
            _ => None,
        };

        if let Some(entry) = entry {
            window.url = tauri::WebviewUrl::App(versioned_entry_url(entry, version));
        }
    }
}

#[cfg(target_os = "macos")]
const WEBVIEW_CACHE_IDENTIFIERS: [&str; 2] = ["dev.gitmemo.desktop", "gitmemo-desktop"];

#[cfg(target_os = "macos")]
fn remove_path_if_exists(path: &Path) -> bool {
    if !path.exists() {
        return true;
    }
    let result = if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
    if let Err(e) = result {
        eprintln!(
            "Failed to remove WebView cache path {}: {e}",
            path.display()
        );
        false
    } else {
        true
    }
}

#[cfg(target_os = "macos")]
fn clear_webview_cache(home: &Path) -> bool {
    let mut ok = true;
    for identifier in WEBVIEW_CACHE_IDENTIFIERS {
        ok &= remove_path_if_exists(&home.join("Library").join("Caches").join(identifier));
        ok &= remove_path_if_exists(
            &home
                .join("Library")
                .join("HTTPStorages")
                .join(format!("{identifier}.binarycookies")),
        );
    }
    ok
}

#[cfg(target_os = "macos")]
fn clear_webview_cache_after_update() {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return;
    };
    let state_dir = home
        .join("Library")
        .join("Application Support")
        .join("dev.gitmemo.desktop");
    let version_file = state_dir.join("last_webview_cache_version");
    let current_version = env!("CARGO_PKG_VERSION");
    let previous_version = std::fs::read_to_string(&version_file)
        .ok()
        .map(|s| s.trim().to_string());

    if previous_version.as_deref() != Some(current_version) {
        if !clear_webview_cache(&home) {
            return;
        }
    }

    if let Err(e) = std::fs::create_dir_all(&state_dir) {
        eprintln!(
            "Failed to create GitMemo app state dir {}: {e}",
            state_dir.display()
        );
        return;
    }
    if let Err(e) = std::fs::write(&version_file, current_version) {
        eprintln!(
            "Failed to write GitMemo WebKit cache version {}: {e}",
            version_file.display()
        );
    }
}

#[cfg(desktop)]
pub(crate) fn show_main_window(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

#[cfg(desktop)]
pub(crate) fn show_main_window_from_app(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        show_main_window(&window);
    }
}

#[cfg(target_os = "macos")]
fn emit_external_open(app: &AppHandle, file_path: String) {
    let _ = app.emit("system-open-file", file_path);
}

fn take_pending_external_open(pending: &State<PendingExternalOpen>) -> Vec<String> {
    let mut state = pending.0.lock().unwrap();
    state.frontend_ready = true;
    std::mem::take(&mut state.paths)
}

#[cfg(target_os = "macos")]
fn emit_or_queue_external_open(
    app: &AppHandle,
    pending: &State<PendingExternalOpen>,
    file_path: String,
) {
    let path_to_emit = {
        let mut state = pending.0.lock().unwrap();
        if state.frontend_ready {
            Some(file_path)
        } else {
            state.paths.push(file_path);
            None
        }
    };

    if let Some(path) = path_to_emit {
        emit_external_open(app, path);
    }
}

#[tauri::command]
fn app_ready(pending: State<PendingExternalOpen>) -> Vec<String> {
    take_pending_external_open(&pending)
}

#[tauri::command]
fn get_runtime_platform() -> &'static str {
    platform::runtime_family()
}

#[derive(Serialize)]
struct RuntimeInfo {
    family: &'static str,
    os: &'static str,
}

#[tauri::command]
fn get_runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        family: platform::runtime_family(),
        os: platform::runtime_os(),
    }
}

#[cfg(desktop)]
#[tauri::command]
fn print_current_window(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

#[cfg(mobile)]
#[tauri::command]
fn print_current_window() -> Result<(), String> {
    Err("Printing is only available on desktop".into())
}

#[cfg(mobile)]
fn configure_mobile_environment(app: &tauri::App) {
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&app_data_dir);
        std::env::set_var("HOME", app_data_dir);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install panic hook FIRST — catches any panic from here on
    crash_log::install_panic_hook();

    #[cfg(target_os = "macos")]
    clear_webview_cache_after_update();

    let builder = tauri::Builder::default()
        .manage(PendingExternalOpen::default())
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("gitmemo".into()),
                    },
                ))
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    let mut context = tauri::generate_context!();
    #[cfg(desktop)]
    version_desktop_window_entry_urls(context.config_mut());

    let app = builder
        .invoke_handler(tauri::generate_handler![
            // Notes
            notes::create_note,
            notes::create_manual,
            notes::read_file,
            notes::read_file_base64,
            notes::save_image_to_local,
            notes::resolve_sync_path,
            notes::list_files,
            notes::list_files_page,
            notes::sync_external_plans,
            notes::update_note,
            notes::delete_note,
            notes::delete_clip,
            notes::delete_clips,
            notes::delete_plan,
            notes::save_pasted_attachment,
            // Favorites
            favorites::list_favorites,
            favorites::get_favorite_status,
            favorites::set_favorite,
            favorites::read_favorite_content,
            // Search
            search::search_all,
            search::recent_conversations,
            search::reindex,
            search::fuzzy_search_files,
            // Stats
            stats::get_stats,
            stats::get_status,
            stats::get_recent_activity,
            stats::get_review_item,
            // Clipboard
            clipboard::get_clipboard_status,
            clipboard::start_clipboard_watch,
            clipboard::stop_clipboard_watch,
            clipboard::save_clipboard_now,
            // Import (drag-drop)
            import::import_files,
            // Git sync
            notes::sync_to_git,
            // Settings
            settings::get_app_meta,
            settings::get_cli_status,
            settings::get_settings,
            settings::set_autostart,
            settings::set_clipboard_autostart,
            settings::set_control_copy_paste,
            settings::set_sensitive_clipboard_action,
            settings::set_vault_enabled,
            settings::set_import_file_size_limit_kb,
            settings::set_shortcuts,
            settings::set_proxy,
            settings::set_language,
            settings::get_branch,
            settings::set_branch,
            settings::set_remote,
            settings::test_remote_sync,
            local_editor::get_editor_data_roots,
            local_editor::classify_external_open_target,
            local_editor::list_external_files,
            local_editor::open_external_file,
            local_editor::save_external_file,
            local_editor::remove_external_file,
            local_editor::clear_external_files,
            local_editor::clear_missing_external_files,
            local_editor::reveal_external_file_in_finder,
            local_editor::import_external_file_to_anonymous,
            local_editor::list_editor_directory,
            local_editor::read_editor_home_file,
            local_editor::resolve_editor_file_abs,
            local_editor::create_editor_file,
            local_editor::write_editor_file,
            local_editor::delete_editor_file,
            local_editor::create_editor_directory,
            settings::get_ssh_public_key,
            settings::get_claude_integration_status,
            settings::setup_claude_integration,
            settings::update_claude_skills,
            settings::remove_claude_integration,
            settings::get_cursor_integration_status,
            settings::setup_cursor_integration,
            settings::update_cursor_skills,
            settings::remove_cursor_integration,
            // Init (setup wizard)
            init::scan_ssh_keys,
            init::generate_ssh_key,
            init::init_gitmemo,
            init::sync_remote_init,
            // Mobile Git spike
            mobile_git_spike::mobile_git_spike_sync,
            mobile_git_spike::mobile_git_diagnose_saved_remote,
            // Watcher
            watcher::restart_file_watcher,
            watcher::watch_external_file,
            watcher::stop_external_file_watcher,
            // Capture
            init::capture_conversations,
            // Crash logs
            crash_log::get_crash_logs,
            crash_log::clear_crash_logs,
            // Sync logs
            sync_log::get_sync_logs,
            sync_log::clear_sync_logs,
            vault::get_vault_status,
            vault::init_vault,
            vault::unlock_vault,
            vault::lock_vault,
            vault::list_vault_entries,
            vault::reveal_vault_entry,
            vault::delete_vault_entry,
            get_runtime_platform,
            get_runtime_info,
            print_current_window,
            app_ready,
            notifications::send_desktop_notification,
        ])
        .setup(|app| {
            #[cfg(mobile)]
            configure_mobile_environment(app);

            // Store app handle for background git sync events
            notes::set_app_handle(app.handle().clone());

            // Start file system watcher
            watcher::start_file_watcher(app.handle().clone());

            // Apply proxy environment variables before any network operations
            #[cfg(desktop)]
            settings::apply_proxy_env();

            // Pull latest from remote on startup (with health check), then auto-capture
            #[cfg(desktop)]
            {
                std::thread::spawn(|| {
                    let sync_dir = gitmemo_core::storage::files::sync_dir();
                    if sync_dir.exists() {
                        let _ = gitmemo_core::services::startup::run_startup(
                            &sync_dir,
                            StartupMode::Desktop,
                        );
                    }
                });
            }

            // ── Desktop-only setup ──
            #[cfg(desktop)]
            {
                setup_desktop(app)?;
            }

            Ok(())
        })
        .build(context)
        .unwrap_or_else(|e| {
            let msg = format!("Tauri application failed to build: {e}");
            log::error!("{}", msg);
            crash_log::write_crash_log("startup_error", &msg);
            panic!("{}", msg);
        });

    app.run(move |_app_handle, _event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = _event {
            show_main_window_from_app(_app_handle);
        }

        #[cfg(target_os = "macos")]
        if let RunEvent::Opened { urls } = _event {
            show_main_window_from_app(_app_handle);
            let pending = _app_handle.state::<PendingExternalOpen>();
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    let path = path.to_string_lossy().into_owned();
                    emit_or_queue_external_open(_app_handle, &pending, path);
                }
            }
        }
    });
}

#[cfg(desktop)]
fn setup_desktop(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // --- System Tray ---
    let open_i = MenuItem::with_id(app, "open", "Open GitMemo", true, None::<&str>)?;
    let sync_i = MenuItem::with_id(app, "sync", "Sync to Git", true, None::<&str>)?;
    let capture_i = MenuItem::with_id(app, "capture", "Capture Conversations", true, None::<&str>)?;
    let clip_label = if settings::should_autostart_clipboard() {
        "Clipboard: ON"
    } else {
        "Clipboard: OFF"
    };
    let clip_i = MenuItem::with_id(app, "clipboard", clip_label, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_i, &sync_i, &capture_i, &clip_i, &quit_i])?;

    let clip_menu_item = clip_i.clone();
    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("GitMemo")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => {
                show_main_window_from_app(app);
            }
            "sync" => {
                let app_handle = app.clone();
                std::thread::spawn(move || {
                    let _ = app_handle.emit("git-sync-start", ());
                    let payload = match notes::sync_to_git_blocking() {
                        Ok(message) => notes::GitSyncEvent { ok: true, message },
                        Err(message) => notes::GitSyncEvent { ok: false, message },
                    };
                    let _ = app_handle.emit("git-sync-end", &payload);
                });
            }
            "capture" => {
                let app_handle = app.clone();
                std::thread::spawn(move || {
                    let _ = app_handle.emit("git-sync-start", ());
                    let payload = match init::capture_conversations_sync() {
                        Ok(r) => notes::GitSyncEvent {
                            ok: true,
                            message: format!(
                                "{} new, {} updated",
                                r.new_sessions, r.updated_sessions
                            ),
                        },
                        Err(msg) => notes::GitSyncEvent {
                            ok: false,
                            message: msg,
                        },
                    };
                    let _ = app_handle.emit("git-sync-end", &payload);
                });
            }
            "clipboard" => {
                if clipboard::is_watching() {
                    let _ = clipboard::stop_clipboard_watch(app.clone());
                } else {
                    let _ = clipboard::start_clipboard_watch(app.clone());
                }
                let label = if clipboard::is_watching() {
                    "Clipboard: ON"
                } else {
                    "Clipboard: OFF"
                };
                let _ = clip_menu_item.set_text(label);
                let _ = app.emit("tray-toggle-clipboard", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        show_main_window(&w);
                    }
                }
            }
        })
        .build(app)?;

    // --- Keep tray clipboard label in sync with actual state ---
    let clip_item_for_listen = clip_i.clone();
    app.listen("tray-clipboard-update", move |_event| {
        let label = if clipboard::is_watching() {
            "Clipboard: ON"
        } else {
            "Clipboard: OFF"
        };
        let _ = clip_item_for_listen.set_text(label);
    });

    // --- Close → Hide (keep tray alive) ---
    let app_handle = app.handle().clone();
    if let Some(w) = app.get_webview_window("main") {
        let close_app_handle = app_handle.clone();
        w.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Some(win) = close_app_handle.get_webview_window("main") {
                    let _ = win.hide();
                }
            }
        });
    }

    // --- Global Shortcut: configurable show + search ---
    if let Err(e) = settings::register_global_shortcuts(app.handle()) {
        eprintln!("Failed to register global shortcuts: {e}");
    }

    // --- Auto-start clipboard if configured ---
    let app_handle_clip = app.handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(1));
        if settings::should_autostart_clipboard() {
            let _ = clipboard::start_clipboard_watch(app_handle_clip);
        }
    });

    Ok(())
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;

    #[test]
    fn desktop_entry_urls_include_the_app_version() {
        let mut config = tauri::Config::default();
        config.app.windows = vec![
            tauri::utils::config::WindowConfig {
                label: "main".into(),
                ..Default::default()
            },
            tauri::utils::config::WindowConfig {
                label: "quick-paste".into(),
                ..Default::default()
            },
        ];

        version_desktop_window_entry_urls(&mut config);

        assert_eq!(
            config.app.windows[0].url.to_string(),
            format!("index.html?v={}", env!("CARGO_PKG_VERSION"))
        );
        assert_eq!(
            config.app.windows[1].url.to_string(),
            format!("/quick-paste.html?v={}", env!("CARGO_PKG_VERSION"))
        );
    }
}
