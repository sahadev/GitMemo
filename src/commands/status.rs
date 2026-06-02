use anyhow::Result;
use std::path::Path;

use crate::{storage, utils};

pub fn cmd_status(sync_dir: &Path) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();

    println!("\n{}", style(t.status_title()).bold().cyan());
    println!();

    if !sync_dir.exists() {
        let msg = t
            .not_initialized()
            .replace("{}", &style("gitmemo init").bold().to_string());
        println!("  {}", msg);
        return Ok(());
    }

    println!(
        "  {}: {} {}",
        t.data_dir(),
        sync_dir.display(),
        style("✓").green()
    );

    // Check config
    let config_path = utils::config::Config::config_path();
    if config_path.exists() {
        let config = utils::config::Config::load(&config_path)?;
        if config.has_remote() {
            println!("  {}: {}", t.git_remote(), config.git.remote);
            println!("  {}: {}", t.git_branch(), config.git.branch);
        } else {
            println!("  {}", t.sync_mode_local());
        }
    }

    // Count files
    let conv_count = walkdir::WalkDir::new(sync_dir.join("conversations"))
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        .count();
    let note_count = walkdir::WalkDir::new(sync_dir.join("notes"))
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        .count();

    println!("  {}: {}", t.conversations_count(), conv_count);
    println!("  {}: {}", t.notes_count(), note_count);

    // Show sync status (only if remote configured)
    if storage::git::has_remote(sync_dir) {
        let unpushed = storage::git::unpushed_count(sync_dir).unwrap_or(0);
        if unpushed > 0 {
            println!(
                "  {}",
                t.unpushed_commits(unpushed)
                    .replace("gitmemo sync", &style("gitmemo sync").cyan().to_string())
            );
        } else if storage::git::has_unpushed(sync_dir) {
            println!(
                "  {}",
                t.unpushed_commits(0)
                    .replace("gitmemo sync", &style("gitmemo sync").cyan().to_string())
            );
        } else {
            println!("  {}", t.sync_ok());
        }
    }
    println!();

    Ok(())
}
