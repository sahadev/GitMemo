use gitmemo_core::storage::{database, files};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SearchResultItem {
    pub source_type: String,
    pub title: String,
    pub file_path: String,
    pub snippet: String,
    pub date: String,
}

#[tauri::command]
pub fn search_all(
    query: String,
    type_filter: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<SearchResultItem>, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo 未初始化".into());
    }

    let db_path = sync_dir.join(".metadata").join("index.db");
    let conn = database::open_or_create(&db_path).map_err(|e| e.to_string())?;
    database::build_index(&conn, &sync_dir).map_err(|e| e.to_string())?;

    let filter = type_filter.as_deref().unwrap_or("all");
    let max = limit.unwrap_or(20);

    let results = database::search(&conn, &query, filter, max).map_err(|e| e.to_string())?;

    Ok(results
        .into_iter()
        .map(|r| SearchResultItem {
            source_type: r.source_type,
            title: r.title,
            file_path: r.file_path,
            snippet: r.snippet,
            date: r.date,
        })
        .collect())
}

#[tauri::command]
pub fn recent_conversations(limit: Option<usize>, days: Option<u32>) -> Result<Vec<SearchResultItem>, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo 未初始化".into());
    }

    let db_path = sync_dir.join(".metadata").join("index.db");
    let conn = database::open_or_create(&db_path).map_err(|e| e.to_string())?;
    database::build_index(&conn, &sync_dir).map_err(|e| e.to_string())?;

    let results =
        database::recent(&conn, limit.unwrap_or(20), days.unwrap_or(30)).map_err(|e| e.to_string())?;

    Ok(results
        .into_iter()
        .map(|r| SearchResultItem {
            source_type: r.source_type,
            title: r.title,
            file_path: r.file_path,
            snippet: r.snippet,
            date: r.date,
        })
        .collect())
}

#[tauri::command]
pub fn reindex() -> Result<u32, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo 未初始化".into());
    }

    let db_path = sync_dir.join(".metadata").join("index.db");
    if db_path.exists() {
        let _ = std::fs::remove_file(&db_path);
    }

    let conn = database::open_or_create(&db_path).map_err(|e| e.to_string())?;
    let count = database::build_index(&conn, &sync_dir).map_err(|e| e.to_string())?;
    Ok(count)
}

/// Fuzzy search files by name/title (not full-text content)
#[tauri::command]
pub fn fuzzy_search_files(query: String, limit: Option<usize>) -> Result<Vec<SearchResultItem>, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized".into());
    }

    let max = limit.unwrap_or(10);
    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchResultItem> = Vec::new();

    // Walk all .md files
    for entry in walkdir::WalkDir::new(&sync_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        .filter(|e| !e.path().to_string_lossy().contains(".metadata"))
    {
        let path = entry.path();
        let rel_path = path.strip_prefix(&sync_dir).unwrap_or(path).to_string_lossy().to_string();
        let file_name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();

        // Read first few lines to extract title
        let title = std::fs::read_to_string(path)
            .ok()
            .and_then(|content| {
                content.lines()
                    .find(|l| l.starts_with("# "))
                    .map(|l| l.trim_start_matches("# ").to_string())
            })
            .unwrap_or_else(|| file_name.clone());

        // Match against file name and title
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
            } else {
                "note"
            };

            let meta = path.metadata().ok();
            let date = meta
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Local> = t.into();
                    dt.format("%Y-%m-%d").to_string()
                })
                .unwrap_or_default();

            results.push(SearchResultItem {
                source_type: source_type.to_string(),
                title,
                file_path: rel_path,
                snippet: file_name,
                date,
            });
        }

        if results.len() >= max {
            break;
        }
    }

    Ok(results)
}
