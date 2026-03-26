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

    match cli.command {
        Commands::Init { git_url, path, no_mcp, editor } => {
            cmd_init(git_url, path, no_mcp, editor)?;
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

fn cmd_init(git_url: Option<String>, path: Option<String>, no_mcp: bool, editor: Option<String>) -> Result<()> {
    use console::style;
    use dialoguer::{Input, Select};

    let default_sync_dir = storage::files::sync_dir();

    println!("\n{}", style("GitMemo 初始化").bold().cyan());
    println!();

    // 0. Determine target editor(s)
    let editor_choice = match editor.as_deref() {
        Some("claude") => EditorChoice::Claude,
        Some("cursor") => EditorChoice::Cursor,
        Some("all") => EditorChoice::All,
        Some(other) => anyhow::bail!("不支持的编辑器: {}。可选: claude, cursor, all", other),
        None => {
            let options = vec!["Claude Code", "Cursor", "两者都安装"];
            let selection = Select::new()
                .with_prompt("选择要配置的编辑器")
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
            anyhow::bail!("{} 不是一个 Git 仓库", real_path.display());
        }

        // Create symlink if needed
        if default_sync_dir.exists() || default_sync_dir.symlink_metadata().is_ok() {
            std::fs::remove_file(&default_sync_dir).ok();
            std::fs::remove_dir(&default_sync_dir).ok();
        }
        std::os::unix::fs::symlink(&real_path, &default_sync_dir)?;
        println!(
            "  {} 链接到已有仓库: {} → {}",
            style("✓").green(),
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
                            "  {} 检测到已有远程: {}",
                            style("ℹ").blue(),
                            existing_url
                        );
                        existing_url.to_string()
                    } else {
                        Input::new().with_prompt("Git 仓库地址").interact_text()?
                    }
                } else {
                    Input::new().with_prompt("Git 仓库地址").interact_text()?
                }
            } else {
                Input::new().with_prompt("Git 仓库地址").interact_text()?
            }
        }
    };

    // 3. Create directory structure (safe for existing dirs)
    storage::files::create_directory_structure(&sync_dir)?;
    println!("  {} 目录结构就绪", style("✓").green());

    // 4. Init or open git repo
    storage::git::init_repo(&sync_dir, &url)?;
    println!("  {} Git 仓库就绪", style("✓").green());

    // 4. Generate SSH key (skip if exists)
    let ssh_dir = sync_dir.join(".ssh");
    let (key_path, is_new_key) = utils::ssh::generate_key(&ssh_dir)?;
    let pub_key = utils::ssh::read_public_key(&key_path)?;
    if is_new_key {
        println!("  {} SSH 密钥已生成", style("✓").green());
    } else {
        println!("  {} SSH 密钥已存在，跳过生成", style("✓").green());
    }

    // 5. Backup existing configs before injection
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
    println!("  {} 原始配置已备份", style("✓").green());

    // 6. Inject editor-specific configs
    if install_claude {
        inject::claude_md::inject(&claude_md_path, &sync_dir_str)?;
        println!("  {} CLAUDE.md 指令已注入", style("✓").green());

        inject::settings_hook::inject(&settings_path, &sync_dir_str)?;
        println!("  {} Git 同步 Hook 已注入", style("✓").green());

        if !no_mcp {
            let binary = std::env::current_exe()?.to_string_lossy().to_string();
            inject::mcp_register::register(&claude_json_path, &binary)?;
            println!("  {} Claude MCP Server 已注册", style("✓").green());
        }

        // Install /save skill
        let skill_dir = dirs::home_dir().unwrap().join(".claude").join("skills").join("save");
        std::fs::create_dir_all(&skill_dir)?;
        std::fs::write(
            skill_dir.join("SKILL.md"),
            include_str!("../skills/save/SKILL.md"),
        )?;
        println!("  {} /save 快捷命令已安装", style("✓").green());
    }

    if install_cursor {
        inject::cursor_rules::inject(&cursor_rules_path, &sync_dir_str)?;
        println!("  {} Cursor Rules 已注入", style("✓").green());

        if !no_mcp {
            let binary = std::env::current_exe()?.to_string_lossy().to_string();
            inject::cursor_mcp::register(&cursor_mcp_path, &binary)?;
            println!("  {} Cursor MCP Server 已注册", style("✓").green());
        }
    }

    // 9. Save config
    let config = utils::config::Config {
        git: utils::config::GitConfig {
            remote: url,
            branch: "main".to_string(),
        },
    };
    config.save(&utils::config::Config::config_path())?;

    // 9. Initial commit
    storage::git::commit_and_push(&sync_dir, "init: gitmemo")?;

    // 10. Show public key and next steps
    println!();
    if is_new_key {
        println!(
            "  {} 请将以下公钥添加到仓库的 Deploy Keys（允许写入）：",
            style("→").yellow()
        );
        println!();
        println!("  {}", style(&pub_key).dim());
        println!();
    }
    println!(
        "  {}",
        style("一切就绪！").green().bold()
    );
    println!();
    println!("  下一步：");
    if install_claude {
        println!("    1. {} 重启 Claude 会话（使配置生效）", style("必须").bold());
        println!("    2. 在 Claude 中输入 {} 保存当前会话", style("/save").cyan());
    }
    if install_cursor {
        println!("    1. {} 重启 Cursor（使配置生效）", style("必须").bold());
        println!("    2. 对话保存后会自动通过 MCP 同步到 Git", );
    }
    println!();
    println!("  验证是否生效：");
    println!("    {} 手动测试", style("gitmemo note \"hello world\"").cyan());
    println!("    {} 查看状态", style("gitmemo status").cyan());
    println!();

    Ok(())
}

fn cmd_uninstall(remove_data: bool) -> Result<()> {
    use console::style;

    println!("\n{}", style("GitMemo 卸载").bold().cyan());

    // Remove Claude Code configs
    let claude_md_path = dirs::home_dir().unwrap().join(".claude").join("CLAUDE.md");
    inject::claude_md::remove(&claude_md_path)?;
    println!("  {} CLAUDE.md 指令已移除", style("✓").green());

    let settings_path = dirs::home_dir()
        .unwrap()
        .join(".claude")
        .join("settings.json");
    inject::settings_hook::remove(&settings_path)?;
    println!("  {} Git 同步 Hook 已移除", style("✓").green());

    let claude_json_path = dirs::home_dir().unwrap().join(".claude.json");
    inject::mcp_register::unregister(&claude_json_path)?;
    println!("  {} Claude MCP Server 已移除", style("✓").green());

    let skill_dir = dirs::home_dir().unwrap().join(".claude").join("skills").join("save");
    if skill_dir.exists() {
        std::fs::remove_dir_all(&skill_dir)?;
        println!("  {} /save 快捷命令已移除", style("✓").green());
    }

    // Remove Cursor configs
    let cursor_rules_path = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("rules")
        .join("gitmemo.mdc");
    inject::cursor_rules::remove(&cursor_rules_path)?;
    println!("  {} Cursor Rules 已移除", style("✓").green());

    let cursor_mcp_path = dirs::home_dir()
        .unwrap()
        .join(".cursor")
        .join("mcp.json");
    inject::cursor_mcp::unregister(&cursor_mcp_path)?;
    println!("  {} Cursor MCP Server 已移除", style("✓").green());

    if remove_data {
        let sync_dir = storage::files::sync_dir();
        if sync_dir.exists() {
            std::fs::remove_dir_all(&sync_dir)?;
            println!(
                "  {} 数据目录已删除: {}",
                style("✓").green(),
                sync_dir.display()
            );
        }
    } else {
        println!(
            "  {} 数据已保留在 {}",
            style("ℹ").blue(),
            storage::files::sync_dir().display()
        );
    }

    println!();
    Ok(())
}

fn cmd_status() -> Result<()> {
    use console::style;

    let sync_dir = storage::files::sync_dir();

    println!("\n{}", style("GitMemo 状态").bold().cyan());
    println!();

    if !sync_dir.exists() {
        println!(
            "  未初始化。运行 {} 开始。",
            style("gitmemo init").bold()
        );
        return Ok(());
    }

    println!("  数据目录: {} {}", sync_dir.display(), style("✓").green());

    // Check config
    let config_path = utils::config::Config::config_path();
    if config_path.exists() {
        let config = utils::config::Config::load(&config_path)?;
        println!("  Git 远程: {}", config.git.remote);
        println!("  Git 分支: {}", config.git.branch);
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

    println!("  对话记录: {} 条", conv_count);
    println!("  笔记: {} 条", note_count);

    // Show unpushed count
    let unpushed = storage::git::unpushed_count(&sync_dir).unwrap_or(0);
    if unpushed > 0 {
        println!(
            "  未推送: {} 条提交（运行 {} 推送）",
            style(unpushed).yellow(),
            style("gitmemo sync").cyan()
        );
    } else {
        println!("  同步状态: {} 已同步", style("✓").green());
    }
    println!();

    Ok(())
}

fn ensure_init() -> Result<std::path::PathBuf> {
    let sync_dir = storage::files::sync_dir();
    if !sync_dir.exists() {
        anyhow::bail!(
            "未初始化。请先运行 gitmemo init"
        );
    }
    Ok(sync_dir)
}

fn cmd_sync() -> Result<()> {
    use console::style;
    let sync_dir = ensure_init()?;

    // First try commit + push
    let result = storage::git::commit_and_push(&sync_dir, "auto: sync")?;
    if result.committed {
        print_sync_status(&result);
        return Ok(());
    }

    // No new changes to commit, but maybe there are unpushed commits
    let unpushed = storage::git::unpushed_count(&sync_dir)?;
    if unpushed > 0 {
        println!("  {} {} 条未推送的提交，正在推送...", style("ℹ").blue(), unpushed);
        let push_result = storage::git::push(&sync_dir)?;
        if push_result.pushed {
            println!("  {} 已推送 {} 条提交", style("✓").green(), unpushed);
        } else if let Some(ref err) = push_result.push_error {
            println!("  {} 推送失败: {}", style("✗").red(), err);
        }
    } else {
        println!("  {} 一切已同步，无需操作", style("✓").green());
    }

    Ok(())
}

fn cmd_unpushed() -> Result<()> {
    use console::style;
    let sync_dir = ensure_init()?;

    let logs = storage::git::unpushed_log(&sync_dir)?;
    if logs.is_empty() {
        println!("  {} 没有未推送的提交", style("✓").green());
        return Ok(());
    }

    println!(
        "\n  {} {} 条未推送的提交：\n",
        style("⚠").yellow(),
        logs.len()
    );
    for log in &logs {
        println!("  {}", log);
    }
    println!();
    println!("  运行 {} 推送到远程", style("gitmemo sync").cyan());
    println!();

    Ok(())
}

fn print_sync_status(result: &storage::git::SyncResult) {
    use console::style;
    if !result.committed {
        println!("  {} 无变更需要提交", style("ℹ").blue());
        return;
    }
    if result.pushed {
        println!("  {} 已同步到 Git", style("✓").green());
    } else if let Some(ref err) = result.push_error {
        println!("  {} 已提交，但推送失败: {}", style("⚠").yellow(), style(err).dim());
        println!("    运行 {} 重试推送", style("gitmemo sync").cyan());
    } else {
        println!("  {} 已提交，推送中...", style("ℹ").blue());
    }
}

fn cmd_note(content: &str) -> Result<()> {
    use console::style;
    let sync_dir = ensure_init()?;
    let rel_path = storage::files::create_scratch(&sync_dir, content)?;
    let result = storage::git::commit_and_push(&sync_dir, &format!("note: {}", &content[..content.len().min(50)]))?;
    println!("  {} 便签已创建: {}", style("✓").green(), rel_path);
    print_sync_status(&result);
    Ok(())
}

fn cmd_daily(content: Option<String>) -> Result<()> {
    use console::style;
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
            println!("  {} 今日笔记已保存", style("✓").green());
            return Ok(());
        }
    };

    let rel_path = storage::files::append_daily(&sync_dir, &text)?;
    let result = storage::git::commit_and_push(&sync_dir, &format!("daily: {}", &text[..text.len().min(50)]))?;
    println!("  {} 已追加到今日笔记: {}", style("✓").green(), rel_path);
    print_sync_status(&result);
    Ok(())
}

fn cmd_manual(title: &str, content: Option<String>, append: bool) -> Result<()> {
    use console::style;
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
        println!("  内容为空，跳过。");
        return Ok(());
    }

    let rel_path = storage::files::write_manual(&sync_dir, title, &text, append)?;
    let action = if append { "update" } else { "create" };
    let result = storage::git::commit_and_push(&sync_dir, &format!("manual: {} {}", action, title))?;
    println!("  {} 手册已保存: {}", style("✓").green(), rel_path);
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
    let (_sync_dir, conn) = ensure_indexed()?;

    let results = storage::database::search(&conn, query, type_filter, limit)?;

    if results.is_empty() {
        println!("  未找到匹配 \"{}\" 的结果。", query);
        return Ok(());
    }

    println!(
        "\n  {} 找到 {} 条结果：\n",
        style("🔍").bold(),
        results.len()
    );

    for (i, r) in results.iter().enumerate() {
        let type_badge = if r.source_type == "conversation" {
            style("对话").cyan()
        } else {
            style("笔记").yellow()
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
    let (_sync_dir, conn) = ensure_indexed()?;

    let results = storage::database::recent(&conn, limit, days)?;

    if results.is_empty() {
        println!("  最近 {} 天没有对话记录。", days);
        return Ok(());
    }

    println!("\n  {} 最近 {} 天的对话：\n", style("📋").bold(), days);

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

    println!("\n{}", style("GitMemo 统计").bold().cyan());
    println!();
    println!("  对话记录:  {} 条", stats.conversation_count);
    println!("  每日笔记:  {} 条", stats.note_daily_count);
    println!("  手册:      {} 条", stats.note_manual_count);
    println!("  便签:      {} 条", stats.note_scratch_count);
    println!(
        "  存储大小:  {:.1} KB",
        total_size as f64 / 1024.0
    );
    println!();

    Ok(())
}

fn cmd_reindex() -> Result<()> {
    use console::style;
    let sync_dir = ensure_init()?;
    let db_path = sync_dir.join(".metadata").join("index.db");

    // Delete existing db and rebuild
    if db_path.exists() {
        std::fs::remove_file(&db_path)?;
    }

    let conn = storage::database::open_or_create(&db_path)?;
    let count = storage::database::build_index(&conn, &sync_dir)?;
    println!(
        "  {} 索引已重建，共 {} 个文件",
        style("✓").green(),
        count
    );

    Ok(())
}
