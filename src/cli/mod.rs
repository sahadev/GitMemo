use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "gitmemo",
    about = "Auto-sync your AI conversations and notes to Git",
    version = env!("CARGO_PKG_VERSION"),
    disable_version_flag = true
)]
pub struct Cli {
    /// Print version (same as -V / --version; clap default is only -V, many users type -v)
    #[arg(
        short = 'v',
        visible_short_alias = 'V',
        long = "version",
        global = true,
        action = clap::ArgAction::Version
    )]
    _version: Option<bool>,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Initialize: create Git repo, inject editor configs
    Init {
        /// Git remote URL (interactive if omitted)
        #[arg(long)]
        git_url: Option<String>,

        /// Use an existing local repo (creates symlink to ~/.gitmemo)
        #[arg(long)]
        path: Option<String>,

        /// Skip MCP server registration
        #[arg(long)]
        no_mcp: bool,

        /// Target editor: claude, cursor, codex, or all (interactive if omitted)
        #[arg(long)]
        editor: Option<String>,

        /// Language: en or zh (interactive if omitted)
        #[arg(long)]
        lang: Option<String>,
    },

    /// Remove injected configs (keeps data by default)
    Uninstall {
        /// Also delete ~/.gitmemo/ data
        #[arg(long)]
        remove_data: bool,
    },

    /// Create a scratch note
    Note {
        /// Note content
        content: String,
    },

    /// Open or append to today's daily note
    Daily {
        /// Content to append (opens editor if omitted)
        content: Option<String>,
    },

    /// Create or append to a manual
    Manual {
        /// Manual title
        title: String,

        /// Content (opens editor if omitted)
        content: Option<String>,

        /// Append to existing manual instead of creating new
        #[arg(long)]
        append: bool,
    },

    /// Search conversations and notes
    Search {
        /// Search query
        query: String,

        /// Filter by type: all, conversation, note
        #[arg(long, default_value = "all")]
        r#type: String,

        /// Max results
        #[arg(long, default_value = "10")]
        limit: usize,
    },

    /// List recent conversations
    Recent {
        /// Number of results
        #[arg(long, default_value = "10")]
        limit: usize,

        /// Days to look back
        #[arg(long, default_value = "7")]
        days: u32,
    },

    /// Show statistics
    Stats,

    /// Rebuild search index
    Reindex,

    /// Start MCP server (called by Claude Code, not user)
    #[command(hide = true)]
    McpServe,

    /// Show config and sync status
    Status,

    /// Sync local changes to Git (commit + push)
    Sync,

    /// Show unpushed commits
    Unpushed,

    /// Show or set the sync branch (e.g. `gitmemo branch main`)
    Branch {
        /// Branch name to set. Omit to show current branch.
        name: Option<String>,
    },

    /// Show, set, or remove the remote Git repository
    Remote {
        /// Remote URL to set. Omit to show current remote.
        url: Option<String>,

        /// Remove remote and switch to local-only mode
        #[arg(long)]
        remove: bool,
    },

    /// Capture conversations from Claude Code and Codex session logs
    #[command(version)]
    Capture {
        /// Only capture sessions from a specific project path
        #[arg(long)]
        project: Option<String>,

        /// Show what would be captured without writing
        #[arg(long)]
        dry_run: bool,

        /// Suppress output (for use in hooks)
        #[arg(long)]
        quiet: bool,
    },

    /// Upgrade gitmemo to the latest version
    Upgrade {
        /// Show available version without installing
        #[arg(long)]
        check: bool,
    },
}
