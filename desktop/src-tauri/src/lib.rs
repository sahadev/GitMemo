mod commands;

use commands::{clipboard, import, notes, search, stats};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            // Notes
            notes::create_note,
            notes::append_daily,
            notes::create_manual,
            notes::read_file,
            notes::list_files,
            // Search
            search::search_all,
            search::recent_conversations,
            search::reindex,
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
        ])
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
