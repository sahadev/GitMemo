# GitMemo — Claude Code Plugin

> Save AI conversations, notes, and project context into GitMemo.

GitMemo is a local-first, Git-native personal knowledge capture and reuse system. In Claude Code, it can save conversations, notes, branch summaries, project context, and long-form AI output as Markdown in a Git repository you control.

## What This Plugin Does

- **Auto-record** — Conversations saved as Markdown, completely transparent
- **Project scene archival** — Save branch names, task goals, progress, risks, and next actions for future AI sessions
- **Git sync** — Auto commit & push after each file write via native hooks
- **MCP integration** — Search history and create notes directly from Claude Code
- **Notes** — Scratch notes and manuals — one command to create
- **Zero daemon** — Powered by Claude Code's native PostToolUse hooks
- **Data ownership** — Your data stays in YOUR Git repo

## How It Works

GitMemo injects into Claude Code's native infrastructure:

| Injection Point | What It Does |
|----------------|--------------|
| `CLAUDE.md` instruction | Tells Claude to auto-save conversations as Markdown |
| `settings.json` Hook | Auto `git commit && git push` after each file write |
| MCP Server | Enables Claude to search history and create notes |

## Installation

### 1. Install GitMemo CLI

```bash
# One-line install (auto-detects your platform)
bash <(curl -fsSL https://github.com/sahadev/GitMemo/raw/main/scripts/install.sh)
```

Or download from [Releases](https://github.com/sahadev/GitMemo/releases/latest).

### 2. Initialize for Claude Code

```bash
gitmemo init --editor claude
```

Follow the prompts: enter your Git remote URL (or press Enter for local-only mode). If using a remote repo, add the generated SSH public key to your repo's Deploy Keys.

### 3. Verify

```bash
# Create a test note
gitmemo note "hello world"

# Check status
gitmemo status
```

Type `/save` in any Claude conversation to save the current session.

## MCP Tools

Once initialized, the following MCP tools are available in Claude Code:

| Tool | Description |
|------|-------------|
| `cds_search` | Full-text search across conversations and notes |
| `cds_recent` | List recent conversations |
| `cds_read` | Read a specific conversation or note file |
| `cds_note` | Create a scratch note |
| `cds_manual` | Create or update a manual |
| `cds_stats` | Show statistics |
| `cds_sync` | Trigger git sync |

## CLI Commands

```
gitmemo init               # Initialize configuration
gitmemo status             # Show config and sync status
gitmemo sync               # Sync local changes to Git
gitmemo remote             # Show/set remote repository
gitmemo note "quick note"  # Create a scratch note
gitmemo manual "Title"     # Create a manual
gitmemo search "keyword"   # Full-text search
gitmemo recent             # List recent conversations
gitmemo stats              # Show statistics
gitmemo uninstall          # Remove configs (keeps data)
```

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- Git
- A Git remote repository (GitHub / GitLab / Gitee / self-hosted) — optional, local-only mode is supported

## Data Structure

```
~/.gitmemo/
├── conversations/          # Auto-recorded AI conversations
│   └── 2026-03/
│       └── 03-25-rust-async.md
├── notes/
│   ├── manual/             # Long-form manuals
│   └── scratch/            # Quick scratch notes
└── .metadata/              # Search index (not synced)
```

All data is plain Markdown. Readable with any editor. Survives uninstall.

## Links

- [Homepage](https://git-memo.vercel.app/)
- [GitHub](https://github.com/sahadev/GitMemo)
- [Issues](https://github.com/sahadev/GitMemo/issues)
- [License: MIT](https://github.com/sahadev/GitMemo/blob/main/LICENSE)
