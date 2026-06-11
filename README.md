# GitMemo

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub Release](https://img.shields.io/github/v/release/sahadev/GitMemo?logo=github&label=release)](https://github.com/sahadev/GitMemo/releases/latest)
[![GitHub Issues](https://img.shields.io/github/issues/sahadev/GitMemo?logo=github)](https://github.com/sahadev/GitMemo/issues)

[English](README.md) | [中文](README_CN.md)

## Introduction

> **Turn temporary information into long-term knowledge that is searchable, syncable, and reusable.**

GitMemo is a local-first, Git-native personal knowledge capture and reuse system. It saves clipboard text, screenshots, Markdown, AI conversations, terminal output, external files, and ideas into a Git repository you control, so both you and AI tools can search, read, sync, export, and build on them. Supported AI working preferences and editor context, such as global `CLAUDE.md`, Claude memory/skills, and Cursor rules/skills, can also be versioned in that same knowledge repo.

Available as both a CLI and a Desktop app, with a local-first workflow for Claude Code, Cursor, and Codex users.

## Why GitMemo Matters in the AI Era

Traditional note apps mostly capture what people intentionally write. In the AI era, valuable knowledge is also produced continuously by AI chats, coding assistants, terminals, browsers, clipboard history, screenshots, external files, and fleeting ideas. Much of it is useful for only a few seconds unless it is captured immediately.

GitMemo exists because those temporary sources need a durable, portable, user-owned home. It first captures the material, stores it as plain files in a Git repository you control, and then makes it searchable, syncable, exportable, and reusable.

That changes the role of the knowledge base: it is no longer only a place for humans to read old notes. It becomes a context layer that humans and AI tools can both return to, so later work can continue from saved facts, decisions, terminal answers, branch summaries, and documents instead of rebuilding context from memory.

## Features

- **Git-native knowledge capture** — Clipboard text, screenshots, Markdown, AI conversations, terminal output, external files, and ideas flow into one directory managed by Git; remote sync stays optional
- **Conversation capture for supported AI tools** — Claude Code and Cursor use rules, skills, hooks, and MCP where available; Codex sessions are imported from native local logs with `gitmemo capture`
- **Search and reuse** — Search saved material from the CLI, Desktop, or MCP instead of losing it in chat history
- **Project scene archival** — Ask MetaBot, Claude, Codex, or Cursor to save the current branch, task goal, progress, risks, and next actions into GitMemo, so future work can resume across tools, devices, and time without rebuilding the context
- **AI preference and config sync** — Keep user-authored AI working rules, global `CLAUDE.md`, Claude memory/skills, Cursor rules/skills, and related MCP config searchable, versioned, and portable
- **Multi-editor** — Supports Claude Code, Cursor, and Codex
- **Notes** — Scratch notes and manuals — one command to create
- **Clipboard capture** — Optional Desktop monitoring captures local clipboard text and images when enabled
- **No always-on sync daemon for editor capture** — Capture relies on native hooks, integrations, or local session logs rather than a separate sync service
- **Data ownership** — Your content lives in **your** Git repo; local indexes and helpers are explained in the [Data & storage statement](docs/DATA-STATEMENT.md)

## Environment & dependencies

- **Git (local CLI)**: Required to initialize the sync repo and run `commit` / `push` workflows. A **remote** is **not** required—you can stay local-only until you want to sync copies to another machine or a cloud Git host.
- **Claude Code / Cursor / Codex**: **Not** a prerequisite to install GitMemo. Add **at least one** during `gitmemo init` only when you want conversation capture, hooks, MCP, or Codex log import where supported. Codex support reads existing `~/.codex` logs; it does not modify Codex config or install a Codex `/save` skill.
- **Hosted Git remote** (GitHub / GitLab / Gitee / self-hosted): **Always optional**.

## Quick Start

### Install

#### GitMemo Desktop (macOS and Windows) — start here for the GUI

1. **Download**: choose the matching **Desktop** build:
   - **macOS**: prefer **`.dmg`** (drag into Applications), or **`.app.tar.gz`** (extract to get `.app`; filenames change each release — look for **desktop** / **GitMemo** in the asset name).
   - **Windows**: download the x64 **`.exe`** installer from the **[GitMemo download page](https://gitmemo.kakacut.cn/#downloads)**.
   - **Linux**: this repository does **not** ship Desktop installers yet; use **CLI install** below.
2. **First-time setup**: finish initialization once—**use the guided setup inside GitMemo Desktop**, or install the **CLI** below and run **`gitmemo init`** in a terminal if you prefer. This creates `~/.gitmemo` and optionally wires Claude / Cursor or enables Codex log capture. After that you can stay mostly in Desktop for browsing, search, and clipboard.

> **macOS Desktop note**: current Desktop releases are signed and intended for normal installation via the published `.dmg` or `.app.tar.gz` assets. If macOS still blocks launch on your machine, treat that as an unexpected environment-specific issue rather than the standard install path.
> **Windows Desktop note**: current Windows x64 installers are unsigned. Windows SmartScreen may show an "unknown publisher" warning; use the official GitMemo download page and continue only if you trust the source.

#### CLI install (macOS & Linux)

One-line installer for macOS and Linux (installs / updates the `gitmemo` CLI and related pieces the script manages):

```bash
# One-line install (auto-detects your platform)
bash <(curl -fsSL https://github.com/sahadev/GitMemo/raw/main/scripts/install.sh)
```

<details>
<summary>Manual CLI download / Build from source</summary>

From **[Releases · Latest](https://github.com/sahadev/GitMemo/releases/latest)** → **Assets**, download the **CLI** binary for your platform (e.g. `gitmemo-macos-aarch64` or `gitmemo-linux-x86_64`).

On macOS/Linux:

```bash
chmod +x gitmemo-macos-aarch64
sudo mv gitmemo-macos-aarch64 /usr/local/bin/gitmemo
```

On Windows, build from source with Cargo for now.

Or build from source (requires Rust toolchain):

```bash
git clone https://github.com/sahadev/GitMemo.git
cd GitMemo
cargo install --path .
```

</details>

### Initialize

```bash
# New setup — interactive editor selection (Claude Code / Cursor / Codex / all)
gitmemo init

# Or specify the editor directly
gitmemo init --editor claude    # Claude Code only
gitmemo init --editor cursor    # Cursor only
gitmemo init --editor codex     # Codex capture only
gitmemo init --editor all       # All supported editors

# Specify language (default: English)
gitmemo init --lang zh          # Chinese interface
gitmemo init --lang en          # English interface

# Link to an existing local Git repo
gitmemo init --path /path/to/your/repo
```

Follow the prompts: choose your editor, enter your Git remote URL (or press Enter to skip for local-only mode). If using a remote repo, add the generated SSH public key to your repo's Deploy Keys.

### After setup

After initialization, conversations, notes, and other supported sources flow into your sync directory and into Git. In **Claude** or **Cursor**, type **`/save`** to save the current session manually (after `init` installed the save skill for that editor); auto-save also runs for supported workflows under your configured rules. For **Codex**, run `gitmemo capture` or use Desktop's capture action after a Codex session; GitMemo reads Codex's local `~/.codex/history.jsonl` and session JSONL files.

### Desktop App

**Installer**: see **Install → GitMemo Desktop (macOS and Windows)** above, or go straight to the **[GitMemo download page](https://gitmemo.kakacut.cn/#downloads)**. After initialization, open GitMemo Desktop and it will read the same sync directory as the CLI (usually `~/.gitmemo`).

- **Dashboard** with stats, sync status, recent activity feed, and clipboard monitoring indicator
- **Full-text search** across conversations, notes, clips, plans, and config
- **Clipboard monitor** with text and image capture, thumbnail previews
- **System notifications** for sync errors and clipboard captures
- **Quick Paste** floating window and configurable global shortcuts
- **System tray** with quick actions (Open/Sync/Clipboard/Quit)
- **Diagnostics**: update-check events are logged with the `[updater]` prefix to `gitmemo.log` (on macOS, under `~/Library/Logs/` in the app’s log folder; other platforms use their native app log location)
- Plans created by Claude Code and Cursor are both imported into `plans/`
- Current desktop packages target **macOS** (Apple Silicon + Intel) and **Windows x64**
- You don’t need a terminal day-to-day; **first-time setup can finish inside the app**, or you can use the CLI to run `gitmemo init`. The CLI is also handy for `gitmemo note`, `sync`, and other commands

### How Conversations Are Saved

There are three supported capture paths:

- **Claude Code**: GitMemo injects instructions, a PostToolUse hook, `/save`, and MCP. Claude sessions can be saved by the hook or by running `gitmemo capture`.
- **Cursor**: GitMemo uses Cursor rules, skills, and MCP sync. Use `/save` when the save skill is present.
- **Codex**: GitMemo does not inject a Codex hook or `/save` skill. Codex already writes local logs under `~/.codex`; `gitmemo capture` imports new Codex sessions from those logs into `conversations/YYYY-MM/*.md`.

To verify Codex capture without writing files, run `gitmemo capture --dry-run` after using Codex.

### AI Preferences as Synced Context

It is accurate to say that GitMemo can help sync AI usage preferences, with one important nuance: GitMemo syncs the user-authored preference and context files used by supported AI tools, not a model's hidden internal state.

For example, a global `CLAUDE.md` may describe your preferred language, Feishu MCP usage, GitMemo habits, Prisma safety rules, or commit-and-push workflow. GitMemo can preserve that kind of operating context alongside Claude memory, skills, project memory, Cursor rules, Cursor skills, and MCP config under `claude-config/` and `cursor-config/`. Once those files are in the GitMemo repo, they become searchable, versioned, backed up, and available across devices or future AI sessions.

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
gitmemo manual "Title"     # Create a manual
gitmemo search "docker"    # Full-text search conversations and notes
gitmemo recent             # List recent conversations
gitmemo capture            # Import Claude Code and Codex session logs
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
│   ├── root-docs/           # Root-level Claude Markdown docs
│   └── projects/           # Per-project memory
├── cursor-config/          # Cursor-related rules, skills, MCP config, and docs
│   ├── rules/              # Cursor rules (.mdc)
│   ├── skills/             # Cursor skills
│   ├── root-docs/           # Root-level Cursor Markdown docs
│   ├── projects/           # Per-project docs, references, and specs
│   └── mcp.json            # Cursor MCP config when present
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
| **AI Memory** | Claude's auto-memory & project context | `claude-config/memory/`, `claude-config/projects/` |
| **AI Preferences & Rules** | Global `CLAUDE.md`, Cursor rules, MCP config, custom skills | `claude-config/`, `cursor-config/` |

No manual copying. No export buttons. Supported sources can flow into your sync directory and be tracked by Git automatically.

## Supported Editors

| Editor | Capture mechanism | Git sync | MCP |
|--------|-------------------|----------|-----|
| **Claude Code** | `CLAUDE.md`, hooks, `/save`, native logs | PostToolUse Hook + `gitmemo capture` | `~/.claude.json` |
| **Cursor** | Cursor Rules (`.mdc`) and skills | `cds_sync` MCP tool | `~/.cursor/mcp.json` |
| **Codex** | Native local logs under `~/.codex` | `gitmemo capture` | — |

## How It Works

For Claude Code, Cursor, and Codex capture flows, GitMemo avoids an extra sync daemon and instead uses each tool's native mechanisms: hooks/rules/MCP where available, and local session logs for Codex.

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

**Codex:**

| Injection Point | What It Does |
|----------------|--------------|
| `~/.codex/history.jsonl` | Discovers Codex sessions with new user activity |
| `~/.codex/sessions/YYYY/MM/DD/*.jsonl` | Converts user and assistant messages into GitMemo conversation Markdown |
| `gitmemo capture` | Imports Codex sessions alongside Claude Code sessions and commits them to Git |
| No Codex config injection | Codex support is read-only against Codex logs; GitMemo does not install a Codex `/save` skill |

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

## Special Contribution: Semantic Logic Modeling

[Semantic Logic Modeling Skill](https://github.com/sahadev/semantic-logic-modeling-skill) made a special contribution to GitMemo's refactoring work. It provided a practical method for turning branch-heavy business rules, UI states, editor integration checks, capture flows, and sync decisions into named semantic predicates, composite case functions, and controlled result functions.

This helped GitMemo in several concrete ways:

- **Business-readable logic** - Conditions now read more like product language through `is...`, `has...`, `can...`, `should...`, `get...`, and `resolve...` helpers instead of long inline boolean expressions.
- **Thinner React surfaces** - Desktop pages and components can consume domain logic from `desktop/src/components/domain/**`, keeping rendering code focused on layout and interaction.
- **Reusable decisions** - Shared predicates reduce repeated rules across clipboard, dashboard, file workspace, AI records, setup, settings, and sync-related flows.
- **Safer AI-assisted iteration** - Explicit, pure, composable logic gives future agents and contributors a clearer map of what each branch means before changing behavior.

As a result, GitMemo's code became more semantic, more reviewable, and easier to extend. Complex state transitions moved out of scattered UI branches and into small named functions, making the intent of the system easier to understand without mentally executing every condition.

## License

MIT

## Star History

<a href="https://star-history.com/#sahadev/GitMemo&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=sahadev/GitMemo&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=sahadev/GitMemo&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=sahadev/GitMemo&type=Date" />
  </picture>
</a>
