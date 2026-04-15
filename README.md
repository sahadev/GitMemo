# GitMemo

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub Release](https://img.shields.io/github/v/release/sahadev/GitMemo?logo=github&label=release)](https://github.com/sahadev/GitMemo/releases/latest)
[![GitHub Issues](https://img.shields.io/github/issues/sahadev/GitMemo?logo=github)](https://github.com/sahadev/GitMemo/issues)

[English](README.md) | [中文](README_CN.md)

## Introduction

> **Your AI chats and notes sync automatically to Git.** GitMemo helps you turn AI conversations, notes, and everyday work into a Git-backed personal knowledge repo.

Available as both a CLI and a Desktop app, with a local-first workflow for Claude Code and Cursor users.

## Features

- **Git-backed knowledge repo** — AI conversations, notes, and everyday work flow into one directory managed by Git; remote sync stays optional
- **Auto-save for supported editor workflows** — Claude Code and Cursor conversations can be saved as Markdown with GitMemo’s configured rules and skills
- **Search and reuse** — Search saved material from the CLI, Desktop, or MCP instead of losing it in chat history
- **Multi-editor** — Supports both Claude Code and Cursor
- **Notes** — Scratch notes, daily journal, manuals — one command to create
- **Clipboard capture** — Optional Desktop monitoring captures local clipboard text and images when enabled
- **No always-on sync daemon for editor capture** — Editor-side capture relies on native hooks and integrations rather than a separate sync service
- **Data ownership** — Your content lives in **your** Git repo; local indexes and helpers are explained in the [Data & storage statement](docs/DATA-STATEMENT.md)

## Environment & dependencies

- **Git (local CLI)**: Required to initialize the sync repo and run `commit` / `push` workflows. A **remote** is **not** required—you can stay local-only until you want to sync copies to another machine or a cloud Git host.
- **Claude Code / Cursor**: **Not** a prerequisite to install GitMemo. Add **at least one** during `gitmemo init` only when you want **automatic capture from the editor**, hooks, and MCP. You can start with CLI notes and sync, then run `init` again later to add an editor.
- **Hosted Git remote** (GitHub / GitLab / Gitee / self-hosted): **Always optional**.

## Quick Start

### Install

#### GitMemo Desktop (macOS) — start here for the GUI

1. **Download**: open **[GitHub Releases · Latest](https://github.com/sahadev/GitMemo/releases/latest)**, expand **Assets**, and pick the **Desktop** build:  
   - Prefer **`.dmg`** (drag into Applications), or  
   - **`.app.tar.gz`** (extract to get `.app`; filenames change each release — look for **desktop** / **GitMemo** in the asset name).  
   **Linux / Windows**: this repository does **not** ship Desktop installers yet; use **CLI install** below (Linux CLI binaries are published).
2. **First-time setup**: finish initialization once—**use the guided setup inside GitMemo Desktop**, or install the **CLI** below and run **`gitmemo init`** in a terminal if you prefer. This creates `~/.gitmemo` and optionally wires Claude / Cursor. After that you can stay mostly in Desktop for browsing, search, and clipboard.

> **Before you install Desktop**: current macOS Desktop builds are **not yet Apple-signed / notarized**. On some Macs, Gatekeeper may warn, report the app as damaged, or block launch until you clear the quarantine attribute. If you prefer a smoother first-run path or do not want to handle macOS security prompts, use the **CLI version first**.
>
> **macOS Gatekeeper**: if the app is reported damaged or won’t open, run `xattr -cr /Applications/GitMemo.app` (adjust the path). For the CLI binary only: `xattr -cr /usr/local/bin/gitmemo`.

#### CLI install (macOS & Linux)

One-line installer (installs / updates the `gitmemo` CLI and related pieces the script manages):

```bash
# One-line install (auto-detects your platform)
bash <(curl -fsSL https://github.com/sahadev/GitMemo/raw/main/scripts/install.sh)
```

<details>
<summary>Manual CLI download / Build from source</summary>

From **[Releases · Latest](https://github.com/sahadev/GitMemo/releases/latest)** → **Assets**, download the **CLI** binary for your platform (e.g. `gitmemo-macos-aarch64`), then:

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

Follow the prompts: choose your editor, enter your Git remote URL (or press Enter to skip for local-only mode). If using a remote repo, add the generated SSH public key to your repo's Deploy Keys.

### After setup

After initialization, conversations, notes, and other supported sources flow into your sync directory and into Git. In **Claude** or **Cursor**, type **`/save`** to save the current session manually (after `init` installed the save skill for that editor); auto-save also runs for supported workflows under your configured rules. If nothing happens, restart the editor session.

### Desktop App

**Installer**: see **Install → GitMemo Desktop (macOS)** above, or go straight to **[Releases · Latest](https://github.com/sahadev/GitMemo/releases/latest)**. After initialization, open GitMemo Desktop and it will read the same sync directory as the CLI (usually `~/.gitmemo`).

- **Dashboard** with stats, sync status, recent activity feed, and clipboard monitoring indicator
- **Full-text search** across conversations, notes, clips, plans, and config
- **Clipboard monitor** with text and image capture, thumbnail previews
- **System notifications** via macOS Notification Center (sync errors, clipboard captures)
- **Quick Paste** floating window (Cmd+Shift+Space) for command palette access
- **System tray** with quick actions (Open/Sync/Clipboard/Quit)
- **Diagnostics**: update-check events are logged with the `[updater]` prefix to `gitmemo.log` (on macOS, under `~/Library/Logs/` in the app’s log folder; you can also search for GitMemo in Console)
- Plans created by Claude Code and Cursor are both imported into `plans/`
- Current desktop packages target **macOS only** (Apple Silicon + Intel)
- Current Desktop builds are **not yet Apple-signed / notarized**; if you want the lowest-friction first install, prefer the **CLI** first and add Desktop later
- You don’t need a terminal day-to-day; **first-time setup can finish inside the app**, or you can use the CLI to run `gitmemo init`. The CLI is also handy for `gitmemo note`, `sync`, and other commands

### How Conversations Are Saved

In **Claude** or **Cursor**, type **`/save`** to save the current session (when the save skill from `gitmemo init` is present). On the Claude side, many turns also auto-save under your rules. If a session was missed, **`/save`** catches it.

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
gitmemo remote             # Show current remote repository
gitmemo remote <url>       # Set remote repository (enables sync)
gitmemo remote --remove    # Remove remote (switch to local-only)
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
├── conversations/          # Auto-recorded AI chats + optional Q&A summaries (same `YYYY-MM` layout)
│   └── 2026-03/
│       └── 03-25-rust-async.md
├── notes/
│   ├── daily/              # Daily journal
│   ├── manual/             # Long-form manuals & research docs
│   └── scratch/            # Quick scratch notes
├── clips/                  # Auto-captured clipboard content
│   └── 2026-03-25/
├── plans/                  # Implementation plans from Plan Mode
├── imports/                # Drag-and-drop imported files
├── claude-config/          # Claude-related config & memory synced here
│   ├── CLAUDE.md           # Global Claude instructions
│   ├── memory/             # Claude's auto-memory
│   ├── skills/             # Custom skills
│   └── projects/           # Per-project memory
└── .metadata/              # Search index (not synced)
```

Your knowledge files are plain Markdown (and similar) and readable in any editor. The `.metadata/` folder holds local config and the search index—see **[Data & storage statement](docs/DATA-STATEMENT.md)**. Tracked content remains in your Git repo after uninstalling the app.

## What Gets Auto-Captured

GitMemo can capture and organize **8 types** of knowledge from supported workflows:

| Type | What | Where |
|------|------|-------|
| **Conversations** | Every AI chat session | `conversations/` |
| **Plans** | Implementation plans from Plan Mode | `plans/` |
| **Research & Analysis** | Competitive analysis, tech research | `notes/manual/` |
| **Design Docs** | Architecture designs, API specs | `notes/manual/` |
| **Clipboard** | Text snippets, code, URLs (auto) | `clips/` |
| **Imported Files** | Drag & drop — Markdown, code, PDFs | `imports/` |
| **AI Memory** | Claude's auto-memory & project context | `claude-config/memory/` |
| **Skills & Config** | Custom skills, CLAUDE.md instructions | `claude-config/skills/` |

No manual copying. No export buttons. Supported sources can flow into your sync directory and be tracked by Git automatically.

## Supported Editors

| Editor | System Instruction | Git Sync | MCP |
|--------|-------------------|----------|-----|
| **Claude Code** | `CLAUDE.md` | PostToolUse Hook (automatic) | `~/.claude.json` |
| **Cursor** | Cursor Rules (`.mdc`) | `cds_sync` MCP tool | `~/.cursor/mcp.json` |

## How It Works

For Claude Code and Cursor capture flows, GitMemo avoids an extra sync daemon and instead integrates with each editor's native mechanisms:

**Claude Code:**

| Injection Point | What It Does |
|----------------|--------------|
| `CLAUDE.md` instruction | Tells Claude to auto-save conversations as Markdown |
| `settings.json` Hook | Auto `git commit && git push` after each file write |
| `~/.claude/skills/save` | `/save` skill for explicit “save conversation” triggers |
| `~/.claude/skills/gitmemo-session-log` | Same as Cursor: substantive Q&A summaries → `<sync>/conversations/YYYY-MM/` (same naming as auto-saved chats) |
| MCP Server | Enables Claude to search history and create notes |

**Cursor:**

| Injection Point | What It Does |
|----------------|--------------|
| `~/.cursor/rules/gitmemo.mdc` | Global Cursor rule (`alwaysApply: true`) — written on **every** `gitmemo init`, regardless of editor choice; for **substantial** product/technical plans, also write to `<sync>/notes/manual/` **in the same turn**, without the user having to say "save" |
| `~/.cursor/skills/save` | `/save` skill metadata for “save conversation” triggers |
| `~/.cursor/skills/gitmemo-session-log` | Optional-style skill: save substantive Q&A summaries under `<sync>/conversations/YYYY-MM/` (same path rule as chats, not the open project repo) |
| `cds_sync` MCP tool | AI calls this after saving to trigger git sync (only when you pick Cursor at init and omit `--no-mcp`) |
| MCP Server | Enables AI to search history and create notes |

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
cargo run --help
```

## License

MIT
