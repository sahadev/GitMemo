# GitMemo Technical Architecture

GitMemo is a local-first, Git-native personal knowledge capture and reuse system for clipboard text, screenshots, Markdown, AI conversations, terminal output, external files, ideas, branch summaries, editor plans, and editor configuration snapshots. The project is organized as a shared Rust core with multiple entry points: CLI, MCP server, Tauri desktop app, editor integrations, and a marketing website.

The core product boundary is the GitMemo sync directory, normally `~/.gitmemo`. User data is stored as Markdown and assets in a Git repository. Search and listing use a local SQLite FTS index under `.metadata/`, which is intentionally not synced.

## System Overview

```
                    ┌──────────────────────────┐
                    │        React UI          │
                    │   desktop/src/pages      │
                    └────────────┬─────────────┘
                                 │ Tauri invoke/events
┌──────────────┐      ┌──────────▼──────────┐      ┌──────────────┐
│ gitmemo CLI  │      │   Tauri commands    │      │ MCP server   │
│ src/main.rs  │      │ desktop/src-tauri   │      │ src/mcp      │
└──────┬───────┘      └──────────┬──────────┘      └──────┬───────┘
       │                         │                        │
       └──────────────┬──────────┴──────────┬─────────────┘
                      │                     │
              ┌───────▼─────────────────────▼───────┐
              │          gitmemo_core services       │
              │ src/services/{search,notes,sync,...} │
              └───────┬─────────────────────┬───────┘
                      │                     │
              ┌───────▼────────┐   ┌────────▼────────┐
              │ storage/files  │   │ storage/database │
              │ storage/git    │   │ SQLite + FTS5    │
              │ storage/capture│   └─────────────────┘
              └───────┬────────┘
                      │
              ┌───────▼──────────────────────────────┐
              │ ~/.gitmemo Git worktree               │
              │ conversations/ notes/ clips/ imports/ │
              │ plans/ claude-config/ cursor-config/  │
              │ .metadata/index.db config.toml         │
              └───────────────────────────────────────┘
```

## Crates And Entrypoints

The root Rust package exposes both a library and a CLI binary:

- `src/lib.rs`: reusable `gitmemo_core` library for Desktop and tests.
- `src/main.rs`: CLI binary entrypoint.
- `src/cli/mod.rs`: command-line argument definitions.
- `src/commands/`: CLI command presentation and user-facing output.
- `src/mcp/server.rs`: stdio MCP server.
- `desktop/src-tauri/`: Tauri backend crate, depending on `gitmemo_core`.
- `desktop/src/`: React desktop UI.
- `website/`: public website.

The shared Rust core has these main layers:

- `src/services/`: application orchestration reused across CLI, MCP, and Desktop where behavior must stay consistent.
- `src/storage/`: filesystem, Git, SQLite index, and conversation capture primitives.
- `src/inject/`: editor integration file generation and registration.
- `src/utils/`: config, i18n, datetime, SSH, sanitization helpers.

## Service Layer

The service layer is the application boundary between entrypoints and low-level storage:

- `services::search`: open/rebuild/search/recent/stats index operations.
- `services::notes`: create scratch notes, append daily notes, write manuals, and commit them.
- `services::capture`: run Claude Code/Codex capture and commit captured conversations when content changed.
- `services::sync`: pull, commit, push, and startup sync reporting.
- `services::startup`: entrypoint-specific startup orchestration.

Entrypoints should prefer service functions when a flow combines multiple storage operations. Direct storage calls are still acceptable for narrow local file operations, UI-only indexing refreshes, or setup flows with special interaction requirements.

## Startup Sync Policy

GitMemo starts from a local-first assumption: local files remain usable when Git remote operations fail. Startup sync therefore records failures but does not block the CLI, MCP server, or desktop app from opening.

Current startup behavior:

- CLI: `services::startup::run_startup(..., StartupMode::Cli)` before most commands; pulls latest when the sync directory exists.
- MCP: `StartupMode::Mcp`; pulls latest before serving tools.
- Desktop: `StartupMode::Desktop`; attempts stuck merge/rebase recovery, pulls latest, then captures conversations and commits capture changes.

The returned `StartupSyncReport` contains:

- `cleaned`: whether stuck Git state recovery ran.
- `pulled`: whether pull reported success.
- `clean_error` and `pull_error`: non-fatal startup Git errors.
- `capture`: capture counts for Desktop startup.
- `capture_sync`: commit/push result for automatic capture.
- `capture_error`: non-fatal capture error.

Git network operations use repository locking and non-interactive Git settings in `storage::git`, including timeouts and SSH batch mode. User-facing commands can decide how much of the report to surface.

## Data Store

The GitMemo sync directory is a Git worktree. The important synced folders are:

- `conversations/`: captured Claude Code and Codex conversations.
- `notes/manual/`: manual documents.
- `notes/scratch/`: quick notes.
- `clips/`: clipboard text and image captures.
- `imports/`: imported files and companion Markdown.
- `plans/`: external editor plan snapshots.
- `claude-config/` and `cursor-config/`: synced editor configuration snapshots.

Local-only metadata lives under `.metadata/`:

- `config.toml`: GitMemo configuration.
- `index.db`: SQLite search/listing index.
- `capture_state.json`: incremental capture offsets and session state.

`.metadata/` is not synced to Git.

## SQLite Index

The current schema uses one canonical `documents` table plus FTS:

```sql
CREATE TABLE IF NOT EXISTS documents (
    id             TEXT PRIMARY KEY,
    file_path      TEXT NOT NULL UNIQUE,
    source_type    TEXT NOT NULL,
    title          TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    activity_at    TEXT NOT NULL DEFAULT '',
    activity_ts    INTEGER NOT NULL DEFAULT 0,
    file_mtime_ms  INTEGER NOT NULL DEFAULT 0,
    file_size      INTEGER NOT NULL DEFAULT 0,
    content_hash   TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    doc_id,
    title,
    content,
    tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

Indexing strategies:

- CLI and MCP search use `build_index_if_needed`.
- Desktop full search uses a full rebuild before smart search for fresher results.
- Desktop paged folder listing can sync one folder incrementally.
- `gitmemo reindex` and Desktop `reindex` delete and rebuild `index.db`.

## Capture Flow

`storage::capture` reads:

- `~/.claude/history.jsonl` and per-session files under `~/.claude/projects/`.
- `~/.codex/history.jsonl` and per-session files under `~/.codex/sessions/`.

It converts sessions to Markdown under `conversations/`, using `.metadata/capture_state.json` for incremental offsets and session state. `services::capture::capture_and_sync` wraps capture with a commit/push when new or updated sessions are written.

## MCP Server

The MCP server is started with:

```bash
gitmemo mcp-serve
```

It exposes these tools:

- `cds_search`: search conversations and notes.
- `cds_recent`: list recent records.
- `cds_read`: read a Markdown file by relative path.
- `cds_note`: create a scratch note.
- `cds_manual`: create or update a manual.
- `cds_stats`: return note/conversation stats.
- `cds_sync`: commit and push changes.

Search, recent, note, daily, manual, stats, and sync now use shared services. `cds_read` remains a direct file read because it is a single narrow storage operation.

## CLI Commands

The CLI is implemented in `src/commands/`:

- Setup and integration: `init`, `uninstall`, `remote`, `branch`, `upgrade`.
- Notes: `note`, `daily`, `manual`.
- Search and insight: `search`, `recent`, `stats`, `reindex`, `status`, `unpushed`.
- Sync and capture: `sync`, `capture`.
- MCP: `mcp-serve`.

CLI commands should keep presentation logic, prompts, and terminal output local. Shared write/search/sync behavior should live in `src/services/`.

## Desktop Architecture

Desktop consists of:

- React pages under `desktop/src/pages/`.
- Tauri commands under `desktop/src-tauri/src/commands/`.
- Tauri app setup and tray/window wiring in `desktop/src-tauri/src/lib.rs`.

The Desktop backend reuses `gitmemo_core` directly. Some command modules still contain desktop-specific workflows such as file paging, external editor integration, clipboard capture, and UI event emission. Cross-entrypoint flows should continue moving into `src/services/` when they become shared with CLI or MCP.

## Editor Integrations

GitMemo supports multiple editor integration styles:

- Claude Code:
  - `CLAUDE.md` instruction injection.
  - settings hook injection.
  - MCP registration.
  - GitMemo skills.
- Cursor:
  - Cursor rules.
  - MCP registration.
  - synced Cursor configuration snapshots.
- Codex:
  - session capture from `~/.codex/history.jsonl` and `~/.codex/sessions/`.

Injected content is marked so uninstall/update can replace or remove GitMemo-managed blocks without overwriting unrelated user configuration.

## Reliability Notes

Current safeguards:

- Git commands run non-interactively with SSH batch mode and timeouts.
- Network Git operations use a repository lock.
- Startup sync errors are captured in `StartupSyncReport` instead of aborting app startup.
- Search indexing uses content hashes and metadata timestamps to avoid unnecessary rebuilds.
- Tests cover storage, capture parsing, indexing, config, injection, and service-layer commit message behavior.

Known remaining work:

- Surface `StartupSyncReport` in Desktop UI or logs more explicitly.
- Continue migrating repeated Desktop command orchestration into services when it becomes shared behavior.
- Add golden-path Desktop command tests around note/search/sync command flows.
