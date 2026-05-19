use anyhow::Result;
use std::path::Path;

use crate::{storage, utils};

pub fn ensure_init(sync_dir: &Path) -> Result<()> {
    if !sync_dir.exists() {
        let t = utils::i18n::get();
        anyhow::bail!(t.not_init_error());
    }
    Ok(())
}

pub fn print_sync_status(result: &storage::git::SyncResult) {
    use console::style;
    let t = utils::i18n::get();

    if !result.committed {
        println!("  {} {}", style("ℹ").blue(), t.no_changes());
        return;
    }
    if result.pushed {
        println!("  {} {}", style("✓").green(), t.synced_to_git());
    } else if let Some(ref err) = result.push_error {
        println!("  {} {}", style("⚠").yellow(), t.committed_push_failed(err));
        let hint = t
            .retry_push_hint()
            .replace("{}", &style("gitmemo sync").cyan().to_string());
        println!("    {}", hint);
    } else {
        // Committed but no push attempted (local-only mode)
        println!("  {} {}", style("✓").green(), t.local_saved_hint());
    }
}
