# GitMemo

> Auto-sync your AI conversations and notes to Git

GitMemo automatically records your conversations with Claude (or any AI agent) as Markdown files and syncs them to a Git repository. Zero background process. Zero effort.

## Features

- **Auto-record** — Conversations saved as Markdown, completely transparent
- **Notes** — Scratch notes, daily journal, manuals — one command to create
- **Git sync** — Auto commit & push, version control, cross-device access
- **MCP integration** — Search history and create notes directly from Claude
- **Zero daemon** — No background process, powered by Claude Code native hooks
- **Data ownership** — Your data stays in YOUR Git repo

## How It Works

GitMemo doesn't run as a background service. It injects into Claude Code's native infrastructure:

| Injection Point | What It Does |
|----------------|--------------|
| `CLAUDE.md` instruction | Tells Claude to auto-save conversations as Markdown |
| `settings.json` Hook | Auto `git commit && git push` after each file write |
| MCP Server | Enables Claude to search history and create notes |

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (CLI)
- Git
- A Git remote repository (GitHub / GitLab / Gitee / self-hosted)

## Quick Start

### Install

```bash
# One-line install (auto-detects your platform)
bash <(curl -fsSL https://github.com/sahadev/GitMemo/raw/main/scripts/install.sh)
```

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
# New setup — creates ~/.gitmemo/ and configures everything
gitmemo init

# Or link to an existing local Git repo
gitmemo init --path /path/to/your/repo
```

Follow the prompts: enter your Git remote URL (auto-detected for existing repos), add the generated SSH public key to your repo's Deploy Keys. Done.

### That's It

Your Claude conversations will now auto-save to the Git repo. No further action needed. Restart your Claude session to activate.

## Commands

```
gitmemo init               # Initialize configuration
gitmemo status             # Show status
gitmemo note "quick note"  # Create a scratch note
gitmemo daily              # Open/append daily journal
gitmemo manual "Title"     # Create a manual
gitmemo search "docker"    # Full-text search conversations and notes
gitmemo recent             # List recent conversations
gitmemo stats              # Show statistics
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
