# Open Design Briefs for GitMemo

Use these briefs with Open Design or any coding agent that can generate HTML,
CSS, screenshots, decks, or implementation-ready prototypes. Always include
`docs/design/DESIGN.md` as product and visual context.

Generated artifacts are exploration material. Do not paste them directly into
production without adapting them to the existing GitMemo stacks:

- Desktop: Tauri, React, Mantine, Zustand, lucide-react.
- Website: Vite, React, Tailwind CSS, framer-motion, lucide-react.

## Shared Context

GitMemo is a local-first, Git-native personal knowledge capture and reuse
system. It saves clipboard text, screenshots, Markdown, AI conversations,
terminal output, external files, ideas, plans, and editor preferences into a
user-controlled Git repository.

Design personality:

- Warm terminal-inspired.
- Dense and calm.
- Technical but approachable.
- Local-first, inspectable, and Git-native.
- Not flashy, cloudy, or generic AI-themed.

Use realistic GitMemo data:

- Sync directory: `~/.gitmemo`
- Branch: `main`
- Remote: optional Git URL
- Sources: Claude Code, Cursor, Codex, Clipboard, Terminal, Manual Note,
  External File
- Status examples: "2 unpushed commits", "Clipboard monitor paused",
  "Codex import complete", "Remote sync disabled", "Reindex required"

## Brief 1: Desktop Setup Wizard

Goal:

Create a production-minded prototype for GitMemo Desktop first-run setup.

Screen requirements:

- Welcome step that explains local-first Git storage in one compact paragraph.
- Repository step with local path selector, current path preview, and disk
  permission note.
- Optional remote Git step with remote URL input and local-only option.
- Editor integration step for Claude Code, Cursor, and Codex.
- Clipboard permission step with privacy reminder and image/text capture
  toggles.
- Final readiness step with summary and "Open Dashboard" primary action.

Design requirements:

- Use compact native-app layout, not a marketing hero.
- Include desktop and mobile/narrow variants.
- Include loading, validation, and error states.
- Make local-only mode feel first-class.

Expected output:

- A single HTML prototype with dark and light theme support.
- Notes describing how to port the layout to Mantine components.

## Brief 2: Dashboard Refresh

Goal:

Explore a clearer operational home for GitMemo Desktop.

Screen requirements:

- Repository status.
- Sync status with branch, remote, pending commits, last sync time.
- Recent activity feed with captured conversations, notes, clipboard items,
  and external files.
- Quick actions: Capture, Search, Sync, New Note, Import File, Reindex.
- Clipboard monitor indicator.
- Diagnostics strip for update checks and sync errors.

Design requirements:

- Dense but readable.
- Use status color sparingly and pair with text labels.
- Preserve a sidebar desktop layout and bottom navigation mobile layout.
- Use realistic empty and error states.

Expected output:

- Desktop and mobile screenshots/prototype states.
- Component inventory mapping to Mantine primitives.

## Brief 3: AI Records and Search Detail

Goal:

Improve how users browse, inspect, and reuse saved AI conversations.

Screen requirements:

- List of captured sessions from Claude Code, Cursor, and Codex.
- Filters by source, month, tags, starred state, and sync state.
- Detail pane with title, summary, source, file path, created time, branch, and
  Markdown preview.
- Actions: copy path, reveal in Finder, export PDF, favorite, open external
  file, search related notes.
- Empty state for no captures and setup-needed state for no editor integration.

Design requirements:

- Prioritize scan speed over decorative presentation.
- Make Markdown selectable.
- Include long-title and long-path handling.
- Include source badges that work without relying on color alone.

Expected output:

- Split-pane desktop prototype.
- Narrow mobile prototype with drill-in navigation.

## Brief 4: Website Hero and Product Story

Goal:

Generate a sharper website first viewport and opening story for GitMemo.

Page requirements:

- First viewport must show the product name and the concrete category.
- Show actual product signal: desktop screenshot, terminal capture, or artifact
  stack based on GitMemo workflows.
- Keep download and GitHub CTAs visible.
- Make the next section partially visible on common desktop and mobile
  viewports.
- Lead into the story: temporary AI-era context needs a durable Git-backed
  home.

Design requirements:

- Keep the existing warm terminal aesthetic and blue accent.
- Avoid generic AI visuals.
- Avoid huge empty cards and one-note blue gradients.
- Use realistic text snippets from GitMemo workflows.

Expected output:

- Hero prototype.
- Opening two sections.
- Notes for porting into `website/src/sections/Hero.tsx`.

## Brief 5: Launch Deck and Short Demo Video

Goal:

Create launch assets for GitMemo releases or Product Hunt-style distribution.

Deck requirements:

- Problem: AI-era context is scattered across chats, terminals, files, and
  screenshots.
- Solution: GitMemo captures it into a user-owned Git repository.
- How it works: capture, index, search, sync, reuse.
- Proof: supported sources and editor integrations.
- Workflow: save session, search later, resume with context.
- Privacy/local-first: local by default, remote Git optional.

Video requirements:

- 30 to 45 seconds.
- No voiceover required in first pass.
- Show product UI, terminal commands, and captured artifacts.
- End with download/GitHub CTA.

Design requirements:

- Concrete, product-led, and technical.
- Avoid abstract AI animations.
- Use GitMemo screenshots and real UI states where possible.

Expected output:

- HTML deck or PPTX-ready artifact.
- MP4-ready storyboard or HyperFrames composition brief.
