use crate::utils::datetime::{frontmatter_record_datetime_raw, record_timestamp_for_markdown};
use anyhow::Result;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub struct SearchResult {
    pub source_type: String, // "conversation" or "note"
    pub title: String,
    pub file_path: String,
    pub snippet: String,
    pub date: String,
}

pub struct DocumentListItem {
    pub file_path: String,
    pub activity_ts: i64,
}

pub struct DocumentListPage {
    pub items: Vec<DocumentListItem>,
    pub total: usize,
}

pub struct Stats {
    pub conversation_count: u32,
    pub note_daily_count: u32,
    pub note_manual_count: u32,
    pub note_scratch_count: u32,
}

pub fn open_or_create(db_path: &Path) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(db_path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS documents (
            id          TEXT PRIMARY KEY,
            file_path   TEXT NOT NULL UNIQUE,
            source_type TEXT NOT NULL,
            title       TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            activity_at TEXT NOT NULL DEFAULT '',
            activity_ts INTEGER NOT NULL DEFAULT 0,
            file_mtime_ms INTEGER NOT NULL DEFAULT 0,
            file_size INTEGER NOT NULL DEFAULT 0,
            content_hash TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(source_type);
        CREATE INDEX IF NOT EXISTS idx_docs_created ON documents(created_at);
        CREATE INDEX IF NOT EXISTS idx_docs_file_path ON documents(file_path);

        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
            doc_id,
            title,
            content,
            tokenize='unicode61'
        );

        CREATE TABLE IF NOT EXISTS metadata (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )?;
    let added_activity_at = ensure_column(
        conn,
        "documents",
        "activity_at",
        "ALTER TABLE documents ADD COLUMN activity_at TEXT NOT NULL DEFAULT ''",
    )?;
    let added_activity_ts = ensure_column(
        conn,
        "documents",
        "activity_ts",
        "ALTER TABLE documents ADD COLUMN activity_ts INTEGER NOT NULL DEFAULT 0",
    )?;
    let added_file_mtime_ms = ensure_column(
        conn,
        "documents",
        "file_mtime_ms",
        "ALTER TABLE documents ADD COLUMN file_mtime_ms INTEGER NOT NULL DEFAULT 0",
    )?;
    let added_file_size = ensure_column(
        conn,
        "documents",
        "file_size",
        "ALTER TABLE documents ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0",
    )?;
    if added_activity_at || added_activity_ts || added_file_mtime_ms || added_file_size {
        conn.execute("DELETE FROM metadata WHERE key = 'last_index_time'", [])?;
    }
    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_docs_activity ON documents(activity_ts);
        ",
    )?;
    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, alter_sql: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for name in columns {
        if name? == column {
            return Ok(false);
        }
    }
    conn.execute(alter_sql, [])?;
    Ok(true)
}

fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn system_time_millis(time: SystemTime) -> i64 {
    time.duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn file_metadata_snapshot(path: &Path) -> (SystemTime, i64, u64) {
    let meta = path.metadata().ok();
    let modified_time = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .unwrap_or(std::time::UNIX_EPOCH);
    let file_mtime_ms = system_time_millis(modified_time);
    let file_size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    (modified_time, file_mtime_ms, file_size)
}

/// Extract tags from frontmatter (supports "tags: a, b, c" and "tags: [a, b, c]")
#[allow(dead_code)]
fn frontmatter_tags(content: &str) -> String {
    if !content.starts_with("---") {
        return String::new();
    }
    let rest = &content[3..];
    let end = match rest.find("---") {
        Some(e) => e,
        None => return String::new(),
    };
    let fm = &rest[..end];
    for line in fm.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("tags:") {
            let val = val.trim();
            // Strip optional brackets
            let val = val.trim_start_matches('[').trim_end_matches(']');
            return val.to_string();
        }
    }
    String::new()
}

/// Index a single file into the database
pub fn index_file(
    conn: &Connection,
    file_path: &str,
    source_type: &str,
    title: &str,
    content: &str,
    date: &str,
) -> Result<()> {
    index_file_with_activity(
        conn,
        file_path,
        source_type,
        title,
        content,
        date,
        date,
        0,
        0,
        0,
    )
}

fn index_file_with_activity(
    conn: &Connection,
    file_path: &str,
    source_type: &str,
    title: &str,
    content: &str,
    date: &str,
    activity_at: &str,
    activity_ts: i64,
    file_mtime_ms: i64,
    file_size: u64,
) -> Result<()> {
    let hash = content_hash(content);
    let id = content_hash(file_path);

    // Check if already indexed with same hash
    let existing: Option<(String, String, i64, i64, u64)> = conn
        .query_row(
            "SELECT content_hash, activity_at, activity_ts, file_mtime_ms, file_size FROM documents WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .ok();

    if existing.as_ref().is_some_and(
        |(
            existing_hash,
            existing_activity_at,
            existing_activity_ts,
            existing_file_mtime_ms,
            existing_file_size,
        )| {
            existing_hash == &hash
                && existing_activity_at == activity_at
                && *existing_activity_ts == activity_ts
                && *existing_file_mtime_ms == file_mtime_ms
                && *existing_file_size == file_size
        },
    ) {
        return Ok(()); // No change
    }

    // Upsert document
    conn.execute(
        "INSERT OR REPLACE INTO documents (id, file_path, source_type, title, created_at, activity_at, activity_ts, file_mtime_ms, file_size, content_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, file_path, source_type, title, date, activity_at, activity_ts, file_mtime_ms, file_size, hash],
    )?;

    // Update FTS index
    conn.execute("DELETE FROM search_index WHERE doc_id = ?1", params![id])?;
    conn.execute(
        "INSERT INTO search_index (doc_id, title, content) VALUES (?1, ?2, ?3)",
        params![id, title, content],
    )?;

    Ok(())
}

fn skip_index_path(path: &Path) -> bool {
    let s = path.to_string_lossy();
    s.contains("/.git/")
        || s.contains("/.metadata/")
        || s.contains("\\.git\\")
        || s.contains("\\.metadata\\")
}

/// Subdirectory (relative to sync root) and FTS `source_type` for each tree.
const INDEX_ROOTS: &[(&str, &str)] = &[
    ("conversations", "conversation"),
    ("notes/daily", "note"),
    ("notes/manual", "note"),
    ("notes/scratch", "note"),
    ("notes/imports", "note"),
    ("clips", "clip"),
    ("plans", "plan"),
    ("claude-config", "config"),
    ("cursor-config", "config"),
    ("imports", "import"),
];

/// Build index from markdown files under known GitMemo subtrees (full-text search + MCP).
pub fn build_index(conn: &Connection, sync_dir: &Path) -> Result<u32> {
    let mut count = 0u32;
    let mut seen_paths = HashSet::new();

    for &(subdir, source_type) in INDEX_ROOTS {
        let dir = sync_dir.join(subdir);
        if !dir.exists() {
            continue;
        }

        for entry in walkdir::WalkDir::new(&dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
            .filter(|e| !skip_index_path(e.path()))
        {
            let path = entry.path();
            let content = std::fs::read_to_string(path)?;
            let (modified_time, file_mtime_ms, file_size) = file_metadata_snapshot(path);
            let (activity_at, activity_ts) = record_timestamp_for_markdown(&content, modified_time);

            let title = extract_title(path, &content);
            let date = extract_record_date(path, &content);

            let rel_path = path
                .strip_prefix(sync_dir)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");
            seen_paths.insert(rel_path.clone());

            index_file_with_activity(
                conn,
                &rel_path,
                source_type,
                &title,
                &content,
                &date,
                &activity_at,
                activity_ts,
                file_mtime_ms,
                file_size,
            )?;
            count += 1;
        }
    }

    let stale_docs: Vec<(String, String)> = {
        let mut stmt = conn.prepare("SELECT id, file_path FROM documents")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows.filter_map(|row| row.ok())
            .filter(|(_, file_path)| !seen_paths.contains(file_path))
            .collect()
    };

    for (id, _) in stale_docs {
        conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        conn.execute("DELETE FROM search_index WHERE doc_id = ?1", params![id])?;
    }

    set_last_index_time(conn)?;
    Ok(count)
}

fn get_last_index_time(conn: &Connection) -> Option<std::time::SystemTime> {
    conn.query_row(
        "SELECT value FROM metadata WHERE key = 'last_index_time'",
        [],
        |row| {
            let s: String = row.get(0)?;
            let epoch_secs: u64 = s.parse().unwrap_or(0);
            Ok(std::time::UNIX_EPOCH + std::time::Duration::from_secs(epoch_secs))
        },
    )
    .ok()
}

#[allow(dead_code)]
pub fn index_is_ready(conn: &Connection) -> Result<bool> {
    let exists: u32 = conn.query_row(
        "SELECT COUNT(*) FROM metadata WHERE key = 'last_index_time'",
        [],
        |row| row.get(0),
    )?;
    Ok(exists > 0)
}

fn set_last_index_time(conn: &Connection) -> Result<()> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    conn.execute(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_index_time', ?1)",
        params![now.to_string()],
    )?;
    Ok(())
}

/// Incremental index: only rebuild if any .md file is newer than the last index time.
pub fn build_index_if_needed(conn: &Connection, sync_dir: &Path) -> Result<u32> {
    let last_index = get_last_index_time(conn);

    let needs_rebuild = match last_index {
        None => true,
        Some(last_time) => INDEX_ROOTS.iter().any(|&(subdir, _)| {
            let dir = sync_dir.join(subdir);
            if !dir.exists() {
                return false;
            }
            walkdir::WalkDir::new(&dir)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
                .filter(|e| !skip_index_path(e.path()))
                .any(|e| {
                    e.metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .is_some_and(|mtime| mtime > last_time)
                })
        }),
    };

    if needs_rebuild {
        let count = build_index(conn, sync_dir)?;
        Ok(count)
    } else {
        Ok(0)
    }
}

fn source_type_for_folder(folder: &str) -> Option<&'static str> {
    if folder.starts_with("conversations") {
        Some("conversation")
    } else if folder.starts_with("clips") {
        Some("clip")
    } else if folder.starts_with("plans") {
        Some("plan")
    } else if folder.starts_with("claude-config") || folder.starts_with("cursor-config") {
        Some("config")
    } else if folder.starts_with("imports") {
        Some("import")
    } else if folder.starts_with("notes") {
        Some("note")
    } else {
        None
    }
}

#[allow(dead_code)]
fn source_type_for_rel_path(rel_path: &str) -> Option<&'static str> {
    if rel_path.starts_with("conversations/") {
        Some("conversation")
    } else if rel_path.starts_with("clips/") {
        Some("clip")
    } else if rel_path.starts_with("plans/") {
        Some("plan")
    } else if rel_path.starts_with("claude-config/") || rel_path.starts_with("cursor-config/") {
        Some("config")
    } else if rel_path.starts_with("imports/") {
        Some("import")
    } else if rel_path.starts_with("notes/") {
        Some("note")
    } else {
        None
    }
}

fn extract_title(path: &Path, content: &str) -> String {
    content
        .lines()
        .find(|l| l.starts_with("# "))
        .map(|l| l.trim_start_matches("# ").to_string())
        .unwrap_or_else(|| {
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
}

fn extract_record_date(path: &Path, content: &str) -> String {
    frontmatter_record_datetime_raw(content).unwrap_or_else(|| {
        path.file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .chars()
            .take(10)
            .collect()
    })
}

fn is_indexed_markdown(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()) == Some("md") && !skip_index_path(path)
}

fn collect_markdown_snapshots(
    sync_dir: &Path,
    folder: &str,
) -> Result<Vec<(String, PathBuf, i64, u64)>> {
    let target = sync_dir.join(folder);
    if !target.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(&target)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| is_indexed_markdown(e.path()))
    {
        let path = entry.path().to_path_buf();
        let rel_path = path
            .strip_prefix(sync_dir)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let (_, file_mtime_ms, file_size) = file_metadata_snapshot(&path);
        files.push((rel_path, path, file_mtime_ms, file_size));
    }
    Ok(files)
}

pub fn sync_index_folder(conn: &Connection, sync_dir: &Path, folder: &str) -> Result<()> {
    let index_was_ready = get_last_index_time(conn).is_some();
    let mut changed = false;
    let files = collect_markdown_snapshots(sync_dir, folder)?;
    let source_type = source_type_for_folder(folder);
    let folder_prefix = format!("{}/%", folder.trim_matches('/'));

    let existing_rows: Vec<(String, i64, u64)> = if let Some(source_type) = source_type {
        let mut stmt = conn.prepare(
            "SELECT file_path, file_mtime_ms, file_size
             FROM documents
             WHERE file_path LIKE ?1 AND source_type = ?2",
        )?;
        let rows = stmt.query_map(params![folder_prefix, source_type], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        rows.filter_map(|r| r.ok()).collect()
    } else {
        let mut stmt = conn.prepare(
            "SELECT file_path, file_mtime_ms, file_size
             FROM documents
             WHERE file_path LIKE ?1",
        )?;
        let rows = stmt.query_map(params![folder_prefix], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let existing: std::collections::HashMap<String, (i64, u64)> = existing_rows
        .into_iter()
        .map(|(path, mtime, size)| (path, (mtime, size)))
        .collect();
    let seen: HashSet<String> = files
        .iter()
        .map(|(rel_path, _, _, _)| rel_path.clone())
        .collect();

    for (rel_path, path, file_mtime_ms, file_size) in files {
        if existing
            .get(&rel_path)
            .is_some_and(|(known_mtime, known_size)| {
                *known_mtime == file_mtime_ms && *known_size == file_size
            })
        {
            continue;
        }
        let content = std::fs::read_to_string(&path)?;
        let modified_time = path
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .unwrap_or(std::time::UNIX_EPOCH);
        let Some(source_type) = source_type_for_rel_path(&rel_path) else {
            continue;
        };
        let (activity_at, activity_ts) = record_timestamp_for_markdown(&content, modified_time);
        let title = extract_title(&path, &content);
        let date = extract_record_date(&path, &content);
        index_file_with_activity(
            conn,
            &rel_path,
            source_type,
            &title,
            &content,
            &date,
            &activity_at,
            activity_ts,
            file_mtime_ms,
            file_size,
        )?;
        changed = true;
    }

    for rel_path in existing.keys() {
        if !seen.contains(rel_path) && remove_relative_file(conn, rel_path)? {
            changed = true;
        }
    }

    if changed && index_was_ready {
        set_last_index_time(conn)?;
    }

    Ok(())
}

#[allow(dead_code)]
pub fn index_relative_file(conn: &Connection, sync_dir: &Path, rel_path: &str) -> Result<bool> {
    let index_was_ready = get_last_index_time(conn).is_some();
    let Some(source_type) = source_type_for_rel_path(rel_path) else {
        return Ok(false);
    };
    let full_path = sync_dir.join(rel_path);
    if full_path.extension().and_then(|ext| ext.to_str()) != Some("md") {
        return Ok(false);
    }
    if !full_path.is_file() || skip_index_path(&full_path) {
        return Ok(false);
    }

    let content = std::fs::read_to_string(&full_path)?;
    let (modified_time, file_mtime_ms, file_size) = file_metadata_snapshot(&full_path);
    let (activity_at, activity_ts) = record_timestamp_for_markdown(&content, modified_time);
    let title = extract_title(&full_path, &content);
    let date = extract_record_date(&full_path, &content);

    index_file_with_activity(
        conn,
        rel_path,
        source_type,
        &title,
        &content,
        &date,
        &activity_at,
        activity_ts,
        file_mtime_ms,
        file_size,
    )?;
    if index_was_ready {
        set_last_index_time(conn)?;
    }
    Ok(true)
}

#[allow(dead_code)]
pub fn remove_relative_file(conn: &Connection, rel_path: &str) -> Result<bool> {
    let index_was_ready = get_last_index_time(conn).is_some();
    let id = content_hash(rel_path);
    let changed = conn.execute("DELETE FROM documents WHERE id = ?1", params![id.clone()])? > 0;
    conn.execute("DELETE FROM search_index WHERE doc_id = ?1", params![id])?;
    if changed && index_was_ready {
        set_last_index_time(conn)?;
    }
    Ok(changed)
}

pub fn list_documents_page(
    conn: &Connection,
    folder: &str,
    offset: usize,
    limit: usize,
) -> Result<DocumentListPage> {
    let folder_prefix = format!("{}/%", folder.trim_matches('/'));
    let source_type = source_type_for_folder(folder);
    let total_sql = if source_type.is_some() {
        "SELECT COUNT(*) FROM documents WHERE file_path LIKE ?1 AND source_type = ?2"
    } else {
        "SELECT COUNT(*) FROM documents WHERE file_path LIKE ?1"
    };
    let total: usize = if let Some(source_type) = source_type {
        conn.query_row(total_sql, params![folder_prefix, source_type], |row| {
            row.get(0)
        })?
    } else {
        conn.query_row(total_sql, params![folder_prefix], |row| row.get(0))?
    };
    let offset = offset.min(total);

    let list_sql = if source_type.is_some() {
        "SELECT file_path, activity_ts
         FROM documents
         WHERE file_path LIKE ?1 AND source_type = ?2
         ORDER BY activity_ts DESC, file_path ASC
         LIMIT ?3 OFFSET ?4"
    } else {
        "SELECT file_path, activity_ts
         FROM documents
         WHERE file_path LIKE ?1
         ORDER BY activity_ts DESC, file_path ASC
         LIMIT ?2 OFFSET ?3"
    };

    let items = if let Some(source_type) = source_type {
        let mut stmt = conn.prepare(list_sql)?;
        let rows = stmt.query_map(params![folder_prefix, source_type, limit, offset], |row| {
            Ok(DocumentListItem {
                file_path: row.get(0)?,
                activity_ts: row.get(1)?,
            })
        })?;
        rows.filter_map(|r| r.ok()).collect()
    } else {
        let mut stmt = conn.prepare(list_sql)?;
        let rows = stmt.query_map(params![folder_prefix, limit, offset], |row| {
            Ok(DocumentListItem {
                file_path: row.get(0)?,
                activity_ts: row.get(1)?,
            })
        })?;
        rows.filter_map(|r| r.ok()).collect()
    };

    Ok(DocumentListPage { items, total })
}

/// Full-text search
pub fn search(
    conn: &Connection,
    query: &str,
    type_filter: &str,
    limit: usize,
) -> Result<Vec<SearchResult>> {
    let sql = "SELECT d.source_type, d.title, d.file_path, snippet(search_index, 2, '**', '**', '...', 20) as snip, d.created_at
         FROM search_index si
         JOIN documents d ON d.id = si.doc_id
         WHERE search_index MATCH ?1 AND (?3 = 'all' OR d.source_type = ?3)
         ORDER BY rank
         LIMIT ?2";

    let mut stmt = conn.prepare(sql)?;
    let results = stmt
        .query_map(params![query, limit, type_filter], |row| {
            Ok(SearchResult {
                source_type: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                snippet: row.get(3)?,
                date: row.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

/// LIKE-based search fallback for CJK and other languages where FTS5 unicode61 tokenizer fails.
#[allow(dead_code)]
pub fn search_like(
    conn: &Connection,
    query: &str,
    type_filter: &str,
    limit: usize,
) -> Result<Vec<SearchResult>> {
    let pattern = format!("%{}%", query);

    let sql = "SELECT d.source_type, d.title, d.file_path, si.content, d.created_at
         FROM search_index si
         JOIN documents d ON d.id = si.doc_id
         WHERE (si.title LIKE ?1 OR si.content LIKE ?1) AND (?3 = 'all' OR d.source_type = ?3)
         ORDER BY d.created_at DESC
         LIMIT ?2";

    let mut stmt = conn.prepare(sql)?;
    let results = stmt
        .query_map(params![pattern, limit, type_filter], |row| {
            let content: String = row.get(3)?;
            // Extract a snippet around the match
            let snippet = extract_snippet(&content, query, 60);
            Ok(SearchResult {
                source_type: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                snippet,
                date: row.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

/// Smart search: try FTS5 first, fall back to LIKE for CJK queries.
#[allow(dead_code)]
pub fn search_smart(
    conn: &Connection,
    query: &str,
    type_filter: &str,
    limit: usize,
) -> Result<Vec<SearchResult>> {
    let fts_results = search(conn, query, type_filter, limit)?;
    if fts_results.is_empty() {
        Ok(search_like(conn, query, type_filter, limit).unwrap_or_default())
    } else {
        Ok(fts_results)
    }
}

/// Extract a short snippet around the first occurrence of `needle` in `haystack`.
#[allow(dead_code)]
fn extract_snippet(haystack: &str, needle: &str, context_chars: usize) -> String {
    let flat: String = haystack
        .chars()
        .map(|c| if c == '\n' || c == '\r' { ' ' } else { c })
        .collect();
    let chars: Vec<char> = flat.chars().collect();
    if let Some(char_pos) = flat.find(needle).and_then(|byte_pos| {
        // Convert byte position to char position
        flat[..byte_pos].chars().count().into()
    }) {
        let needle_char_len = needle.chars().count();
        let start = char_pos.saturating_sub(context_chars);
        let end = (char_pos + needle_char_len + context_chars).min(chars.len());
        let snippet_chars: String = chars[start..end].iter().collect();
        let mut snippet = String::new();
        if start > 0 {
            snippet.push_str("...");
        }
        snippet.push_str(snippet_chars.trim());
        if end < chars.len() {
            snippet.push_str("...");
        }
        snippet
    } else {
        let preview: String = chars.iter().take(120).collect();
        if chars.len() > 120 {
            format!("{}...", preview.trim())
        } else {
            preview.trim().to_string()
        }
    }
}

/// List recent documents
pub fn recent(conn: &Connection, limit: usize, days: u32) -> Result<Vec<SearchResult>> {
    let cutoff = chrono::Local::now() - chrono::Duration::days(days as i64);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();

    let mut stmt = conn.prepare(
        "SELECT source_type, title, file_path, '', created_at
         FROM documents
         WHERE source_type = 'conversation' AND created_at >= ?1
         ORDER BY created_at DESC
         LIMIT ?2",
    )?;

    let results = stmt
        .query_map(params![cutoff_str, limit], |row| {
            Ok(SearchResult {
                source_type: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                snippet: row.get(3)?,
                date: row.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

/// Get stats
pub fn get_stats(conn: &Connection) -> Result<Stats> {
    let conversation_count: u32 = conn.query_row(
        "SELECT COUNT(*) FROM documents WHERE source_type = 'conversation'",
        [],
        |row| row.get(0),
    )?;

    let note_daily_count: u32 = conn.query_row(
        "SELECT COUNT(*) FROM documents WHERE file_path LIKE 'notes/daily/%'",
        [],
        |row| row.get(0),
    )?;

    let note_manual_count: u32 = conn.query_row(
        "SELECT COUNT(*) FROM documents WHERE file_path LIKE 'notes/manual/%'",
        [],
        |row| row.get(0),
    )?;

    let note_scratch_count: u32 = conn.query_row(
        "SELECT COUNT(*) FROM documents WHERE file_path LIKE 'notes/scratch/%'",
        [],
        |row| row.get(0),
    )?;

    Ok(Stats {
        conversation_count,
        note_daily_count,
        note_manual_count,
        note_scratch_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::datetime::frontmatter_record_datetime_raw;

    fn in_memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn test_content_hash_deterministic() {
        let h1 = content_hash("hello world");
        let h2 = content_hash("hello world");
        assert_eq!(h1, h2);
        assert_ne!(h1, content_hash("different"));
    }

    #[test]
    fn test_frontmatter_time_extracts_date() {
        let content = "---\ntitle: Test\ndate: 2025-01-15\n---\n\n# Hello";
        assert_eq!(
            frontmatter_record_datetime_raw(content),
            Some("2025-01-15".to_string())
        );
    }

    #[test]
    fn test_frontmatter_time_updated() {
        let content = "---\nupdated: 2025-03-20 10:00\n---\n\nBody";
        assert_eq!(
            frontmatter_record_datetime_raw(content),
            Some("2025-03-20 10:00".to_string())
        );
    }

    #[test]
    fn test_frontmatter_time_none() {
        assert_eq!(frontmatter_record_datetime_raw("No frontmatter here"), None);
    }

    #[test]
    fn test_index_file_and_search() {
        let conn = in_memory_db();
        index_file(
            &conn,
            "conversations/test.md",
            "conversation",
            "Test Title",
            "Some content about Rust",
            "2025-01-15",
        )
        .unwrap();

        let results = search(&conn, "Rust", "all", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Test Title");
        assert_eq!(results[0].source_type, "conversation");
    }

    #[test]
    fn test_search_type_filter() {
        let conn = in_memory_db();
        index_file(
            &conn,
            "conversations/a.md",
            "conversation",
            "Conv",
            "hello world",
            "2025-01-01",
        )
        .unwrap();
        index_file(
            &conn,
            "notes/scratch/b.md",
            "note",
            "Note",
            "hello world",
            "2025-01-01",
        )
        .unwrap();

        let all = search(&conn, "hello", "all", 10).unwrap();
        assert_eq!(all.len(), 2);

        let convs = search(&conn, "hello", "conversation", 10).unwrap();
        assert_eq!(convs.len(), 1);
        assert_eq!(convs[0].source_type, "conversation");

        let notes = search(&conn, "hello", "note", 10).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].source_type, "note");
    }

    #[test]
    fn test_search_no_results() {
        let conn = in_memory_db();
        let results = search(&conn, "nonexistent", "all", 10).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_get_stats() {
        let conn = in_memory_db();
        index_file(
            &conn,
            "conversations/a.md",
            "conversation",
            "A",
            "content",
            "2025-01-01",
        )
        .unwrap();
        index_file(
            &conn,
            "conversations/b.md",
            "conversation",
            "B",
            "content",
            "2025-01-02",
        )
        .unwrap();
        index_file(
            &conn,
            "notes/daily/c.md",
            "note",
            "C",
            "content",
            "2025-01-03",
        )
        .unwrap();
        index_file(
            &conn,
            "notes/manual/d.md",
            "note",
            "D",
            "content",
            "2025-01-04",
        )
        .unwrap();
        index_file(
            &conn,
            "notes/scratch/e.md",
            "note",
            "E",
            "content",
            "2025-01-05",
        )
        .unwrap();

        let stats = get_stats(&conn).unwrap();
        assert_eq!(stats.conversation_count, 2);
        assert_eq!(stats.note_daily_count, 1);
        assert_eq!(stats.note_manual_count, 1);
        assert_eq!(stats.note_scratch_count, 1);
    }

    #[test]
    fn test_index_file_dedup_by_hash() {
        let conn = in_memory_db();
        index_file(
            &conn,
            "test.md",
            "conversation",
            "T",
            "content v1",
            "2025-01-01",
        )
        .unwrap();
        // Same content, same hash - should be a no-op
        index_file(
            &conn,
            "test.md",
            "conversation",
            "T",
            "content v1",
            "2025-01-01",
        )
        .unwrap();

        let count: u32 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_index_file_updates_on_change() {
        let conn = in_memory_db();
        index_file(
            &conn,
            "test.md",
            "conversation",
            "T",
            "content v1",
            "2025-01-01",
        )
        .unwrap();
        // Different content → different hash → should update
        index_file(
            &conn,
            "test.md",
            "conversation",
            "T Updated",
            "content v2",
            "2025-01-01",
        )
        .unwrap();

        let title: String = conn
            .query_row(
                "SELECT title FROM documents WHERE file_path = 'test.md'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(title, "T Updated");
    }

    #[test]
    fn test_metadata_index_time() {
        let conn = in_memory_db();
        assert!(get_last_index_time(&conn).is_none());
        set_last_index_time(&conn).unwrap();
        assert!(get_last_index_time(&conn).is_some());
    }

    #[test]
    fn test_build_index_with_tempdir() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();

        // Create a conversation file
        let conv_dir = base.join("conversations/2025-01");
        std::fs::create_dir_all(&conv_dir).unwrap();
        std::fs::write(
            conv_dir.join("01-15-test.md"),
            "---\ndate: 2025-01-15\n---\n\n# Test Conversation\n\nHello world",
        )
        .unwrap();

        // Create a daily note
        let daily_dir = base.join("notes/daily");
        std::fs::create_dir_all(&daily_dir).unwrap();
        std::fs::write(
            daily_dir.join("2025-01-15.md"),
            "---\ndate: 2025-01-15\n---\n\n# 2025-01-15\n\nDaily note content",
        )
        .unwrap();

        let conn = in_memory_db();
        let count = build_index(&conn, base).unwrap();
        assert_eq!(count, 2);

        let stats = get_stats(&conn).unwrap();
        assert_eq!(stats.conversation_count, 1);
        assert_eq!(stats.note_daily_count, 1);
    }

    #[test]
    fn test_list_documents_page_orders_by_activity_time() {
        let expected_activity_ts =
            chrono::DateTime::parse_from_rfc3339("2026-05-07T14:09:00+08:00")
                .unwrap()
                .timestamp_millis();
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        let conv_dir = base.join("conversations/2026-03");
        std::fs::create_dir_all(&conv_dir).unwrap();
        std::fs::write(
            conv_dir.join("03-01-old.md"),
            "---\ntitle: Old\ndate: 2026-03-01T09:00:00+08:00\n---\n\n# Old\n",
        )
        .unwrap();
        std::fs::write(
            conv_dir.join("03-02-updated.md"),
            "---\ntitle: Updated\ndate: 2026-03-02T09:00:00+08:00\nupdated: 2026-05-07T14:09:00+08:00\n---\n\n# Updated\n",
        )
        .unwrap();

        let conn = in_memory_db();
        build_index(&conn, base).unwrap();
        let page = list_documents_page(&conn, "conversations", 0, 10).unwrap();

        assert_eq!(page.total, 2);
        assert!(page.items[0].file_path.ends_with("03-02-updated.md"));
        assert_eq!(page.items[0].activity_ts, expected_activity_ts);
        assert!(page.items[1].file_path.ends_with("03-01-old.md"));
    }

    #[test]
    fn test_sync_index_folder_refreshes_changed_file() {
        let expected_activity_ts =
            chrono::DateTime::parse_from_rfc3339("2026-05-07T14:09:00+08:00")
                .unwrap()
                .timestamp_millis();
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        let conv_dir = base.join("conversations/2026-03");
        std::fs::create_dir_all(&conv_dir).unwrap();
        let path = conv_dir.join("03-01-topic.md");
        std::fs::write(
            &path,
            "---\ntitle: Topic\ndate: 2026-03-01T09:00:00+08:00\n---\n\n# Topic\n",
        )
        .unwrap();

        let conn = in_memory_db();
        build_index(&conn, base).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        std::fs::write(
            &path,
            "---\ntitle: Topic\ndate: 2026-03-01T09:00:00+08:00\nupdated: 2026-05-07T14:09:00+08:00\n---\n\n# Topic\n",
        )
        .unwrap();

        sync_index_folder(&conn, base, "conversations").unwrap();
        let page = list_documents_page(&conn, "conversations", 0, 10).unwrap();

        assert_eq!(page.total, 1);
        assert_eq!(page.items[0].activity_ts, expected_activity_ts);
    }

    #[test]
    fn test_extract_snippet_found() {
        let text = "This is a long text about Rust programming language and its features.";
        let snippet = extract_snippet(text, "Rust", 10);
        assert!(snippet.contains("Rust"));
    }

    #[test]
    fn test_extract_snippet_not_found() {
        let text = "Hello world";
        let snippet = extract_snippet(text, "xyz", 10);
        assert_eq!(snippet, "Hello world");
    }
}
