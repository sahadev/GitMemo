---
version: 1.0
name: GitMemo Desktop and Mobile App Design System
description: |
  GitMemo's app is a local-first knowledge manager for desktop and Android.
  It should feel like a calm, durable workbench: dense enough for repeated use,
  warm enough for long reading, and precise enough for developer workflows.
  The app is not a marketing surface. It should prioritize scanning, reading,
  editing, searching, syncing, and file management over decoration.
---

# GitMemo App DESIGN.md

## 1. Visual Theme & Atmosphere

GitMemo Desktop and Android should feel like a focused knowledge cockpit:

- **Local-first**: content feels like files in a repository, not cloud cards in a feed.
- **Developer-native**: monospace chrome, Git paths, command-like metadata, dense lists.
- **Reading-friendly**: Markdown detail views switch to a proportional system font for long-form reading.
- **Quiet and durable**: restrained colors, simple borders, no decorative visual effects.

The app differs from the website:

- Website: scenario storytelling and product marketing.
- App: operational UI for daily capture, search, reading, writing, sync, and review.

Primary inspiration from the DESIGN.md collection:

- Linear: precise density, quiet product craft, restrained accent.
- OpenCode: warm terminal palette and monospace shell.
- Raycast/Superhuman-like productivity behavior: fast navigation, compact controls, repeated actions.
- Mintlify: readable Markdown and documentation surfaces.

## 2. Core Design Principles

1. **Work surface, not landing page**
   Avoid hero layouts, oversized headings, decorative sections, and marketing composition inside the app.

2. **Dense but not cramped**
   Lists, sidebars, and toolbars should be compact. Reading/editing panes should breathe.

3. **One persistent navigation model per platform**
   Desktop uses a left sidebar. Mobile uses a bottom nav plus stack/back behavior.

4. **The repository is the mental model**
   Use paths, timestamps, source types, sync state, and file metadata clearly.

5. **Flat surfaces**
   Use borders and background shifts for structure. Avoid heavy shadows, gradients, blur, and nested cards.

6. **Icons are tools**
   Use lucide icons for actions and navigation. Do not replace obvious icons with text buttons unless the command needs text.

## 3. Color Palette & Roles

The app uses CSS variables from `desktop/src/index.css`.

### Dark Theme

- **App background**: `--bg: #1a1817`
  Main canvas.
- **Card / sidebar surface**: `--bg-card: #252220`
  Sidebar, panels, list containers, controls.
- **Hover / selected soft surface**: `--bg-hover: #302c2c`
  Hover rows, active tabs, subtle emphasis.
- **Input surface**: `--bg-input: #252220`
  Text inputs, editors with borders.
- **Border**: `--border: rgba(253, 252, 252, 0.08)`
  Primary separator.
- **Strong border**: `--border-strong: #646262`
  Terminal frames and stronger outlines.
- **Primary text**: `--text: #fdfcfc`
- **Secondary text**: `--text-secondary: #9a9898`
- **Accent**: `--accent: #007aff`
- **Accent hover**: `--accent-hover: #0056b3`
- **Success**: `--green: #30d158`
- **Warning**: `--yellow: #ff9f0a`
- **Danger**: `--red: #ff3b30`
- **Purple / scratch**: `--purple: #c084fc`
- **Pink / clips**: `--pink: #f472b6`

### Light Theme

- **App background**: `--bg: #f7f4f2`
- **Card / sidebar surface**: `--bg-card: #fdfcfb`
- **Hover / selected soft surface**: `--bg-hover: #eeebe8`
- **Input surface**: `--bg-input: #fdfcfb`
- **Border**: `--border: rgba(15, 0, 0, 0.10)`
- **Strong border**: `--border-strong: #b0aeac`
- **Primary text**: `--text: #201d1d`
- **Secondary text**: `--text-secondary: #7a7574`
- **Accent**: `--accent: #007aff`
- **Success**: `--green: #248a3d`
- **Warning**: `--yellow: #c46200`
- **Danger**: `--red: #d70015`
- **Purple / scratch**: `--purple: #9333ea`
- **Pink / clips**: `--pink: #db2777`

### Semantic Color Mapping

| Content / State | Color |
| --- | --- |
| Conversations / search / primary action | `--accent` |
| Manual notes / plans / warnings | `--yellow` |
| Scratch notes | `--purple` |
| Clipboard clips | `--pink` |
| Synced / saved / success | `--green` |
| Failed / destructive / behind remote | `--red` |

Color should communicate source or state. Do not add decorative color categories unless they map to a real content type.

## 4. Typography Rules

### App Chrome

Use JetBrains Mono across app chrome:

```css
"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace
```

This includes sidebars, tabs, buttons, lists, metadata, settings, and command-like UI.

### Reading Surfaces

Markdown reading and print/export use proportional system fonts:

```css
-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial,
"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif
```

This exception is intentional: long-form notes and AI records must be readable.

### Type Scale

| Role | Desktop | Mobile | Weight | Notes |
| --- | --- | --- | --- | --- |
| Page title | 16-20px | 15-18px | 700 | Dashboard, section headers |
| Toolbar title/path | 12-14px | 13px | 400-600 | Ellipsized when long |
| List title | 13-15px | 14-15px | 600-650 | One line, truncate |
| List metadata | 10-11px | 10-11px | 400 | Muted |
| Body chrome | 12-14px | 13-14px | 400-500 | Settings, descriptions |
| Markdown body | 14px | 15px | 400 | Line-height 1.72 |
| Code block | 12-13px | 13px | 400 | Monospace |
| Bottom nav label | 9px | 9px | 400-600 | Very compact |

Rules:

- Do not use large hero headings inside the app.
- Use ellipsis for long paths and filenames.
- Markdown body text must be selectable.
- App chrome should generally not be user-selectable unless it is content.

## 5. Layout System

### Desktop App Shell

- Root fills the viewport: `height: 100vh`, no body scroll.
- Sidebar width: `200px`.
- Sidebar background: `var(--bg-card)`.
- Sidebar border: `1px solid var(--border)`.
- Main content uses split panes where applicable.
- List pane widths should be resizable for file-heavy workflows.
- Detail pane should fill remaining width and keep a stable toolbar.

### Mobile App Shell

- Bottom nav is fixed.
- Bottom nav height target: 48-52px plus safe-area inset.
- Mobile pages use stack/back behavior instead of desktop split-pane thinking.
- Content needs bottom padding constants from `desktop/src/utils/mobileLayout.ts`.
- Touch targets should be at least 44px high for common actions.

### Split Pane Pattern

Use for conversations, notes, plans, imports, favorites, external files:

- Left pane: list/filter/create controls.
- Divider: narrow draggable handle.
- Right pane: detail toolbar + content.
- Mobile: list and detail become navigable states, not side-by-side panes.

### Page Padding

- Desktop page content: `20px 28px 28px`.
- Desktop detail content: `20px 24px` or `20px 28px`.
- Mobile page content: `14px`.
- Mobile detail content: `16px` plus bottom safe padding.

## 6. Component Rules

### Sidebar

- Width: 200px.
- Logo row: 12px vertical padding, 22px logo.
- Nav rows:
  - Padding: `10px 16px`
  - Icon: 16px
  - Text: 13px
  - Active: `var(--bg-hover)` background and `var(--accent)` text
  - Focused active item may use a 3px left accent border.
- Sync control lives at the bottom.
- Do not add secondary sidebars or marketing banners.

### Bottom Nav

- Fixed bottom, full width.
- Use icons and short labels.
- Active color: `var(--accent)`.
- Inactive color: `var(--text-secondary)`.
- Keep labels to one short word where possible.
- Do not add badges unless they reflect a real state.

### Toolbars

- Height is content-driven, compact.
- Desktop padding: `10px 20px`.
- Mobile padding: `8px 12px`.
- Use `DetailIconButton` for icon actions.
- Common actions: back, edit, save, cancel, favorite, more, export, reveal, copy path.
- Toolbar title should show path or filename and truncate.

### Detail Icon Buttons

- Use icon-only buttons for clear tools.
- Provide title/tooltip text.
- Tone system:
  - default: neutral
  - accent: primary action / active favorite
  - success: save/sync
  - danger: destructive
- Do not use text buttons for obvious icon commands.

### Lists

- Rows are full-width buttons.
- Border-bottom separates rows.
- Active selection:
  - Strong: `var(--accent)` background for selected file rows.
  - Soft: `color-mix(in srgb, var(--accent) 16%, transparent)` for external files or less dominant states.
- Titles truncate to one line.
- Previews can use 2-line clamp where available.
- Metadata is muted and small.

### Cards and Panels

Cards are allowed for dashboard statistics, onboarding checklist, search results, import results, and settings groups.

Card style:

- Background: `var(--bg-card)`
- Border: `1px solid var(--border)`
- Radius: 6px, 8px maximum
- Padding: 14-20px depending on density
- No heavy shadows
- No decorative gradients except active syncing shimmer

Do not put cards inside cards unless the nested element is a real repeated item in a list.

### Inputs and Textareas

- Background: `var(--bg)` or `var(--bg-input)`.
- Border: `1px solid var(--border)`.
- Focus border: `var(--accent)`.
- Radius: 6px.
- Font: inherit for app chrome; Markdown editors may use monospace.
- Textareas should resize only when the workflow benefits from it.

### Markdown Viewer

- Proportional system font.
- Body size: 14px desktop, 15px mobile.
- Line height: 1.72.
- Code:
  - Inline code uses pink accent background and strong monospace.
  - Blocks use `var(--bg)` background, border, 6px radius.
- Links use `var(--accent)`.
- Images max-width 100%, radius 4px.
- Content is selectable.

### PDF / Print Output

PDF export should use a clean document style, not app chrome:

- White page.
- Dark text.
- System proportional font.
- 12pt body.
- Max width 760px.
- Generous page padding.

## 7. Interaction and State

### Sync State

- Idle sync button: neutral.
- Syncing: animated icon and subtle shimmer are allowed.
- Success: green text/border/background.
- Failure: red text/border/background.
- Diverged/behind/unpushed: yellow/red according to risk.

### Loading

- Use existing `Loading` component.
- Prefer compact loading states inside panes.
- Do not block the whole app when only one pane is loading.

### Empty States

- Centered icon + short sentence.
- Icon color: `var(--border)`.
- Text: `var(--text-secondary)`.
- Avoid promotional copy.

### Notifications

- System notifications should navigate to the relevant page when possible.
- Toasts should be short and state the result.
- Errors should include enough context to act.

## 8. Responsive Behavior

### Desktop

- Use split panes for browse/read workflows.
- Keep sidebar persistent.
- Preserve scroll position where possible.
- Keyboard navigation and shortcuts matter.

### Mobile

- Use bottom nav, not sidebar.
- Replace split panes with list/detail states.
- Use back button handling and swipe-back affordance.
- Increase row padding and text size slightly.
- Detail toolbars need back actions.
- Avoid horizontal overflow in Markdown, code, filenames, and paths.

## 9. Do's and Don'ts

### Do

- Keep the UI quiet, dense, and predictable.
- Use real file paths, timestamps, counts, and sync state.
- Use icons for tools and tabs.
- Keep colors semantic.
- Make reading and editing content comfortable.
- Use borders before shadows.
- Respect platform differences between desktop and Android.

### Don't

- Do not add marketing hero sections inside the app.
- Do not use decorative orbs, gradients, or illustrations.
- Do not add heavy shadows to panels.
- Do not make dashboard cards oversized.
- Do not use rounded pill shapes for dense controls unless the control is a badge/tag.
- Do not hide important metadata behind hover-only interactions.
- Do not use color only to communicate destructive or error states; include text.
- Do not make content unselectable in Markdown, code, or file previews.

## 10. Agent Prompt Guide

When modifying GitMemo Desktop or Android UI:

1. Use existing CSS variables from `desktop/src/index.css`.
2. Preserve the warm terminal palette.
3. Keep app chrome in JetBrains Mono.
4. Keep Markdown reading in system proportional fonts.
5. Use lucide icons for actions.
6. Follow the sidebar / bottom-nav platform split.
7. Use split panes on desktop and navigable list/detail states on mobile.
8. Avoid decorative visuals and heavy shadows.
9. Keep rows compact and metadata visible.
10. Validate risky UI changes with `pnpm --dir desktop build` or targeted manual checks.
