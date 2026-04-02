use anyhow::Result;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::Path;

pub struct SearchResult {
    pub source_type: String, // "conversation" or "note"
    pub title: String,
    pub file_path: String,
    pub snippet: String,
    pub date: String,
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
            content_hash TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(source_type);
        CREATE INDEX IF NOT EXISTS idx_docs_created ON documents(created_at);

        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
            doc_id,
            title,
            content,
            tokenize='unicode61'
        );
        ",
    )?;
    Ok(())
}

fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn frontmatter_time(content: &str) -> Option<String> {
    for key in ["date:", "updated:", "created:"] {
        if let Some(value) = content
            .lines()
            .find(|l| l.starts_with(key))
            .map(|l| l.trim_start_matches(key).trim().to_string())
            .filter(|value| !value.is_empty())
        {
            return Some(value);
        }
    }
    None
}

/// Index a single file into the database
pub fn index_file(conn: &Connection, file_path: &str, source_type: &str, title: &str, content: &str, date: &str) -> Result<()> {
    let hash = content_hash(content);
    let id = content_hash(file_path);

    // Check if already indexed with same hash
    let existing_hash: Option<String> = conn
        .query_row(
            "SELECT content_hash FROM documents WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .ok();

    if existing_hash.as_deref() == Some(&hash) {
        return Ok(()); // No change
    }

    // Upsert document
    conn.execute(
        "INSERT OR REPLACE INTO documents (id, file_path, source_type, title, created_at, content_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, file_path, source_type, title, date, hash],
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

            // Extract title from first # heading or filename
            let title = content
                .lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l.trim_start_matches("# ").to_string())
                .unwrap_or_else(|| {
                    path.file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string()
                });

            // Extract date from frontmatter or filename
            let date = frontmatter_time(&content).unwrap_or_else(|| {
                path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .chars()
                    .take(10)
                    .collect()
            });

            let rel_path = path
                .strip_prefix(sync_dir)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();
            seen_paths.insert(rel_path.clone());

            index_file(conn, &rel_path, source_type, &title, &content, &date)?;
            count += 1;
        }
    }

    let stale_docs: Vec<(String, String)> = {
        let mut stmt = conn.prepare("SELECT id, file_path FROM documents")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows
            .filter_map(|row| row.ok())
            .filter(|(_, file_path)| !seen_paths.contains(file_path))
            .collect()
    };

    for (id, _) in stale_docs {
        conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        conn.execute("DELETE FROM search_index WHERE doc_id = ?1", params![id])?;
    }

    Ok(count)
}

/// Full-text search
pub fn search(conn: &Connection, query: &str, type_filter: &str, limit: usize) -> Result<Vec<SearchResult>> {
    let sql = if type_filter == "all" {
        "SELECT d.source_type, d.title, d.file_path, snippet(search_index, 2, '**', '**', '...', 20) as snip, d.created_at
         FROM search_index si
         JOIN documents d ON d.id = si.doc_id
         WHERE search_index MATCH ?1
         ORDER BY rank
         LIMIT ?2"
            .to_string()
    } else {
        format!(
            "SELECT d.source_type, d.title, d.file_path, snippet(search_index, 2, '**', '**', '...', 20) as snip, d.created_at
             FROM search_index si
             JOIN documents d ON d.id = si.doc_id
             WHERE search_index MATCH ?1 AND d.source_type = '{}'
             ORDER BY rank
             LIMIT ?2",
            type_filter
        )
    };

    let mut stmt = conn.prepare(&sql)?;
    let results = stmt
        .query_map(params![query, limit], |row| {
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
pub fn search_like(conn: &Connection, query: &str, type_filter: &str, limit: usize) -> Result<Vec<SearchResult>> {
    let pattern = format!("%{}%", query);

    let sql = if type_filter == "all" {
        "SELECT d.source_type, d.title, d.file_path, si.content, d.created_at
         FROM search_index si
         JOIN documents d ON d.id = si.doc_id
         WHERE si.title LIKE ?1 OR si.content LIKE ?1
         ORDER BY d.created_at DESC
         LIMIT ?2"
            .to_string()
    } else {
        format!(
            "SELECT d.source_type, d.title, d.file_path, si.content, d.created_at
             FROM search_index si
             JOIN documents d ON d.id = si.doc_id
             WHERE (si.title LIKE ?1 OR si.content LIKE ?1) AND d.source_type = '{}'
             ORDER BY d.created_at DESC
             LIMIT ?2",
            type_filter
        )
    };

    let mut stmt = conn.prepare(&sql)?;
    let results = stmt
        .query_map(params![pattern, limit], |row| {
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

/// Extract a short snippet around the first occurrence of `needle` in `haystack`.
fn extract_snippet(haystack: &str, needle: &str, context_chars: usize) -> String {
    let flat: String = haystack.chars().map(|c| if c == '\n' || c == '\r' { ' ' } else { c }).collect();
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
        if start > 0 { snippet.push_str("..."); }
        snippet.push_str(snippet_chars.trim());
        if end < chars.len() { snippet.push_str("..."); }
        snippet
    } else {
        let preview: String = chars.iter().take(120).collect();
        if chars.len() > 120 { format!("{}...", preview.trim()) } else { preview.trim().to_string() }
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
