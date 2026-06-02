use anyhow::Result;
use std::path::Path;

use super::common::{ensure_init, print_sync_status};
use crate::{storage, utils};

pub fn cmd_sync(sync_dir: &Path) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    ensure_init(sync_dir)?;

    let has_remote = storage::git::has_remote(sync_dir);

    // First try commit + push
    let result = storage::git::commit_and_push(sync_dir, "auto: sync")?;
    if result.committed {
        print_sync_status(&result);
        if !result.pushed {
            if let Some(ref err) = result.push_error {
                println!("  {} {}", style("✗").red(), t.push_failed(err));
            }
        }
        return Ok(());
    }

    // No new changes to commit
    if !has_remote {
        println!("  {} {}", style("✓").green(), t.all_synced());
        return Ok(());
    }

    // Maybe there are unpushed commits
    if storage::git::has_unpushed(sync_dir) {
        let unpushed = storage::git::unpushed_count(sync_dir).unwrap_or(0);
        let count_label = if unpushed > 0 {
            t.pushing_commits(unpushed)
        } else {
            t.pushing_commits(0) // count unknown but there might be unpushed
        };
        println!("  {} {}", style("ℹ").blue(), count_label);

        let push_result = storage::git::push(sync_dir)?;
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

pub fn cmd_unpushed(sync_dir: &Path) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    ensure_init(sync_dir)?;

    let logs = storage::git::unpushed_log(sync_dir)?;
    if logs.is_empty() {
        println!("  {} {}", style("✓").green(), t.no_unpushed());
        return Ok(());
    }

    println!("\n  {}\n", t.unpushed_heading(logs.len()));
    for log in &logs {
        println!("  {}", log);
    }
    println!();
    let hint = t
        .push_hint()
        .replace("{}", &style("gitmemo sync").cyan().to_string());
    println!("  {}", hint);
    println!();

    Ok(())
}

pub fn cmd_branch(sync_dir: &Path, name: Option<String>) -> Result<()> {
    use console::style;
    let t = utils::i18n::get();
    ensure_init(sync_dir)?;

    let config_path = utils::config::Config::config_path();
    let mut config = utils::config::Config::load(&config_path)?;

    match name {
        None => {
            // Show current branch
            println!("  {}", t.branch_current(&config.git.branch));
        }
        Some(new_branch) => {
            let old_branch = config.git.branch.clone();
            if old_branch == new_branch {
                println!("  {} {}", style("ℹ").blue(), t.branch_same(&new_branch));
                return Ok(());
            }

            // Update config
            config.git.branch = new_branch.clone();
            config.save(&config_path)?;

            // Update git upstream tracking
            storage::git::setup_tracking(sync_dir, &new_branch);

            println!(
                "  {} {}",
                style("✓").green(),
                t.branch_switched(&old_branch, &new_branch)
            );
        }
    }

    Ok(())
}

pub fn cmd_remote(sync_dir: &Path, url: Option<String>, remove: bool) -> Result<()> {
    use console::style;
    use dialoguer::Select;
    let t = utils::i18n::get();
    ensure_init(sync_dir)?;

    let config_path = utils::config::Config::config_path();
    let mut config = utils::config::Config::load(&config_path)?;

    if remove {
        config.git.remote = String::new();
        config.save(&config_path)?;
        let _ = std::process::Command::new("git")
            .args(["remote", "remove", "origin"])
            .current_dir(sync_dir)
            .output();
        println!("  {} {}", style("✓").green(), t.remote_removed());
        return Ok(());
    }

    match url {
        None => {
            if config.has_remote() {
                println!("  {}", t.remote_current(&config.git.remote));
            } else {
                println!("  {}", t.remote_none());
            }
        }
        Some(new_url) => {
            if config.git.remote == new_url {
                println!("  {} {}", style("ℹ").blue(), t.remote_same(&new_url));
                return Ok(());
            }

            // Suggest SSH if HTTPS
            let new_url = if !utils::ssh::is_ssh_url(&new_url) {
                if let Some(ssh_url) = utils::ssh::https_to_ssh(&new_url) {
                    println!();
                    println!("  {} {}", style("ℹ").yellow(), t.ssh_url_recommended());
                    println!("    HTTPS: {}", style(&new_url).dim());
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
                        _ => new_url,
                    }
                } else {
                    new_url
                }
            } else {
                new_url
            };

            // SSH key check
            let (key_path, is_new_key) = utils::ssh::find_or_generate_key_for_git_url(&new_url)?;
            let pub_key = utils::ssh::read_public_key(&key_path)?;
            if is_new_key {
                println!("  {} {}", style("✓").green(), t.ssh_key_generated());
            }

            // Update git remote
            storage::git::init_repo(sync_dir, &new_url)?;

            // Detect branch and update config
            let branch = storage::git::detect_remote_branch(sync_dir);
            config.git.remote = new_url.clone();
            config.git.branch = branch.clone();
            config.save(&config_path)?;
            storage::git::setup_tracking(sync_dir, &branch);
            println!("  {} {}", style("✓").green(), t.remote_set_ok());

            // Test SSH connection
            if utils::ssh::is_ssh_url(&new_url) {
                print!("  {} {}...", style("⟳").blue(), t.testing_ssh());
                match utils::ssh::test_ssh_connection(&key_path, &new_url) {
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
                        println!("  {}", style(&pub_key).dim());
                        println!();
                        if let Some(keys_url) = utils::ssh::deploy_keys_url(&new_url) {
                            println!("  {} {}", style("→").yellow(), t.opening_browser());
                            utils::ssh::open_browser(&keys_url);
                        }
                        return Ok(());
                    }
                    Ok(utils::ssh::SshTestResult::ConnectionFailed(msg)) => {
                        println!(
                            "\r  {} {}  ",
                            style("✗").red(),
                            t.ssh_test_connection_failed()
                        );
                        println!("    {}", style(&msg).dim());
                        return Ok(());
                    }
                    _ => {}
                }
            }

            // Push all local commits
            println!("  {} {}", style("⟳").blue(), t.remote_pushing());
            let push_result = storage::git::push(sync_dir)?;
            if push_result.pushed {
                println!("  {} {}", style("✓").green(), t.synced_to_git());
            } else if let Some(ref err) = push_result.push_error {
                if !err.contains("up-to-date") && !err.contains("up to date") {
                    println!("  {} {}", style("⚠").yellow(), t.push_failed(err));
                } else {
                    println!("  {} {}", style("✓").green(), t.all_synced());
                }
            }
        }
    }

    Ok(())
}
