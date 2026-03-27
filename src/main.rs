mod cli;
mod inject;
mod mcp;
mod models;
mod storage;
mod utils;

use anyhow::Result;
use clap::Parser;
use cli::{Cli, Commands};

fn main() -> Result<()> {
    let cli = Cli::parse();

    // Init i18n from config (except during init itself, where we ask the user)
    if !matches!(cli.command, Commands::Init { .. }) {
        utils::i18n::init_from_config();
    }

    match cli.command {
        Commands::Init { git_url, path, no_mcp, editor, lang } => {
            cmd_init(git_url, path, no_mcp, editor, lang)?;
        }
        Commands::Uninstall { remove_data } => {
            cmd_uninstall(remove_data)?;
        }
        Commands::Note { content } => {
            cmd_note(&content)?;
        }
        Commands::Daily { content } => {
            cmd_daily(content)?;
        }
        Commands::Manual {
            title,
            content,
            append,
        } => {
            cmd_manual(&title, content, append)?;
        }
        Commands::Search {
            query,
            r#type,
            limit,
        } => {
            cmd_search(&query, &r#type, limit)?;
        }
        Commands::Recent { limit, days } => {
            cmd_recent(limit, days)?;
        }
        Commands::Stats => {
            cmd_stats()?;
        }
        Commands::Reindex => {
            cmd_reindex()?;
        }
        Commands::McpServe => {
            mcp::server::run()?;
        }
        Commands::Status => {
            cmd_status()?;
        }
        Commands::Sync => {
            cmd_sync()?;
        }
        Commands::Unpushed => {
            cmd_unpushed()?;
        }
    }

    Ok(())
}

#[derive(Debug, Clone, Copy)]
enum EditorChoice {
    Claude,
    Cursor,
    All,
}

fn cmd_init(git_url: Option<String>, path: Option<String>, no_mcp: bool, editor: Option<String>, lang_arg: Option<String>) -> Result<()> {
    use console::style;
    use dialoguer::{Input, Select};
    use utils::i18n::{self, Lang};

    let default_sync_dir = storage::files::sync_dir();

    // 0a. Determine language (ask first, before anything else)
    let lang = match lang_arg.as_deref() {
        Some(l) => Lang::from_str(l),
        None => {
            let lang_options = vec!["English", "中文"];
            let selection = Select::new()
                .with_prompt("Select language / 选择语言")
                .items(&lang_options)
                .default(0)
                .interact()?;
            match selection {
                1 => Lang::Zh,
                _ => Lang::En,
            }
        }
    };
    i18n::init(lang);
    let t = i18n::get();

    println!("\n{}", style(t.init_title()).bold().cyan());
    println!();

    // 0b. Determine target editor(s)
    let editor_choice = match editor.as_deref() {
        Some("claude") => EditorChoice::Claude,
        Some("cursor") => EditorChoice::Cursor,
        Some("all") => EditorChoice::All,
        Some(other) => anyhow::bail!(t.unsupported_editor(other)),
        None => {
            let options = t.editor_options();
            let selection = Select::new()
                .with_prompt(t.select_editor_prompt())
                .items(&options)
                .default(0)
                .interact()?;
            match selection {
                0 => EditorChoice::Claude,
                1 => EditorChoice::Cursor,
                _ => EditorChoice::All,
            }
        }
    };

    let install_claude = matches!(editor_choice, EditorChoice::Claude | EditorChoice::All);
    let install_cursor = matches!(editor_choice, EditorChoice::Cursor | EditorChoice::All);

    // 1. Handle --path: symlink existing repo
    let sync_dir = if let Some(ref repo_path) = path {
        let real_path = std::path::Path::new(repo_path).canonicalize()?;
        if !real_path.join(".git").exists() {
            anyhow::bail!(t.not_a_git_repo(&real_path.display().to_string()));
        }

        // Create symlink if needed
        if default_sync_dir.exists() || default_sync_dir.symlink_metadata().is_ok() {
            std::fs::remove_file(&default_sync_dir).ok();
            std::fs::remove_dir(&default_sync_dir).ok();
        }
        std::os::unix::fs::symlink(&real_path, &default_sync_dir)?;
        println!(
            "  {} {}: {} → {}",
            style("✓").green(),
            t.linked_repo(),
            default_sync_dir.display(),
            real_path.display()
        );
        default_sync_dir.clone()
    } else {
        default_sync_dir.clone()
    };

    let sync_dir_str = sync_dir.to_string_lossy().to_string();

    // 2. Get Git URL (auto-detect from existing repo if --path)
    let url = match git_url {
        Some(u) => u,
        None => {
            // Try to read from existing repo
            if let Ok(repo) = git2::Repository::open(&sync_dir) {
                if let Ok(remote) = repo.find_remote("origin") {
                    if let Some(existing_url) = remote.url() {
                        println!(
                            "  {} {}: {}",
                            style("ℹ").blue(),
                            t.detected_remote(),
                            existing_url
                        );
                        existing_url.to_string()
                    } else {
                        Input::new().with_prompt(t.git_url_prompt()).interact_text()?
                    }
                } else {
                    Input::new().with_prompt(t.git_url_prompt()).interact_text()?
                }
            } else {
                Input::new().with_prompt(t.git_url_prompt()).interact_text()?
            }
        }
    };

    // 3. Create directory structure (safe for existing dirs)
    storage::files::create_directory_structure(&sync_dir)?;
    println!("  {} {}", style("✓").green(), t.dir_structure_ready());

    // 4. Init or open git repo
    storage::git::init_repo(&sync_dir, &url)?;
    println!("  {} {}", style("✓").green(), t.git_repo_ready());

    // 5. Generate SSH key (skip if exists)
    let ssh_dir = sync_dir.join(".ssh");
    let (key_path, is_new_key) = utils::ssh::generate_key(&ssh_dir)?;
    let pub_key = utils::ssh::read_public_key(&key_path)?;
    if is_new_key {
        println!("  {} {}", style("✓").green(), t.ssh_key_generated());
    } else {
        println!("  {} {}", style("✓").green(), t.ssh_key_exists());
    }

    // 6. Backup existing configs before injection
    let backup_dir = sync_dir.join(".backups");
    std::fs::create_dir_all(&backup_dir)?;

    let claude_md_path = dirs::home_dir().unwrap().join(".claude").join("CLAUDE.md");
    let settings_path = dirs::home_dir()
        .unwrap()
        .join(".claude")
        .join("settings.json");
    let claude_json_path = dirs::home_dir().unwrap().join(".claude.json");
    let cursor_rules_path = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("rules")
        .join("gitmemo.mdc");
    let cursor_mcp_path = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("mcp.json");

    // Backup relevant configs
    for (src, name) in [
        (&claude_md_path, "CLAUDE.md.backup"),
        (&settings_path, "settings.json.backup"),
        (&claude_json_path, "claude.json.backup"),
        (&cursor_mcp_path, "cursor-mcp.json.backup"),
    ] {
        if src.exists() {
            std::fs::copy(src, backup_dir.join(name))?;
        }
    }
    println!("  {} {}", style("✓").green(), t.configs_backed_up());

    // 7. Inject editor-specific configs
    if install_claude {
        inject::claude_md::inject(&claude_md_path, &sync_dir_str, lang)?;
        println!("  {} {}", style("✓").green(), t.claude_md_injected());

        inject::settings_hook::inject(&settings_path, &sync_dir_str)?;
        println!("  {} {}", style("✓").green(), t.git_hook_injected());

        if !no_mcp {
            let binary = std::env::current_exe()?.to_string_lossy().to_string();
            inject::mcp_register::register(&claude_json_path, &binary)?;
            println!("  {} {}", style("✓").green(), t.claude_mcp_registered());
        }

        // Install /save skill
        let skill_dir = dirs::home_dir().unwrap().join(".claude").join("skills").join("save");
        std::fs::create_dir_all(&skill_dir)?;
        std::fs::write(
            skill_dir.join("SKILL.md"),
            include_str!("../skills/save/SKILL.md"),
        )?;
        println!("  {} {}", style("✓").green(), t.save_skill_installed());
    }

    if install_cursor {
        inject::cursor_rules::inject(&cursor_rules_path, &sync_dir_str)?;
        println!("  {} {}", style("✓").green(), t.cursor_rules_injected());

        if !no_mcp {
            let binary = std::env::current_exe()?.to_string_lossy().to_string();
            inject::cursor_mcp::register(&cursor_mcp_path, &binary)?;
            println!("  {} {}", style("✓").green(), t.cursor_mcp_registered());
        }
    }

    // 8. Save config (with language)
    let config = utils::config::Config {
        git: utils::config::GitConfig {
            remote: url,
            branch: "main".to_string(),
        },
        lang: lang.as_str().to_string(),
    };
    config.save(&utils::config::Config::config_path())?;

    // 9. Initial commit
    storage::git::commit_and_push(&sync_dir, "init: gitmemo")?;

    // 10. Show public key and next steps
    println!();
    if is_new_key {
        println!(
            "  {} {}",
            style("→").yellow(),
            t.deploy_key_hint()
        );
        println!();
        println!("  {}", style(&pub_key).dim());
        println!();
    }
    println!(
        "  {}",
        style(t.all_set()).green().bold()
    );
    println!();
    println!("  {}", t.next_steps());
    if install_claude {
        let step1 = t.claude_next_step_1().replace("{}", &style("/save").cyan().to_string());
        println!("    1. {}", step1);
        println!("    2. {}", t.claude_next_step_2());
    }
    if install_cursor {
        let step1 = t.cursor_next_step_1().replace("{}", &style(t.recommend()).bold().to_string());
        println!("    1. {}", step1);
        println!("    2. {}", t.cursor_next_step_2());
    }
    println!();
    println!("  {}", t.verify_heading());
    println!("    {} {}", style("gitmemo note \"hello world\"").cyan(), t.verify_test());
    println!("    {} {}", style("gitmemo status").cyan(), t.verify_status());
    println!();

    Ok(())
}

fn cmd_uninstall(remove_data: bool) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();

    println!("\n{}", style(t.uninstall_title()).bold().cyan());

    // Remove Claude Code configs
    let claude_md_path = dirs::home_dir().unwrap().join(".claude").join("CLAUDE.md");
    inject::claude_md::remove(&claude_md_path)?;
    println!("  {} {}", style("✓").green(), t.claude_md_removed());

    let settings_path = dirs::home_dir()
        .unwrap()
        .join(".claude")
        .join("settings.json");
    inject::settings_hook::remove(&settings_path)?;
    println!("  {} {}", style("✓").green(), t.git_hook_removed());

    let claude_json_path = dirs::home_dir().unwrap().join(".claude.json");
    inject::mcp_register::unregister(&claude_json_path)?;
    println!("  {} {}", style("✓").green(), t.claude_mcp_removed());

    let skill_dir = dirs::home_dir().unwrap().join(".claude").join("skills").join("save");
    if skill_dir.exists() {
        std::fs::remove_dir_all(&skill_dir)?;
        println!("  {} {}", style("✓").green(), t.save_skill_removed());
    }

    // Remove Cursor configs
    let cursor_rules_path = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("rules")
        .join("gitmemo.mdc");
    inject::cursor_rules::remove(&cursor_rules_path)?;
    println!("  {} {}", style("✓").green(), t.cursor_rules_removed());

    let cursor_mcp_path = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("mcp.json");
    inject::cursor_mcp::unregister(&cursor_mcp_path)?;
    println!("  {} {}", style("✓").green(), t.cursor_mcp_removed());

    if remove_data {
        let sync_dir = storage::files::sync_dir();
        if sync_dir.exists() {
            std::fs::remove_dir_all(&sync_dir)?;
            println!(
                "  {} {}",
                style("✓").green(),
                t.data_deleted(&sync_dir.display().to_string())
            );
        }
    } else {
        println!(
            "  {} {}",
            style("ℹ").blue(),
            t.data_preserved(&storage::files::sync_dir().display().to_string())
        );
    }

    println!();
    Ok(())
}

fn cmd_status() -> Result<()> {
    use console::style;
    let t = utils::i18n::get();

    let sync_dir = storage::files::sync_dir();

    println!("\n{}", style(t.status_title()).bold().cyan());
    println!();

    if !sync_dir.exists() {
        let msg = t.not_initialized().replace("{}", &style("gitmemo init").bold().to_string());
        println!("  {}", msg);
        return Ok(());
    }

    println!("  {}: {} {}", t.data_dir(), sync_dir.display(), style("✓").green());

    // Check config
    let config_path = utils::config::Config::config_path();
    if config_path.exists() {
        let config = utils::config::Config::load(&config_path)?;
        println!("  {}: {}", t.git_remote(), config.git.remote);
        println!("  {}: {}", t.git_branch(), config.git.branch);
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

    // Show unpushed count
    let unpushed = storage::git::unpushed_count(&sync_dir).unwrap_or(0);
    if unpushed > 0 {
        println!(
            "  {}",
            t.unpushed_commits(unpushed)
                .replace("gitmemo sync", &style("gitmemo sync").cyan().to_string())
        );
    } else if storage::git::has_unpushed(&sync_dir) {
        // Count returned 0 but has_unpushed thinks there might be — show uncertain state
        println!(
            "  {}",
            t.unpushed_commits(0)
                .replace("gitmemo sync", &style("gitmemo sync").cyan().to_string())
        );
    } else {
        println!("  {}", t.sync_ok());
    }
    println!();

    Ok(())
}

fn ensure_init() -> Result<std::path::PathBuf> {
    let sync_dir = storage::files::sync_dir();
    if !sync_dir.exists() {
        let t = utils::i18n::get();
        anyhow::bail!(t.not_init_error());
    }
    Ok(sync_dir)
}

fn cmd_sync() -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let sync_dir = ensure_init()?;

    // First try commit + push
    let result = storage::git::commit_and_push(&sync_dir, "auto: sync")?;
    if result.committed {
        print_sync_status(&result);
        // If committed but push failed, don't return early — report the error
        if !result.pushed {
            if let Some(ref err) = result.push_error {
                println!("  {} {}", style("✗").red(), t.push_failed(err));
            }
        }
        return Ok(());
    }

    // No new changes to commit, but maybe there are unpushed commits
    // Use has_unpushed which defaults to true when uncertain (safer)
    if storage::git::has_unpushed(&sync_dir) {
        let unpushed = storage::git::unpushed_count(&sync_dir).unwrap_or(0);
        let count_label = if unpushed > 0 {
            t.pushing_commits(unpushed)
        } else {
            t.pushing_commits(0) // count unknown but there might be unpushed
        };
        println!("  {} {}", style("ℹ").blue(), count_label);

        let push_result = storage::git::push(&sync_dir)?;
        if push_result.pushed {
            if unpushed > 0 {
                println!("  {} {}", style("✓").green(), t.pushed_commits(unpushed));
            } else {
                println!("  {} {}", style("✓").green(), t.synced_to_git());
            }
        } else if let Some(ref err) = push_result.push_error {
            // Check if "Everything up-to-date" — means actually synced
            if err.contains("Everything up-to-date") || err.contains("up to date") {
                println!("  {} {}", style("✓").green(), t.all_synced());
            } else {
                println!("  {} {}", style("✗").red(), t.push_failed(err));
            }
        }
    } else {
        println!("  {} {}", style("✓").green(), t.all_synced());
    }

    Ok(())
}

fn cmd_unpushed() -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let sync_dir = ensure_init()?;

    let logs = storage::git::unpushed_log(&sync_dir)?;
    if logs.is_empty() {
        println!("  {} {}", style("✓").green(), t.no_unpushed());
        return Ok(());
    }

    println!(
        "\n  {}\n",
        t.unpushed_heading(logs.len())
    );
    for log in &logs {
        println!("  {}", log);
    }
    println!();
    let hint = t.push_hint().replace("{}", &style("gitmemo sync").cyan().to_string());
    println!("  {}", hint);
    println!();

    Ok(())
}

fn print_sync_status(result: &storage::git::SyncResult) {
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
        let hint = t.retry_push_hint().replace("{}", &style("gitmemo sync").cyan().to_string());
        println!("    {}", hint);
    } else {
        println!("  {} {}", style("ℹ").blue(), t.committing());
    }
}

fn cmd_note(content: &str) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let sync_dir = ensure_init()?;
    let rel_path = storage::files::create_scratch(&sync_dir, content)?;
    let result = storage::git::commit_and_push(&sync_dir, &format!("note: {}", &content[..content.len().min(50)]))?;
    println!("  {} {}", style("✓").green(), t.scratch_created(&rel_path));
    print_sync_status(&result);
    Ok(())
}

fn cmd_daily(content: Option<String>) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let sync_dir = ensure_init()?;

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
            storage::git::commit_and_push(&sync_dir, "daily: update")?;
            println!("  {} {}", style("✓").green(), t.daily_saved());
            return Ok(());
        }
    };

    let rel_path = storage::files::append_daily(&sync_dir, &text)?;
    let result = storage::git::commit_and_push(&sync_dir, &format!("daily: {}", &text[..text.len().min(50)]))?;
    println!("  {} {}", style("✓").green(), t.daily_appended(&rel_path));
    print_sync_status(&result);
    Ok(())
}

fn cmd_manual(title: &str, content: Option<String>, append: bool) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let sync_dir = ensure_init()?;

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

    let rel_path = storage::files::write_manual(&sync_dir, title, &text, append)?;
    let action = if append { "update" } else { "create" };
    let result = storage::git::commit_and_push(&sync_dir, &format!("manual: {} {}", action, title))?;
    println!("  {} {}", style("✓").green(), t.manual_saved(&rel_path));
    print_sync_status(&result);
    Ok(())
}

#[allow(dead_code)]
fn open_db() -> Result<rusqlite::Connection> {
    let sync_dir = ensure_init()?;
    let db_path = sync_dir.join(".metadata").join("index.db");
    storage::database::open_or_create(&db_path)
}

fn ensure_indexed() -> Result<(std::path::PathBuf, rusqlite::Connection)> {
    let sync_dir = ensure_init()?;
    let db_path = sync_dir.join(".metadata").join("index.db");
    let conn = storage::database::open_or_create(&db_path)?;
    storage::database::build_index(&conn, &sync_dir)?;
    Ok((sync_dir, conn))
}

fn cmd_search(query: &str, type_filter: &str, limit: usize) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let (_sync_dir, conn) = ensure_indexed()?;

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

fn cmd_recent(limit: usize, days: u32) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let (_sync_dir, conn) = ensure_indexed()?;

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

fn cmd_stats() -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let (sync_dir, conn) = ensure_indexed()?;

    let stats = storage::database::get_stats(&conn)?;

    // Calculate storage size
    let total_size: u64 = walkdir::WalkDir::new(&sync_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum();

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

fn cmd_reindex() -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    let sync_dir = ensure_init()?;
    let db_path = sync_dir.join(".metadata").join("index.db");

    // Delete existing db and rebuild
    if db_path.exists() {
        std::fs::remove_file(&db_path)?;
    }

    let conn = storage::database::open_or_create(&db_path)?;
    let count = storage::database::build_index(&conn, &sync_dir)?;
    println!(
        "  {} {}",
        style("✓").green(),
        t.index_rebuilt(count as usize)
    );

    Ok(())
}
