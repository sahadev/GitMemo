use anyhow::Result;

use crate::{inject, platform, storage, utils};

#[derive(Debug, Clone, Copy)]
enum EditorChoice {
    Claude,
    Cursor,
    Codex,
    All,
}

pub fn cmd_init(
    git_url: Option<String>,
    path: Option<String>,
    no_mcp: bool,
    editor: Option<String>,
    lang_arg: Option<String>,
) -> Result<()> {
    use console::style;
    use dialoguer::{Input, Select};
    use utils::i18n::{self, Lang};

    let default_sync_dir = storage::files::sync_dir();

    // 0a. Determine language (ask first, before anything else)
    let lang = match lang_arg.as_deref() {
        Some(l) => Lang::parse(l),
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
        Some("codex") => EditorChoice::Codex,
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
                2 => EditorChoice::Codex,
                _ => EditorChoice::All,
            }
        }
    };

    let install_claude = matches!(editor_choice, EditorChoice::Claude | EditorChoice::All);
    let install_cursor = matches!(editor_choice, EditorChoice::Cursor | EditorChoice::All);
    let install_codex = matches!(editor_choice, EditorChoice::Codex | EditorChoice::All);

    // 1. Handle --path: symlink existing repo
    let sync_dir = if let Some(ref repo_path) = path {
        let real_path = std::path::Path::new(repo_path).canonicalize()?;
        if !real_path.join(".git").exists() {
            anyhow::bail!(t.not_a_git_repo(&real_path.display().to_string()));
        }

        platform::link_sync_dir(&real_path, &default_sync_dir)?;
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

    // 2. Get Git URL (optional — empty means local-only mode)
    let url = match git_url {
        Some(u) => u,
        None => {
            // Try to read from existing repo
            let auto_detected = if let Ok(repo) = git2::Repository::open(&sync_dir) {
                if let Ok(remote) = repo.find_remote("origin") {
                    remote.url().map(|u| u.to_string())
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(existing_url) = auto_detected {
                println!(
                    "  {} {}: {}",
                    style("ℹ").blue(),
                    t.detected_remote(),
                    existing_url
                );
                existing_url
            } else {
                // Allow empty input for local-only mode
                let input: String = Input::new()
                    .with_prompt(t.git_url_prompt())
                    .allow_empty(true)
                    .interact_text()?;
                input
            }
        }
    };

    let has_remote = !url.is_empty();

    // 2b. If HTTPS URL provided, suggest SSH alternative
    let url = if has_remote && !utils::ssh::is_ssh_url(&url) {
        if let Some(ssh_url) = utils::ssh::https_to_ssh(&url) {
            println!();
            println!("  {} {}", style("ℹ").yellow(), t.ssh_url_recommended());
            println!("    HTTPS: {}", style(&url).dim());
            println!("    SSH:   {}", style(&ssh_url).cyan());
            println!();
            let options = vec![t.use_ssh_url(), t.keep_https_url()];
            let selection = Select::new()
                .with_prompt(t.choose_url_prompt())
                .items(&options)
                .default(0)
                .interact()?;
            match selection {
                0 => ssh_url,
                _ => url,
            }
        } else {
            url
        }
    } else {
        url
    };

    if !has_remote {
        println!("  {} {}", style("ℹ").blue(), t.local_mode_selected());
    }

    // 3. Create directory structure (safe for existing dirs)
    storage::files::create_directory_structure(&sync_dir)?;
    println!("  {} {}", style("✓").green(), t.dir_structure_ready());

    // 4. Init or open git repo
    storage::git::init_repo(&sync_dir, &url)?;
    println!("  {} {}", style("✓").green(), t.git_repo_ready());

    // 5. Find or generate SSH key (only if remote is configured)
    let key_path_and_pub = if has_remote {
        let (key_path, is_new_key) = utils::ssh::find_or_generate_key_for_git_url(&url)?;
        let pub_key = utils::ssh::read_public_key(&key_path)?;
        if is_new_key {
            println!(
                "  {} {} ({})",
                style("✓").green(),
                t.ssh_key_generated(),
                style(key_path.display()).dim()
            );
        } else {
            println!(
                "  {} {} ({})",
                style("✓").green(),
                t.ssh_key_exists(),
                style(key_path.display()).dim()
            );
        }
        Some((key_path, pub_key, is_new_key))
    } else {
        None
    };

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
    let cursor_mcp_path = dirs::home_dir().unwrap().join(".cursor").join("mcp.json");

    // Backup relevant configs
    for (src, name) in [
        (&claude_md_path, "CLAUDE.md.backup"),
        (&settings_path, "settings.json.backup"),
        (&claude_json_path, "claude.json.backup"),
        (&cursor_rules_path, "gitmemo.mdc.backup"),
        (&cursor_mcp_path, "cursor-mcp.json.backup"),
    ] {
        if src.exists() {
            std::fs::copy(src, backup_dir.join(name))?;
        }
    }
    println!("  {} {}", style("✓").green(), t.configs_backed_up());

    // 7a. Global Cursor rules + /save skill (~/.cursor/...) — always, so Cursor picks up GitMemo without re-running init
    inject::cursor_rules::inject(&cursor_rules_path, &sync_dir_str, lang)?;
    println!("  {} {}", style("✓").green(), t.cursor_rules_injected());

    let cursor_save_skill_dir = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("skills")
        .join("save");
    std::fs::create_dir_all(&cursor_save_skill_dir)?;
    std::fs::write(
        cursor_save_skill_dir.join("SKILL.md"),
        include_str!("../../skills/save/SKILL.md"),
    )?;
    println!(
        "  {} {}",
        style("✓").green(),
        t.cursor_save_skill_installed()
    );

    let cursor_session_log_dir = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("skills")
        .join("gitmemo-session-log");
    inject::session_log_skill::install(&cursor_session_log_dir, &sync_dir_str, lang)?;
    println!(
        "  {} {}",
        style("✓").green(),
        t.cursor_session_log_skill_installed()
    );

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
        let skill_dir = dirs::home_dir()
            .unwrap()
            .join(".claude")
            .join("skills")
            .join("save");
        std::fs::create_dir_all(&skill_dir)?;
        std::fs::write(
            skill_dir.join("SKILL.md"),
            include_str!("../../skills/save/SKILL.md"),
        )?;
        println!("  {} {}", style("✓").green(), t.save_skill_installed());

        let claude_session_log_dir = dirs::home_dir()
            .unwrap()
            .join(".claude")
            .join("skills")
            .join("gitmemo-session-log");
        inject::session_log_skill::install(&claude_session_log_dir, &sync_dir_str, lang)?;
        println!(
            "  {} {}",
            style("✓").green(),
            t.claude_session_log_skill_installed()
        );
    }

    if install_cursor && !no_mcp {
        let binary = std::env::current_exe()?.to_string_lossy().to_string();
        inject::cursor_mcp::register(&cursor_mcp_path, &binary)?;
        println!("  {} {}", style("✓").green(), t.cursor_mcp_registered());
    }

    if install_codex {
        println!("  {} {}", style("✓").green(), t.codex_capture_enabled());
    }

    // 8. Detect remote default branch (or default to "main") and save config
    let branch = if has_remote {
        storage::git::detect_remote_branch(&sync_dir)
    } else {
        "main".to_string()
    };
    let config = utils::config::Config {
        git: utils::config::GitConfig {
            remote: url.clone(),
            branch: branch.clone(),
            ssh_key_path: key_path_and_pub
                .as_ref()
                .map(|(key_path, _, _)| key_path.to_string_lossy().to_string()),
            access_token: None,
        },
        lang: lang.as_str().to_string(),
    };
    config.save(&utils::config::Config::config_path())?;

    // 9. Initial commit (push only if remote configured)
    storage::git::commit_and_push(&sync_dir, "init: gitmemo")?;
    if has_remote {
        storage::git::setup_tracking(&sync_dir, &branch);
    }

    // 10. Test SSH connection + open browser on failure (only if SSH URL)
    if has_remote && utils::ssh::is_ssh_url(&url) {
        if let Some((ref key_path, ref pub_key, _)) = key_path_and_pub {
            print!("  {} {}...", style("⟳").blue(), t.testing_ssh());
            match utils::ssh::test_ssh_connection(key_path, &url) {
                Ok(utils::ssh::SshTestResult::Success(msg)) => {
                    println!("\r  {} {}  ", style("✓").green(), t.ssh_test_ok());
                    if !msg.is_empty() {
                        println!("    {}", style(&msg).dim());
                    }
                }
                Ok(utils::ssh::SshTestResult::AuthFailed(_)) => {
                    println!("\r  {} {}  ", style("✗").red(), t.ssh_test_auth_failed());
                    println!();
                    println!("  {} {}", style("→").yellow(), t.deploy_key_hint());
                    println!();
                    println!("  {}", style(pub_key).dim());
                    println!();
                    // Try to open Deploy Keys page in browser
                    if let Some(keys_url) = utils::ssh::deploy_keys_url(&url) {
                        println!("  {} {}", style("→").yellow(), t.opening_browser());
                        utils::ssh::open_browser(&keys_url);
                    }
                }
                Ok(utils::ssh::SshTestResult::ConnectionFailed(msg)) => {
                    println!(
                        "\r  {} {}  ",
                        style("✗").red(),
                        t.ssh_test_connection_failed()
                    );
                    println!("    {}", style(&msg).dim());
                }
                Ok(utils::ssh::SshTestResult::NotSsh) => {}
                Ok(utils::ssh::SshTestResult::Unknown(msg)) => {
                    println!("\r  {} {}  ", style("⚠").yellow(), t.ssh_test_unknown());
                    if !msg.is_empty() {
                        println!("    {}", style(&msg).dim());
                    }
                }
                Err(e) => {
                    println!("\r  {} {} {}  ", style("⚠").yellow(), t.ssh_test_error(), e);
                }
            }
        }
    }

    // 11. Show public key and next steps
    println!();
    // Show deploy key hint for new key + non-SSH URL (SSH case already handled above)
    if let Some((_, ref pub_key, true)) = key_path_and_pub {
        if !utils::ssh::is_ssh_url(&url) {
            println!("  {} {}", style("→").yellow(), t.deploy_key_hint());
            println!();
            println!("  {}", style(pub_key).dim());
            println!();
        }
    }
    println!("  {}", style(t.all_set()).green().bold());
    println!();
    println!("  {}", t.next_steps());
    if install_claude {
        let step1 = t
            .claude_next_step_1()
            .replace("{}", &style("/save").cyan().to_string());
        println!("    1. {}", step1);
        println!("    2. {}", t.claude_next_step_2());
    }
    let cursor_step1 = t
        .cursor_next_step_1()
        .replace("{}", &style(t.recommend()).bold().to_string());
    println!("    {} {}", style("Cursor").cyan(), cursor_step1);
    if install_cursor {
        println!("    {} {}", style("Cursor").cyan(), t.cursor_next_step_2());
    }
    println!();
    println!("  {}", t.verify_heading());
    println!(
        "    {} {}",
        style("gitmemo note \"hello world\"").cyan(),
        t.verify_test()
    );
    println!(
        "    {} {}",
        style("gitmemo status").cyan(),
        t.verify_status()
    );
    println!();

    Ok(())
}

pub fn cmd_uninstall(remove_data: bool) -> Result<()> {
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

    let skill_dir = dirs::home_dir()
        .unwrap()
        .join(".claude")
        .join("skills")
        .join("save");
    if skill_dir.exists() {
        std::fs::remove_dir_all(&skill_dir)?;
        println!("  {} {}", style("✓").green(), t.save_skill_removed());
    }

    let claude_session_log_dir = dirs::home_dir()
        .unwrap()
        .join(".claude")
        .join("skills")
        .join("gitmemo-session-log");
    if claude_session_log_dir.exists() {
        std::fs::remove_dir_all(&claude_session_log_dir)?;
        println!(
            "  {} {}",
            style("✓").green(),
            t.claude_session_log_skill_removed()
        );
    }

    // Remove Cursor configs
    let cursor_rules_path = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("rules")
        .join("gitmemo.mdc");
    inject::cursor_rules::remove(&cursor_rules_path)?;
    println!("  {} {}", style("✓").green(), t.cursor_rules_removed());

    let cursor_save_skill_dir = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("skills")
        .join("save");
    if cursor_save_skill_dir.exists() {
        std::fs::remove_dir_all(&cursor_save_skill_dir)?;
        println!("  {} {}", style("✓").green(), t.cursor_save_skill_removed());
    }

    let cursor_session_log_dir = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("skills")
        .join("gitmemo-session-log");
    if cursor_session_log_dir.exists() {
        std::fs::remove_dir_all(&cursor_session_log_dir)?;
        println!(
            "  {} {}",
            style("✓").green(),
            t.cursor_session_log_skill_removed()
        );
    }

    let cursor_mcp_path = dirs::home_dir().unwrap().join(".cursor").join("mcp.json");
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
