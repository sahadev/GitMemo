use gitmemo_core::services;
use gitmemo_core::storage::{database, files};
use gitmemo_core::utils::datetime::record_timestamp_for_markdown;
use serde::Serialize;
use std::panic;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct SearchResultItem {
    pub source_type: String,
    pub title: String,
    pub file_path: String,
    pub snippet: String,
    pub date: String,
    #[serde(skip_serializing)]
    pub sort_ts: i64,
}

/// Run a closure, catching any panic and converting it to `Err(String)`.
fn catch<T>(f: impl FnOnce() -> Result<T, String> + panic::UnwindSafe) -> Result<T, String> {
    match panic::catch_unwind(f) {
        Ok(result) => result,
        Err(payload) => {
            let msg = if let Some(s) = payload.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = payload.downcast_ref::<String>() {
                s.clone()
            } else {
                "unknown internal error".to_string()
            };
            Err(format!("Internal error: {}", msg))
        }
    }
}

fn compute_activity_timestamp(sync_dir: &Path, rel_path: &str) -> (String, i64) {
    let full_path = sync_dir.join(rel_path);
    let content = std::fs::read_to_string(&full_path).unwrap_or_default();
    let modified_time = full_path
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .unwrap_or(std::time::UNIX_EPOCH);
    record_timestamp_for_markdown(&content, modified_time)
}

fn map_results(sync_dir: &Path, results: Vec<database::SearchResult>) -> Vec<SearchResultItem> {
    let mut mapped: Vec<SearchResultItem> = results
        .into_iter()
        .map(|r| {
            let (date, sort_ts) = compute_activity_timestamp(sync_dir, &r.file_path);
            SearchResultItem {
                source_type: r.source_type,
                title: r.title,
                file_path: r.file_path.clone(),
                snippet: r.snippet,
                date,
                sort_ts,
            }
        })
        .collect();
    mapped.sort_by(|a, b| b.sort_ts.cmp(&a.sort_ts));
    mapped
}

#[tauri::command]
pub async fn search_all(
    query: String,
    type_filter: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<SearchResultItem>, String> {
    tokio::task::spawn_blocking(move || search_all_sync(query, type_filter, limit))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn search_all_sync(
    query: String,
    type_filter: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<SearchResultItem>, String> {
    catch(move || {
        let sync_dir = files::sync_dir();
        if !sync_dir.exists() {
            return Err("GitMemo not initialized".into());
        }

        let filter = type_filter.as_deref().unwrap_or("all");
        let max = limit.unwrap_or(20);

        let results = services::search::search_smart(&sync_dir, &query, filter, max)
            .map_err(|e| e.to_string())?;

        Ok(map_results(&sync_dir, results))
    })
}

#[tauri::command]
pub async fn recent_conversations(
    limit: Option<usize>,
    days: Option<u32>,
) -> Result<Vec<SearchResultItem>, String> {
    tokio::task::spawn_blocking(move || recent_conversations_sync(limit, days))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn recent_conversations_sync(
    limit: Option<usize>,
    days: Option<u32>,
) -> Result<Vec<SearchResultItem>, String> {
    catch(move || {
        let sync_dir = files::sync_dir();
        if !sync_dir.exists() {
            return Err("GitMemo not initialized".into());
        }

        let results = services::search::recent_with_full_rebuild(
            &sync_dir,
            limit.unwrap_or(20),
            days.unwrap_or(30),
        )
        .map_err(|e| e.to_string())?;

        Ok(map_results(&sync_dir, results))
    })
}

#[tauri::command]
pub async fn reindex() -> Result<u32, String> {
    tokio::task::spawn_blocking(reindex_sync)
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn reindex_sync() -> Result<u32, String> {
    catch(|| {
        let sync_dir = files::sync_dir();
        if !sync_dir.exists() {
            return Err("GitMemo not initialized".into());
        }

        services::search::rebuild_index(&sync_dir).map_err(|e| e.to_string())
    })
}

/// Fuzzy search files by name/title (not full-text content)
#[tauri::command]
pub async fn fuzzy_search_files(
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResultItem>, String> {
    tokio::task::spawn_blocking(move || fuzzy_search_files_sync(query, limit))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn fuzzy_search_files_sync(
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResultItem>, String> {
    catch(move || {
        let sync_dir = files::sync_dir();
        if !sync_dir.exists() {
            return Err("GitMemo not initialized".into());
        }

        let max = limit.unwrap_or(10);
        let query_lower = query.to_lowercase();
        let mut results: Vec<SearchResultItem> = Vec::new();

        for entry in walkdir::WalkDir::new(&sync_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
            .filter(|e| !e.path().to_string_lossy().contains(".metadata"))
        {
            let path = entry.path();
            let rel_path = path
                .strip_prefix(&sync_dir)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();
            let file_name = path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let title = std::fs::read_to_string(path)
                .ok()
                .and_then(|content| {
                    content
                        .lines()
                        .find(|l| l.starts_with("# "))
                        .map(|l| l.trim_start_matches("# ").to_string())
                })
                .unwrap_or_else(|| file_name.clone());

            let name_lower = file_name.to_lowercase();
            let title_lower = title.to_lowercase();

            if name_lower.contains(&query_lower) || title_lower.contains(&query_lower) {
                let source_type = if rel_path.starts_with("conversations") {
                    "conversation"
                } else if rel_path.starts_with("clips") {
                    "clip"
                } else if rel_path.starts_with("plans") {
                    "plan"
                } else if rel_path.starts_with("claude-config") {
                    "config"
                } else if rel_path.starts_with("imports") {
                    "import"
                } else {
                    "note"
                };

                let content = std::fs::read_to_string(path).unwrap_or_default();
                let (date, sort_ts) = path
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|modified| record_timestamp_for_markdown(&content, modified))
                    .unwrap_or_default();

                results.push(SearchResultItem {
                    source_type: source_type.to_string(),
                    title,
                    file_path: rel_path,
                    snippet: file_name,
                    date,
                    sort_ts,
                });
            }

            if results.len() >= max {
                break;
            }
        }

        results.sort_by(|a, b| b.sort_ts.cmp(&a.sort_ts));
        Ok(results)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    static HOME_ENV_LOCK: Mutex<()> = Mutex::new(());

    struct HomeOverride {
        original: Option<OsString>,
    }

    impl HomeOverride {
        fn set(path: &Path) -> Self {
            let original = std::env::var_os("HOME");
            std::env::set_var("HOME", path);
            Self { original }
        }
    }

    impl Drop for HomeOverride {
        fn drop(&mut self) {
            if let Some(original) = self.original.take() {
                std::env::set_var("HOME", original);
            } else {
                std::env::remove_var("HOME");
            }
        }
    }

    struct TempHome {
        path: PathBuf,
    }

    impl TempHome {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "gitmemo-desktop-search-test-{}-{}",
                std::process::id(),
                nonce
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempHome {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn desktop_search_reindex_and_query_note() {
        let _guard = HOME_ENV_LOCK.lock().unwrap();
        let home = TempHome::new();
        let _home = HomeOverride::set(home.path());
        let sync_dir = files::sync_dir();

        gitmemo_core::storage::files::create_directory_structure(&sync_dir).unwrap();
        gitmemo_core::storage::files::write_note(
            &sync_dir,
            "notes/scratch/desktop-search.md",
            "---\ndate: 2026-05-19T10:00:00+08:00\n---\n\n# Desktop Search\n\nneedle term\n",
        )
        .unwrap();

        let indexed = reindex_sync().unwrap();
        assert_eq!(indexed, 1);

        let results =
            search_all_sync("needle".to_string(), Some("all".to_string()), Some(10)).unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Desktop Search");
        assert_eq!(results[0].file_path, "notes/scratch/desktop-search.md");
    }

    #[test]
    fn search_results_are_sorted_newest_first() {
        let _guard = HOME_ENV_LOCK.lock().unwrap();
        let home = TempHome::new();
        let _home = HomeOverride::set(home.path());
        let sync_dir = files::sync_dir();

        gitmemo_core::storage::files::create_directory_structure(&sync_dir).unwrap();
        gitmemo_core::storage::files::write_note(
            &sync_dir,
            "notes/scratch/old-search.md",
            "---\ndate: 2026-05-01T10:00:00+08:00\n---\n\n# Old Search\n\nneedle sorted\n",
        )
        .unwrap();
        gitmemo_core::storage::files::write_note(
            &sync_dir,
            "notes/scratch/new-search.md",
            "---\ndate: 2026-05-20T10:00:00+08:00\n---\n\n# New Search\n\nneedle sorted\n",
        )
        .unwrap();

        let indexed = reindex_sync().unwrap();
        assert_eq!(indexed, 2);

        let results = search_all_sync(
            "needle sorted".to_string(),
            Some("all".to_string()),
            Some(10),
        )
        .unwrap();

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "New Search");
        assert_eq!(results[1].title, "Old Search");
    }
}
