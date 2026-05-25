mod cli;
mod commands;

use anyhow::Result;
use clap::Parser;
use cli::{Cli, Commands};
use gitmemo_core::services::sync::StartupMode;
pub(crate) use gitmemo_core::{inject, mcp, services, storage, utils};

fn main() -> Result<()> {
    let cli = Cli::parse();

    // Init i18n from config (except during init itself, where we ask the user)
    if !matches!(cli.command, Commands::Init { .. }) {
        utils::i18n::init_from_config();
    }

    let sync_dir = storage::files::sync_dir();

    // Pull latest from remote on startup (skip for init/uninstall/mcp-serve/capture)
    if !matches!(
        cli.command,
        Commands::Init { .. }
            | Commands::Uninstall { .. }
            | Commands::McpServe
            | Commands::Capture { .. }
    ) && sync_dir.exists()
    {
        let _ = services::startup::run_startup(&sync_dir, StartupMode::Cli);
    }

    match cli.command {
        Commands::Init {
            git_url,
            path,
            no_mcp,
            editor,
            lang,
        } => commands::cmd_init(git_url, path, no_mcp, editor, lang)?,
        Commands::Uninstall { remove_data } => commands::cmd_uninstall(remove_data)?,
        Commands::Note { content } => commands::cmd_note(&sync_dir, &content)?,
        Commands::Manual {
            title,
            content,
            append,
        } => commands::cmd_manual(&sync_dir, &title, content, append)?,
        Commands::Search {
            query,
            r#type,
            limit,
        } => commands::cmd_search(&sync_dir, &query, &r#type, limit)?,
        Commands::Recent { limit, days } => commands::cmd_recent(&sync_dir, limit, days)?,
        Commands::Stats => commands::cmd_stats(&sync_dir)?,
        Commands::Reindex => commands::cmd_reindex(&sync_dir)?,
        Commands::McpServe => mcp::server::run()?,
        Commands::Status => commands::cmd_status(&sync_dir)?,
        Commands::Sync => commands::cmd_sync(&sync_dir)?,
        Commands::Unpushed => commands::cmd_unpushed(&sync_dir)?,
        Commands::Branch { name } => commands::cmd_branch(&sync_dir, name)?,
        Commands::Remote { url, remove } => commands::cmd_remote(&sync_dir, url, remove)?,
        Commands::Capture {
            project,
            dry_run,
            quiet,
        } => commands::cmd_capture(&sync_dir, project, dry_run, quiet)?,
        Commands::Upgrade { check } => commands::cmd_upgrade(check)?,
    }

    Ok(())
}
