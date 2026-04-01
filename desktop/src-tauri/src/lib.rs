mod commands;

use commands::{clipboard, import, notes, search, settings, stats};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // Notes
            notes::create_note,
            notes::append_daily,
            notes::create_manual,
            notes::read_file,
            notes::read_file_base64,
            notes::list_files,
            notes::update_note,
            notes::delete_note,
            // Search
            search::search_all,
            search::recent_conversations,
            search::reindex,
            search::fuzzy_search_files,
            // Stats
            stats::get_stats,
            stats::get_status,
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
            settings::get_settings,
            settings::set_autostart,
            settings::set_clipboard_autostart,
            settings::get_branch,
            settings::set_branch,
            settings::get_claude_integration_status,
            settings::setup_claude_integration,
            settings::remove_claude_integration,
        ])
        .setup(|app| {
            // Store app handle for background git sync events
            notes::set_app_handle(app.handle().clone());

            // --- Pull latest from remote on startup ---
            std::thread::spawn(|| {
                let sync_dir = gitmemo_core::storage::files::sync_dir();
                if sync_dir.exists() {
                    let _ = gitmemo_core::storage::git::pull(&sync_dir);
                }
            });

            // --- System Tray ---
            let open_i = MenuItem::with_id(app, "open", "Open GitMemo", true, None::<&str>)?;
            let sync_i = MenuItem::with_id(app, "sync", "Sync to Git", true, None::<&str>)?;
            let clip_i =
                MenuItem::with_id(app, "clipboard", "Start Clipboard", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&open_i, &sync_i, &clip_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("GitMemo")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "sync" => {
                        let app_handle = app.clone();
                        std::thread::spawn(move || {
                            let sync_dir = gitmemo_core::storage::files::sync_dir();
                            let _ = gitmemo_core::storage::git::commit_and_push(
                                &sync_dir,
                                "auto: sync from tray",
                            );
                            let _ = app_handle.emit("tray-sync-done", "synced");
                        });
                    }
                    "clipboard" => {
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
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // --- Close → Hide (keep tray alive) ---
            let app_handle = app.handle().clone();
            if let Some(w) = app.get_webview_window("main") {
                w.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                });
            }

            // --- Global Shortcut: Cmd+Shift+G → show + search ---
            let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyG);
            let app_handle = app.handle().clone();
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                if let Some(w) = app_handle.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                    let _ = app_handle.emit("global-shortcut-search", ());
                }
            })?;

            // --- Global Shortcut: Cmd+Shift+Space → toggle Quick Paste ---
            let qp_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);
            let qp_handle = app.handle().clone();
            app.global_shortcut().on_shortcut(qp_shortcut, move |_app, _shortcut, _event| {
                if let Some(w) = qp_handle.get_webview_window("quick-paste") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = w.center();
                        let _ = w.show();
                        let _ = w.set_focus();
                        let _ = qp_handle.emit("quick-paste-show", ());
                    }
                }
            })?;

            // --- Auto-start clipboard if configured ---
            let app_handle_clip = app.handle().clone();
            std::thread::spawn(move || {
                // Small delay to let the app fully initialize
                std::thread::sleep(std::time::Duration::from_secs(1));
                if settings::should_autostart_clipboard() {
                    let _ = clipboard::start_clipboard_watch(app_handle_clip);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
