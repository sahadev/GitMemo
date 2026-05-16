use anyhow::Result;
use std::path::Path;

use super::common::{ensure_indexed, ensure_init};
use crate::{storage, utils};

pub fn cmd_search(sync_dir: &Path, query: &str, type_filter: &str, limit: usize) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let conn = ensure_indexed(sync_dir)?;

    let results = storage::database::search(&conn, query, type_filter, limit)?;

    if results.is_empty() {
        println!("  {}", t.no_results(query));
        return Ok(());
    }

    println!(
        "\n  {}\n",
        style(t.found_results(results.len())).bold()
    );

    for (i, r) in results.iter().enumerate() {
        let type_badge = if r.source_type == "conversation" {
            style(t.badge_conversation()).cyan()
        } else {
            style(t.badge_note()).yellow()
        };
        println!(
            "  {}. [{}] {} ({})",
            i + 1,
            type_badge,
            style(&r.title).bold(),
            &r.date
        );
        if !r.snippet.is_empty() {
            println!("     {}", style(&r.snippet).dim());
        }
        println!("     {}", style(&r.file_path).dim());
        println!();
    }

    Ok(())
}

pub fn cmd_recent(sync_dir: &Path, limit: usize, days: u32) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let conn = ensure_indexed(sync_dir)?;

    let results = storage::database::recent(&conn, limit, days)?;

    if results.is_empty() {
        println!("  {}", t.no_recent(days));
        return Ok(());
    }

    println!("\n  {}\n", style(t.recent_heading(days)).bold());

    for (i, r) in results.iter().enumerate() {
        println!(
            "  {}. {} ({})",
            i + 1,
            style(&r.title).bold(),
            &r.date
        );
        println!("     {}", style(&r.file_path).dim());
    }
    println!();

    Ok(())
}

pub fn cmd_stats(sync_dir: &Path) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let conn = ensure_indexed(sync_dir)?;

    let stats = storage::database::get_stats(&conn)?;

    let total_size = storage::git::worktree_content_size(sync_dir);

    println!("\n{}", style(t.stats_title()).bold().cyan());
    println!();
    println!("  {}:  {}", t.stats_conversations(), stats.conversation_count);
    println!("  {}:  {}", t.stats_daily(), stats.note_daily_count);
    println!("  {}:      {}", t.stats_manual(), stats.note_manual_count);
    println!("  {}:      {}", t.stats_scratch(), stats.note_scratch_count);
    println!(
        "  {}:  {:.1} KB",
        t.stats_storage(),
        total_size as f64 / 1024.0
    );
    println!();

    Ok(())
}

pub fn cmd_reindex(sync_dir: &Path) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    ensure_init(sync_dir)?;
    let db_path = sync_dir.join(".metadata").join("index.db");

    // Delete existing db and rebuild
    if db_path.exists() {
        std::fs::remove_file(&db_path)?;
    }

    let conn = storage::database::open_or_create(&db_path)?;
    let count = storage::database::build_index(&conn, sync_dir)?;
    println!(
        "  {} {}",
        style("✓").green(),
        t.index_rebuilt(count as usize)
    );

    Ok(())
}
