# GitMemo Overview

GitMemo is a local-first, Git-backed note and knowledge app for developers.

GitMemo stores user-owned content in a Git repository, usually at `~/.gitmemo`. The repository can contain Markdown notes, AI conversations, clipboard history, plans, imports, and synced editor configuration.

## What GitMemo Is

- A Markdown note and knowledge app.
- A Git-backed personal knowledge repository.
- A CLI and Desktop app.
- An Android client for mobile viewing, note capture, file import, and HTTPS Git sync.
- A way to capture Claude Code, Cursor, and Codex conversations into searchable Markdown where supported.
- An MCP server integration that lets compatible AI tools search, read, create notes, and trigger sync.

## What GitMemo Is Not

- It is not an npm package.
- It is not installed through npm, yarn, or pnpm global package commands.
- It is not an Obsidian plugin.
- It is not a cloud note service.
- It does not require a hosted Git remote.

## Data Layout

Default repository path: `~/.gitmemo`

Common directories:

- `conversations/`: captured AI conversations.
- `notes/daily/`: daily notes.
- `notes/manual/`: long-form manuals, reports, and reusable docs.
- `notes/scratch/`: quick scratch notes.
- `clips/`: clipboard captures.
- `plans/`: implementation plans.
- `imports/`: imported files.
- `.metadata/`: local metadata and search indexes; not intended as primary user content.
