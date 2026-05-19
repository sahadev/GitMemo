use anyhow::Result;
use std::path::Path;

use super::common::{ensure_init, print_sync_status};
use crate::{services, utils};

pub fn cmd_note(sync_dir: &Path, content: &str) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    ensure_init(sync_dir)?;
    let result = services::notes::create_scratch(sync_dir, content)?;
    println!(
        "  {} {}",
        style("✓").green(),
        t.scratch_created(&result.rel_path)
    );
    print_sync_status(&result.sync);
    Ok(())
}

pub fn cmd_daily(sync_dir: &Path, content: Option<String>) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    ensure_init(sync_dir)?;

    let text = match content {
        Some(c) => c,
        None => {
            // Open editor
            let daily_path = sync_dir.join(format!(
                "notes/daily/{}.md",
                chrono::Local::now().format("%Y-%m-%d")
            ));
            if !daily_path.exists() {
                let date = chrono::Local::now().format("%Y-%m-%d").to_string();
                std::fs::create_dir_all(daily_path.parent().unwrap())?;
                std::fs::write(
                    &daily_path,
                    format!("---\ndate: {}\n---\n\n# {}\n\n", date, date),
                )?;
            }
            let editor = std::env::var("EDITOR").unwrap_or_else(|_| "vim".to_string());
            std::process::Command::new(&editor)
                .arg(&daily_path)
                .status()?;
            services::sync::commit_and_push(sync_dir, "daily: update")?;
            println!("  {} {}", style("✓").green(), t.daily_saved());
            return Ok(());
        }
    };

    let result = services::notes::append_daily(sync_dir, &text)?;
    println!(
        "  {} {}",
        style("✓").green(),
        t.daily_appended(&result.rel_path)
    );
    print_sync_status(&result.sync);
    Ok(())
}

pub fn cmd_manual(
    sync_dir: &Path,
    title: &str,
    content: Option<String>,
    append: bool,
) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    ensure_init(sync_dir)?;

    let text = match content {
        Some(c) => c,
        None => {
            // Open editor with temp file
            let tmp = tempfile::NamedTempFile::new()?;
            let editor = std::env::var("EDITOR").unwrap_or_else(|_| "vim".to_string());
            std::process::Command::new(&editor)
                .arg(tmp.path())
                .status()?;
            std::fs::read_to_string(tmp.path())?
        }
    };

    if text.trim().is_empty() {
        println!("  {}", t.content_empty());
        return Ok(());
    }

    let result = services::notes::write_manual(sync_dir, title, &text, append)?;
    println!(
        "  {} {}",
        style("✓").green(),
        t.manual_saved(&result.rel_path)
    );
    print_sync_status(&result.sync);
    Ok(())
}

pub fn cmd_capture(
    sync_dir: &Path,
    project: Option<String>,
    dry_run: bool,
    quiet: bool,
) -> Result<()> {
    if !sync_dir.exists() {
        if !quiet {
            eprintln!("[gitmemo] Not initialized. Run `gitmemo init` first.");
        }
        return Ok(());
    }

    let (result, _) = services::capture::capture_and_sync(sync_dir, project.as_deref(), dry_run)?;

    if !quiet {
        if services::capture::capture_changed(&result) {
            println!(
                "Captured {} new, {} updated ({} skipped)",
                result.new_sessions, result.updated_sessions, result.skipped
            );
        } else {
            println!("No new conversations to capture");
        }
    }

    Ok(())
}
