# GitMemo

[English](README.md) | [中文](README_CN.md)

> Auto-sync your AI conversations and notes to Git

GitMemo automatically records your conversations with Claude or Cursor (or any AI agent) as Markdown files and syncs them to a Git repository. Zero background process. Zero effort.

## Features

- **Auto-record** — Conversations saved as Markdown, completely transparent
- **Multi-editor** — Supports both Claude Code and Cursor
- **i18n** — English and Chinese interface, selectable during `gitmemo init`
- **Notes** — Scratch notes, daily journal, manuals — one command to create
- **Git sync** — Auto commit & push, branch management, cross-device access
- **MCP integration** — Search history and create notes directly from your AI editor
- **Zero daemon** — No background process, powered by native editor hooks
- **Data ownership** — Your data stays in YOUR Git repo

## Supported Editors

| Editor | System Instruction | Git Sync | MCP |
|--------|-------------------|----------|-----|
| **Claude Code** | `CLAUDE.md` | PostToolUse Hook (automatic) | `~/.claude.json` |
| **Cursor** | Cursor Rules (`.mdc`) | `cds_sync` MCP tool | `~/.cursor/mcp.json` |

## How It Works

GitMemo doesn't run as a background service. It injects into your editor's native infrastructure:

**Claude Code:**

| Injection Point | What It Does |
|----------------|--------------|
| `CLAUDE.md` instruction | Tells Claude to auto-save conversations as Markdown |
| `settings.json` Hook | Auto `git commit && git push` after each file write |
| MCP Server | Enables Claude to search history and create notes |

**Cursor:**

| Injection Point | What It Does |
|----------------|--------------|
| `~/.cursor/rules/gitmemo.mdc` | Tells AI to auto-save conversations as Markdown |
| `cds_sync` MCP tool | AI calls this after saving to trigger git sync |
| MCP Server | Enables AI to search history and create notes |

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (CLI) and/or [Cursor](https://cursor.com)
- Git
- A Git remote repository (GitHub / GitLab / Gitee / self-hosted)

## Quick Start

### Install

```bash
# One-line install (auto-detects your platform)
bash <(curl -fsSL https://github.com/sahadev/GitMemo/raw/main/scripts/install.sh)
```

> **macOS users**: If you see "app is damaged" or "can't be opened", run:
> ```bash
> xattr -cr /Applications/GitMemo.app
> # or for CLI binary:
> xattr -cr /usr/local/bin/gitmemo
> ```
> This is normal for unsigned apps — Apple requires a $99/year developer certificate for signing.

<details>
<summary>Manual download / Other install methods</summary>

Download the binary for your platform from [Releases](https://github.com/sahadev/GitMemo/releases/latest), then:

```bash
chmod +x gitmemo-macos-aarch64
sudo mv gitmemo-macos-aarch64 /usr/local/bin/gitmemo
```

Or build from source (requires Rust toolchain):

```bash
git clone https://github.com/sahadev/GitMemo.git
cd GitMemo
cargo install --path .
```

</details>

### Initialize

```bash
# New setup — interactive editor selection (Claude Code / Cursor / both)
gitmemo init

# Or specify the editor directly
gitmemo init --editor claude    # Claude Code only
gitmemo init --editor cursor    # Cursor only
gitmemo init --editor all       # Both

# Specify language (default: English)
gitmemo init --lang zh          # Chinese interface
gitmemo init --lang en          # English interface

# Link to an existing local Git repo
gitmemo init --path /path/to/your/repo
```

Follow the prompts: choose your editor, enter your Git remote URL (auto-detected for existing repos), add the generated SSH public key to your repo's Deploy Keys. Done.

### That's It

Your AI conversations will now auto-save to the Git repo. Try typing `/save` in Claude — it works without restarting. If it doesn't take effect, restart your editor session.

### How Conversations Are Saved

Type `/save` in any Claude conversation to save the current session. Claude may also auto-save after responses (driven by CLAUDE.md instruction, not guaranteed).

### Verify It Works

```bash
# Quick test — create a note
gitmemo note "hello world"

# Check status
gitmemo status
```

If you see the note file and git commit, it's working.

## Commands

```
gitmemo init               # Initialize configuration
gitmemo status             # Show config and sync status
gitmemo sync               # Sync local changes to Git (commit + push)
gitmemo branch             # Show current sync branch
gitmemo branch main        # Switch sync branch to "main"
gitmemo note "quick note"  # Create a scratch note
gitmemo daily              # Open/append daily journal
gitmemo manual "Title"     # Create a manual
gitmemo search "docker"    # Full-text search conversations and notes
gitmemo recent             # List recent conversations
gitmemo stats              # Show statistics
gitmemo unpushed           # Show unpushed commits
gitmemo reindex            # Rebuild search index
gitmemo uninstall          # Remove configs (keeps data)
```

## Data Structure

```
~/.gitmemo/
├── conversations/          # Auto-recorded AI conversations
│   └── 2026-03/
│       └── 03-25-rust-async.md
├── notes/
│   ├── daily/              # Daily journal
│   ├── manual/             # Long-form manuals
│   └── scratch/            # Quick scratch notes
└── .metadata/              # Search index (not synced)
```

All data is plain Markdown. Readable with any editor. Survives uninstall.

## Uninstall

```bash
# Remove injected configs, keep data
gitmemo uninstall

# Remove configs AND delete all data
gitmemo uninstall --remove-data
```

## Development

```bash
git clone https://github.com/sahadev/GitMemo.git
cd GitMemo
cargo build
cargo test
cargo run -- help
```

## License

MIT
