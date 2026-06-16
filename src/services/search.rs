use std::path::Path;

use anyhow::Result;
use rusqlite::Connection;

use crate::storage::database::{self, SearchResult, Stats};

pub fn open_index(sync_dir: &Path) -> Result<Connection> {
    let db_path = database::index_db_path(sync_dir);
    database::open_or_create(&db_path)
}

pub fn ensure_indexed(sync_dir: &Path) -> Result<Connection> {
    let conn = open_index(sync_dir)?;
    database::build_index_if_needed(&conn, sync_dir)?;
    Ok(conn)
}

pub fn rebuild_index(sync_dir: &Path) -> Result<u32> {
    database::rebuild_index(sync_dir)
}

pub fn search(
    sync_dir: &Path,
    query: &str,
    type_filter: &str,
    limit: usize,
) -> Result<Vec<SearchResult>> {
    let conn = ensure_indexed(sync_dir)?;
    database::search(&conn, query, type_filter, limit)
}

pub fn search_smart(
    sync_dir: &Path,
    query: &str,
    type_filter: &str,
    limit: usize,
) -> Result<Vec<SearchResult>> {
    let conn = open_index(sync_dir)?;
    database::build_index(&conn, sync_dir)?;
    database::search_smart(&conn, query, type_filter, limit)
}

pub fn recent(sync_dir: &Path, limit: usize, days: u32) -> Result<Vec<SearchResult>> {
    let conn = ensure_indexed(sync_dir)?;
    database::recent(&conn, limit, days)
}

pub fn recent_with_full_rebuild(
    sync_dir: &Path,
    limit: usize,
    days: u32,
) -> Result<Vec<SearchResult>> {
    let conn = open_index(sync_dir)?;
    database::build_index(&conn, sync_dir)?;
    database::recent(&conn, limit, days)
}

pub fn stats(sync_dir: &Path) -> Result<Stats> {
    let conn = ensure_indexed(sync_dir)?;
    database::get_stats(&conn)
}
