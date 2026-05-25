# GitMemo MCP

GitMemo provides MCP tools through the GitMemo CLI/server integration.

## Tools

- `cds_search`: search saved conversations and notes.
- `cds_recent`: list recent saved items.
- `cds_read`: read a file from the GitMemo repository.
- `cds_note`: create a scratch note.
- `cds_manual`: create or append a manual document.
- `cds_stats`: return repository statistics.
- `cds_sync`: commit and push local changes.

## Time Metadata

When notes are created through GitMemo's MCP tools, GitMemo writes timestamps using the local current time. For manual notes, frontmatter includes `created` and `updated` timestamps. For scratch notes, frontmatter includes a full `date` timestamp.

If an AI tool writes files directly without using GitMemo MCP tools, timestamp quality depends on that tool's file-writing behavior. Prefer GitMemo MCP tools for notes that should have GitMemo-managed metadata and sync behavior.

## Storage Paths

- Scratch notes: `notes/scratch/`
- Manual documents: `notes/manual/`
