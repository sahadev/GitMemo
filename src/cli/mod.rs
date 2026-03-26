use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "gitmemo",
    about = "Auto-sync your AI conversations and notes to Git",
    version
)]
pub struct Cli {
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

        /// Target editor: claude, cursor, or all (interactive if omitted)
        #[arg(long)]
        editor: Option<String>,
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
}
