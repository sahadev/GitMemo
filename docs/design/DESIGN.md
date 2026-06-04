# GitMemo Design System

This file is the source design brief for GitMemo. Use it when generating UI
concepts, Open Design artifacts, screenshots, decks, website sections, or
frontend implementation plans.

## Product Identity

GitMemo is a local-first, Git-native personal knowledge capture and reuse
system for humans and AI tools. It captures clipboard content, screenshots,
Markdown, AI conversations, terminal output, external files, ideas, plans, and
editor preferences into a user-controlled Git repository.

The product should feel like a quiet professional tool: durable, inspectable,
fast, local, and trustworthy. It should not feel like a consumer note app, a
marketing dashboard, or a decorative AI toy.

## Audience

- Developers and AI-heavy makers who use Claude Code, Cursor, Codex, terminal
  sessions, screenshots, and local files as part of daily work.
- Users who care about ownership, portability, Git history, and being able to
  resume work across tools and time.
- Power users who prefer dense but legible interfaces over empty presentation
  space.

## Core Promise

Turn temporary context into long-term knowledge that is searchable, syncable,
versioned, and reusable by both people and AI tools.

## Design Principles

1. Local-first trust
   - Show where data lives.
   - Make sync state, pending changes, errors, and remote status visible.
   - Avoid vague cloud language unless a remote Git action is actually involved.

2. Git-native clarity
   - Use terms like repository, branch, commit, remote, unpushed, capture, and
     reindex when they are accurate.
   - Pair technical terms with plain consequences.
   - Surface file paths and timestamps where they help users build confidence.

3. AI context, not AI spectacle
   - Treat AI as a practical workflow partner.
   - Prefer concrete captured artifacts over abstract magic language.
   - Avoid glowing, bubbly, or overly futuristic AI visuals.

4. Dense, calm, repeatable workflows
   - Optimize for repeated daily use.
   - Use predictable navigation, compact controls, and scan-friendly lists.
   - Make empty states helpful but brief.

5. Inspectable artifacts
   - Captured content should look like files a user can open, export, search,
     and reason about.
   - Markdown, paths, metadata, and source labels should be easy to scan.

## Visual Direction

GitMemo uses a warm terminal-inspired interface with restrained blue accents.
It should feel close to a native macOS productivity app with a command-line
soul.

Use:

- Warm dark surfaces.
- Warm light mode, not pure white.
- Compact borders and 4px to 8px radii.
- Monospace as the primary product texture.
- Blue as the primary action/accent color.
- Green, yellow, and red only for status.
- Purple and pink sparingly for secondary semantic categories such as code or
  AI-related metadata.

Avoid:

- Purple-blue gradient dominance.
- Oversized hero-only typography inside app panels.
- Decorative orbs, bokeh, floating blobs, or generic AI sparkle visuals.
- Large empty cards that dilute information density.
- Marketing-style card stacks inside the desktop app.

## Tokens

Production UI should use named tokens from `desktop/src/index.css`, not one-off
numbers. Hard-coded values are acceptable only for measured media dimensions,
third-party print output, or values calculated from user content.

Token naming follows two layers:

- Scale tokens define the shared ladder: `--gm-font-*`, `--gm-space-*`,
  `--gm-radius-*`, and `--gm-shadow-*`.
- Semantic tokens define intent: `--bg`, `--text`, `--accent`,
  `--gm-color-on-accent`, `--gm-overlay-*`, `--gm-accent-*`,
  `--gm-warning-*`, `--gm-danger-*`, `--gm-selection-border`,
  `--gm-category-*`, and `--gm-provider-*`.

Use scale tokens when the value answers "how much"; use semantic tokens when
the value answers "what role/state is this".

Current desktop color tokens:

- Background canvas: `--bg`, `#1a1817` dark, `#f7f4f2` light
- Primary surface: `--bg-card`, `#252220` dark, `#fdfcfb` light
- Hover/inactive surface: `--bg-hover`, `#302c2c` dark, `#eeebe8` light
- Input surface: `--bg-input`, `#252220` dark, `#fdfcfb` light
- Primary text: `--text`, `#fdfcfc` dark, `#201d1d` light
- Secondary text: `--text-secondary`, `#9a9898` dark, `#7a7574` light
- Accent: `--accent`, `#007aff`
- Accent hover: `--accent-hover`, `#0056b3`
- Success: `--green`, `#30d158` dark, `#248a3d` light
- Warning: `--yellow`, `#ff9f0a` dark, `#c46200` light
- Danger: `--red`, `#ff3b30` dark, `#d70015` light
- Border: `--border`, `rgba(253, 252, 252, 0.08)` dark,
  `rgba(15, 0, 0, 0.10)` light
- Strong border: `--border-strong`, `#646262` dark, `#b0aeac` light
- Text/icon on filled actions: `--gm-color-on-accent`
- Accent panels: `--gm-accent-muted`, `--gm-accent-soft`,
  `--gm-accent-border`
- Warning panels: `--gm-warning-soft`, `--gm-warning-border`
- Danger panels: `--gm-danger-soft`, `--gm-danger-border`
- Success border: `--gm-success-border`
- Selection border: `--gm-selection-border`
- Empty-state icons: `--gm-empty-icon-color`
- Overlays: `--gm-overlay-soft`, `--gm-overlay-dialog`,
  `--gm-overlay-scrim`
- Category identity: `--gm-category-blue`, `--gm-category-green`,
  `--gm-category-yellow`, `--gm-category-gray`, `--gm-category-teal`
- Provider identity: `--gm-provider-github`, `--gm-provider-gitlab`,
  `--gm-provider-gitee`, `--gm-provider-bitbucket`, `--gm-provider-other`
- Shadow popover: `--gm-shadow-popover`
- Shadow modal: `--gm-shadow-modal`
- Shadow soft: `--gm-shadow-soft`
- Shadow bottom bars: `--gm-shadow-bottom`, `--gm-shadow-bottom-soft`
- Shadow controls: `--gm-shadow-control`, `--gm-shadow-control-strong`
- Shadow danger ring: `--gm-shadow-danger-ring`

Typography:

- App shell: `JetBrains Mono`, then system monospace fallbacks.
- Markdown reading surfaces: system sans for readability, with monospace code.
- App font scale: `11px`, `13px`, `15px`, `17px`, `21px`, `25px`.
- Use `11px` only for the weakest information: timestamps, tiny badges,
  keyboard hints, version strings, compact counters, and dense machine-like
  metadata. Do not use it for normal labels, list text, or readable
  descriptions.
- Use `13px` for default body text, list titles, list rows, form values,
  auxiliary descriptions, secondary labels, menus, compact buttons, and normal
  action labels. Use color, weight, and opacity to distinguish primary and
  secondary text at this size.
- Use `15px` for compact section titles, dialog action text, mobile page
  titles, and important values inside panels.
- Use `17px` for modal headings, setup step headings, and dense desktop panel
  headings.
- Use `21px` for desktop page titles and primary setup titles.
- Use `25px` for large numeric stats, success/failure result headings, and
  rare onboarding moments.
- Do not scale type with viewport width.
- Keep letter spacing at `0` unless matching existing code.

Spacing:

- App spacing scale: `0`, `2px`, `4px`, `6px`, `8px`, `10px`, `12px`,
  `14px`, `16px`, `20px`, `24px`, `28px`, `32px`.
- Prefer even values from the scale for `gap`, `padding`, `margin`, toolbar
  heights, and row rhythm.
- Use `2px` and `4px` only for tight metadata relationships.
- Use `8px`, `12px`, and `16px` for most component internals.
- Use `20px`, `24px`, `28px`, and `32px` for page and modal breathing room.
- Use semantic spacing tokens when the UI role is known:
  `--gm-page-pad-*` for scrollable page edges, `--gm-section-gap` for
  top-level module/card separation, `--gm-card-pad-*` for panel internals,
  `--gm-card-header-gap` for title-to-content separation, `--gm-row-pad-*` and
  `--gm-row-gap` for repeated row rhythm, `--gm-list-*` for split-pane list
  headers and list rows, `--gm-detail-*` for reading/detail panes,
  `--gm-icon-text-gap` for icon/label pairs, `--gm-toolbar-gap` for toolbar
  clusters, `--gm-control-*` for buttons and fields, and `--gm-nav-*` for
  navigation rows.

Line height:

- App leading scale: `1`, `1.2`, `1.25`, `1.3`, `1.5`, `1.6`, `1.72`,
  `1.78`.
- Use `1` only for icon-like marks and print/header micro labels.
- Use `1.2` and `1.25` for compact controls and app/page titles.
- Use `1.3` for headings inside Markdown and dense panels.
- Use `1.5` for normal UI rows, inputs, buttons, and single-line controls.
- Use `1.6` for helper copy, descriptions, code blocks, and compact
  multi-line text.
- Use `1.72` and `1.78` for Markdown reading surfaces, with the larger value
  reserved for mobile reading.

Icon size:

- App icon scale: `8px`, `12px`, `14px`, `16px`, `18px`, `20px`, `24px`,
  `28px`, `36px`, `40px`, `48px`.
- Use `8px` only for dots and tiny status indicators.
- Use `12px` for micro inline icons in dense buttons, copy affordances, and
  compact metadata.
- Use `14px` for list/source icons, menu item icons, and small toolbar actions.
- Use `16px` for default toolbar icons, sidebar icons, and mobile compact
  actions.
- Use `18px` and `20px` for navigation, section lead icons, and prominent
  setup choices.
- Use `24px` and `28px` for dialog header icons and result/status marks.
- Use `36px`, `40px`, and `48px` for empty states, loading states, and rare
  hero/setup moments.

Radius:

- App radius scale: `0`, `2px`, `4px`, `6px`, `8px`, `999px`.
- Use `4px` for tiny badges, code, and small affordances.
- Use `6px` for buttons, inputs, list selections, and panels.
- Use `8px` for dialogs, popovers, setup cards, and larger surfaces.
- Use `999px` only for true pills, dots, toggles, and circular indicators.
- Do not introduce values like `5px`, `7px`, `9px`, `10px`, `12px`, or `20px`
  for normal UI radius.

## Token Usage Rules

Choose tokens by UI role first, never by eyeballing a nearby value. If a screen
needs a visual treatment that is not covered here, extend this section and
`desktop/src/index.css` together before applying the new pattern.

### Surfaces

Use `--bg` for the app canvas, page backgrounds, editor bodies, and reading
areas where content should feel directly on the workspace.

Use `--bg-card` for primary panels, sidebars, list columns, detail panes,
dialogs, setup cards, and repeated cards. Pair it with `--border`.

Use `--bg-hover` for row hover states, inactive segmented controls, pressed
toolbar states, and subtle grouped controls. Do not use it as the default
background for large page sections.

Use `--bg-input` for text inputs, search boxes, textareas, and command fields.
Inputs use `--border`, `--gm-radius-md`, and a visible focus outline.

Use `color-mix(...)` only when a token needs an alpha-like variant of an
existing semantic color, such as selected rows or quiet panels. Prefer existing
tokens like `--gm-accent-muted`, `--gm-accent-soft`, and `--gm-accent-border`
when they match.

### Typography

Use `--gm-font-2xs` (`11px`) for the tightest metadata: timestamps, tiny
badges, keyboard hints, version strings, secondary counters, compact status
labels, and log step labels. Do not use it for normal labels, list text,
buttons, or readable descriptions.

Use `--gm-font-xs` (`13px`) for auxiliary descriptions, helper text, labels,
sidebar status, table cells, menus, dense metadata, and compact buttons.

Use `--gm-font-sm` (`13px`) for default body copy, list item titles, search
results, readable empty states, form values, list rows, and normal action
labels. It intentionally shares the same physical size as `--gm-font-xs`;
primary/secondary hierarchy comes from weight, color, opacity, and placement.

Use `--gm-font-md` (`15px`) for dialog actions, mobile page titles, compact
section headings, and important values that must stand out inside a panel.

Use `--gm-font-lg` (`17px`) for modal headings, setup step headings, and
desktop panel headings when the surrounding content is dense.

Use `--gm-font-xl` (`21px`) for desktop page titles and primary setup titles.

Use `--gm-font-2xl` (`25px`) for large numeric stats, success/failure result
headings, and rare onboarding moments. Do not use it inside normal list rows.

Markdown reading surfaces may use relative heading sizes inside
`.markdown-body`, but their body/code sizes must still map back to the app font
scale.

### Spacing

Use semantic spacing tokens before raw scale tokens when the component role is
clear. Use raw scale tokens only inside a component where no shared role exists.

Use `--gm-page-pad-x`, `--gm-page-pad-y`, and `--gm-page-pad-bottom` for
desktop page containers that scroll. Use `--gm-page-pad-mobile-x` and
`--gm-page-pad-mobile-y` for mobile page containers. Page padding belongs on
the scroll container, not on nested decorative wrappers.

Use `--gm-section-gap` for vertical separation between peer modules: dashboard
cards, onboarding prompts, status panels, settings groups, and page header to
first content. Use `--gm-section-gap-lg` only when a page or modal needs a
larger content break.

Use `--gm-card-pad-x`, `--gm-card-pad-y`, and `--gm-card-pad-mobile` for normal
cards and panels. Card padding should contain the content once; avoid adding a
second horizontal padding on list rows unless the row is visually independent
from the card header.

Use `--gm-card-header-gap` for the distance from a card title/header row to its
body content, and for compact two-column panel grids. Use
`--gm-card-content-gap` for inner groups that need a little more separation
without becoming separate page modules.

Use `--gm-row-pad-y`, `--gm-row-pad-y-comfort`, `--gm-row-pad-x`, and
`--gm-row-gap` for list rows and repeated settings rows. Dense desktop rows use
the default row padding; mobile or touch rows use the comfort vertical padding.

Use `--gm-list-header-pad-x` and `--gm-list-header-pad-y` for split-pane list
headers, filter bars, compact page headers inside a column, and tab/filter
clusters that sit directly above a list.

Use `--gm-page-header-height`, `--gm-page-header-title-font`, and
`--gm-page-header-icon-size` for true top-level page headers such as Editor
Home, and for the top title rhythm on Dashboard and Settings. Page headers use
`--gm-font-xl` titles, `--gm-icon-xl` lead icons when present, and the same
fixed desktop height so the first divider/content row lands at a consistent
vertical position. Do not add a page header above split-pane pages.

Use `--gm-pane-header-height`, `--gm-pane-header-title-font`, and
`--gm-pane-header-icon-size` for split-pane list headers such as Conversations,
Plans, Imports, Favorites, External Files, Clipboard, and Claude Config. Pane
headers use a fixed `52px` height, `--gm-list-header-pad-y` vertical padding,
`--gm-font-sm` titles, and `--gm-icon-sm` lead icons. Do not mix `15px`,
`17px`, or ad hoc `18px` icons into pane headers. Use fixed height instead of
`min-height` so headers with icon buttons and headers with only count pills do
not drift apart.

Use `PaneTabHeader` for list headers whose primary content is a tab switcher,
such as Notes and AI Records. It still uses `--gm-pane-header-height`, but tab
labels use `--gm-font-xs`, desktop tab icons use `--gm-icon-xs`, mobile tab
icons use `--gm-icon-sm`, and the action cluster uses
`--gm-pane-header-actions`.

Use `FileDetailToolbar` for right-side detail headers and full-screen mobile
detail headers. Its action order is back, title, refresh, metadata such as
favorite, edit/save/cancel, secondary actions, and more. The refresh action
belongs immediately after the title so every readable detail surface has a
consistent top-level reload affordance; hide it while editing to avoid
discarding unsaved local edits.

Use `--gm-list-row-pad-x`, `--gm-list-row-pad-y`, and
`--gm-list-row-pad-y-compact` for selectable rows in Notes, Conversations,
Plans, Imports, Favorites, Clipboard, search results, editor file lists, and
configuration file lists. Use the compact variant only for dense secondary
rows with short labels and no multi-line preview.

Use `--gm-detail-pad-x` and `--gm-detail-pad-y` for desktop reading panes,
Markdown detail bodies, raw file previews, and editors that sit to the right of
a list. Use `--gm-detail-pad-mobile-x` and `--gm-detail-pad-mobile-y` when the
detail surface becomes a full mobile page.

Use `--gm-icon-text-gap` when an icon labels adjacent text. Use
`--gm-control-gap`, `--gm-control-pad-*`, and `--gm-control-height-*` for
buttons, inputs, segmented controls, and icon buttons. Use `--gm-toolbar-gap`
for groups of peer toolbar actions.

Use `--gm-nav-item-*` and `--gm-nav-stack-gap` for sidebar and bottom navigation
rows. Navigation stacks should use parent `gap`; individual nav items should
not use ad hoc margins to create row rhythm.

Use `--gm-space-1` and `--gm-space-2` (`2px`, `4px`) for tight relationships:
label-to-value, icon-to-dot, tiny badge padding, and progress bar details.

Use `--gm-space-3` and `--gm-space-4` (`6px`, `8px`) for icon/text gaps,
toolbar button padding, compact row gaps, tab internals, and menu internals.

Use `--gm-space-5` and `--gm-space-6` (`10px`, `12px`) for normal row rhythm,
button internals, list item vertical padding, and grouped control gaps.

Use `--gm-space-7` and `--gm-space-8` (`14px`, `16px`) for card internals,
section headers, dialog rows, and comfortable desktop list rows.

Use `--gm-space-10` and above (`20px`, `24px`, `28px`, `32px`) for page
padding, modal body padding, setup wizard content, empty states, and major
layout separation.

Mobile may use smaller outer padding than desktop, but both values must come
from the same spacing scale.

### Leading

Use unitless line-height tokens from `desktop/src/index.css` instead of local
numeric values for app chrome.

Use `--gm-leading-none` (`1`) only when text is acting like a mark, such as
print header micro labels.

Use `--gm-leading-tight` (`1.2`) and `--gm-leading-title` (`1.25`) for compact
controls, page titles, and short headings.

Use `--gm-leading-heading` (`1.3`) for Markdown headings and dense headings
inside panels.

Use `--gm-leading-normal` (`1.5`) for normal app text, inputs, buttons, list
rows, and toolbar labels.

Use `--gm-leading-relaxed` (`1.6`) for helper copy, descriptions, code blocks,
and compact multi-line text.

Use `--gm-leading-reading` (`1.72`) and `--gm-leading-reading-mobile` (`1.78`)
for Markdown/body reading surfaces only.

### Icon Size

Use the icon size scale from `desktop/src/index.css` when selecting lucide icon
dimensions. Numeric `size={...}` props are acceptable when they match this
scale exactly.

Use `--gm-icon-dot` (`8px`) only for dots and tiny status indicators.

Use `--gm-icon-2xs` (`12px`) for micro inline icons in dense buttons, copy
affordances, close glyphs, and compact metadata.

Use `--gm-icon-xs` (`14px`) for list/source icons, menu item icons, small
toolbar actions, and file/action affordances.

Use `--gm-icon-sm` (`16px`) for default toolbar icons, sidebar icons, mobile
compact actions, and common dialog controls.

Use `--gm-icon-md` (`18px`) and `--gm-icon-lg` (`20px`) for navigation,
section-leading icons, and prominent setup choices.

Use `--gm-icon-xl` (`24px`) and `--gm-icon-result` (`28px`) for dialog header
icons and success/error result marks.

Use `--gm-icon-empty` (`36px`), `--gm-icon-empty-lg` (`40px`), and
`--gm-icon-hero` (`48px`) only for empty states, loading states, and rare
hero/setup moments.

### Radius

Use `--gm-radius-none` for full-bleed panes, app canvas, split-pane edges, and
surfaces that must align flush with the window.

Use `--gm-radius-xs` (`2px`) for progress bars, tiny rails, and small
selection indicators.

Use `--gm-radius-sm` (`4px`) for badges, code chips, tiny icon affordances,
image thumbnails, and small inline controls.

Use `--gm-radius-md` (`6px`) for buttons, inputs, list selected states,
toolbar controls, menus items, panels, and normal cards.

Use `--gm-radius-lg` (`8px`) for dialogs, popovers, setup option cards,
preview cards, and larger temporary surfaces.

Use `--gm-radius-pill` only for status pills, toggles, progress thumbs,
circular dots, avatars, and counters that are visually pill-shaped.

### Color

Use `--accent` for primary actions, selected navigation, active tabs, focused
fields, links, and progress that represents a user-initiated operation.

Use `--gm-accent-muted`, `--gm-accent-soft`, and `--gm-accent-border` for
accented panels, onboarding prompts, selected but non-focused rows, and
capability notices. Do not use full `--accent` as a large background unless it
is a primary action.

Use `--green`, `--yellow`, and `--red` only for success, warning, destructive,
failed, blocked, or attention-needed states. Pair status color with text,
icons, or labels; do not rely on color alone.

Use `--purple`, `--pink`, and `--gm-category-*` only for category identity,
source type icons, and metadata grouping. They must not become primary action
colors.

Use `--gm-color-on-accent` for text and icons on filled accent/status buttons.
Do not hard-code white in normal UI.

Use `--text` for primary readable content and `--text-secondary` for secondary
labels, helper text, timestamps, placeholders, and metadata.

Hard-coded brand colors are allowed only for external provider identity, such
as GitHub, GitLab, Gitee, or Bitbucket marks. Print/PDF output may use its own
paper-oriented colors because it is not themed app chrome.

### Elevation

Use no shadow for normal page panels, list columns, detail panes, and repeated
cards. Separation should come from borders, background, and layout.

Use `--gm-shadow-soft` for sticky in-content controls such as find bars or
mobile bottom action bars.

Use `--gm-shadow-popover` for menus, dropdowns, floating toasts, and compact
temporary surfaces.

Use `--gm-shadow-modal` for modal dialogs, setup blockers, drag/drop overlays,
and high-priority temporary surfaces.

Use `--gm-overlay-soft`, `--gm-overlay-dialog`, and `--gm-overlay-scrim` for
overlays in increasing strength: privacy prompts, regular modals, and
drag/drop or blocking flows.

### Components

Icon buttons use `--gm-radius-md`, `--gm-font-xs` where text exists, and
`--gm-space-3` or `--gm-space-4` padding. Do not draw borders around icons or
icon-only buttons by default; use color, background, opacity, and hover states
instead. Use lucide icons where available.

Toolbar buttons use transparent/default background, `--gm-radius-md`, and a
minimum clickable size of roughly `32px` desktop or `36px` mobile. Add a border
only for explicit special states such as selected, recording, destructive, or
permission-sensitive actions.

Menus use `--bg-card`, `--border`, `--gm-radius-md`, `--gm-shadow-popover`,
`--gm-font-xs`, and menu items with `--gm-radius-sm`.

Primary text buttons use `--accent` background, `--gm-color-on-accent`, and
`--gm-radius-md`. Secondary text buttons use transparent or `--bg` background
with `--border`.

Segmented controls use `--bg` as the container, `--bg-hover` for inactive
items, `--accent` or an accent-soft treatment for active items, and
`--gm-radius-md`.

List rows use `--gm-font-sm` for the title, `--gm-font-xs` for metadata,
`--border` dividers, `--bg-hover` hover state, and an accent rail or subtle
accent background for selection.

Empty states use `--gm-font-sm` for the main message, `--gm-font-xs` for the
hint, `--text-secondary` for text, `--gm-empty-icon-color` for the icon, and no
large decorative artwork. Do not use `--border` for empty-state icons; border
tokens are too faint in light mode.

Error states use `--red`, `--bg-danger`, `--gm-shadow-danger-ring`,
`--gm-radius-md` or `--gm-radius-lg`, and actionable recovery controls.

### Exceptions

Measured media sizes, icon sizes, canvas dimensions, image dimensions, print
layout values, provider brand colors, and values computed from user content can
be literal numbers. All other production UI values should use the token scale
or an approved semantic token.

## Layout

Desktop app:

- Use a persistent sidebar on desktop and bottom navigation on mobile.
- Treat Dashboard as the operational home: stats, sync state, recent activity,
  and capture health.
- Keep search, AI records, notes, clipboard, favorites, external files, and
  settings as distinct work areas.
- Preserve stable dimensions for sidebars, toolbars, list rows, detail panes,
  badges, icon buttons, and counters.
- Prefer split panes for list/detail workflows.
- Do not put page sections inside decorative outer cards.

Website:

- The first viewport must immediately show GitMemo as the product, not just a
  slogan.
- Product screenshots, terminal examples, or actual captured artifacts should
  carry the page.
- Keep the story concrete: capture, search, sync, resume, reuse.
- The brand can be warm and editorial, but the UI should still feel like a
  technical product.

## Components

Use familiar controls:

- Icon buttons for repeat tools and compact actions.
- Tooltips for unfamiliar icons.
- Segmented controls for modes.
- Toggles or checkboxes for binary settings.
- Inputs, sliders, steppers, or menus for values and option sets.
- Tabs for peer views.
- Text buttons only for clear commands.

For production UI, prefer the existing stack:

- Desktop: React, Tauri, Mantine, Zustand, lucide-react.
- Website: React, Vite, Tailwind CSS, framer-motion, lucide-react.

Generated Open Design HTML/CSS should be treated as prototype material unless
it has been adapted to these existing patterns.

## Content Voice

Voice:

- Clear, technical, calm, and direct.
- Respectful of power users.
- Practical rather than promotional inside the app.
- Confident but never grandiose.

Use copy like:

- "Capture current session"
- "Search saved context"
- "3 unpushed commits"
- "Remote sync is disabled"
- "Codex sessions are imported from local logs"
- "This file is stored in your GitMemo repository"

Avoid copy like:

- "Supercharge your brain"
- "Magical AI memory"
- "Never lose anything ever again"
- "The ultimate second brain"

Localization:

- All production UI copy must fit in both English and Chinese.
- Avoid fixed-width text containers that break with longer translations.
- Keep technical labels consistent across languages.

## States

Every generated or implemented screen should include:

- Loading state.
- Empty state.
- Error state.
- Permission or setup-needed state when relevant.
- Offline/local-only state when relevant.
- Sync-pending and sync-failed states where Git operations are involved.

## Accessibility

- Maintain readable contrast in both dark and light themes.
- Do not rely on color alone for status.
- Keep focus states visible.
- Use real buttons and links for interactive elements.
- Keep text selectable where users naturally need to copy content, especially
  Markdown, paths, logs, and terminal output.

## Product-Specific Surfaces

High-value GitMemo surfaces:

- Setup wizard: choose local repository, Git remote, editor integrations, and
  clipboard permissions.
- Dashboard: local repo status, sync state, recent captures, quick actions,
  clipboard monitor, reindex/update diagnostics.
- Search: unified search across conversations, notes, clipboard, plans,
  external files, and editor config.
- AI records: captured Claude, Cursor, and Codex sessions with source labels,
  dates, summaries, and file paths.
- Clipboard: text and image captures with privacy controls and source metadata.
- Settings: local path, remote URL, branch, theme, shortcuts, editor wiring,
  diagnostics, and uninstall/export actions.
- Website: explain why temporary AI-era context needs a durable Git-backed
  home.

## Acceptance Checklist

For any new design artifact:

- It communicates local-first ownership.
- It uses the existing token family.
- It works in dark and light themes.
- It has dense but readable information hierarchy.
- It includes realistic data from GitMemo workflows.
- It respects desktop and mobile navigation patterns.
- It avoids decorative AI cliches.
- It can be ported into the existing React/Mantine/Tailwind codebase.
