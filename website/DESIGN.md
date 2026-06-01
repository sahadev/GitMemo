---
version: 1.0
name: GitMemo Website Design System
description: |
  GitMemo's website is a developer-product marketing site for a local-first,
  Git-backed personal knowledge tool. It should feel precise, practical, and
  credible: terminal-native typography, warm monochrome surfaces, real product
  screenshots, and scenario-led storytelling. The site must not feel like a
  generic SaaS landing page with stacked decorative cards. It should first show
  how everyday information is captured and reused, then explain the underlying
  capabilities.
---

# GitMemo Website DESIGN.md

## 1. Visual Theme & Atmosphere

GitMemo's website combines three qualities:

- **Developer-native**: monospace typography, terminal references, Git paths, command snippets, and product UI examples.
- **Local-first and trustworthy**: warm surfaces, restrained color, minimal decoration, and clear data-ownership language.
- **Scenario-led**: show what users do every day before listing features.

The site should read like a refined product manual with enough visual polish to feel commercial, but not like a generic marketing template.

Primary visual references from the DESIGN.md collection:

- OpenCode: warm terminal aesthetic, monospace identity, flat surfaces.
- Linear: precise product craft, restrained accent usage, screenshot-led proof.
- Mintlify: documentation clarity and readable technical prose.
- Warp: terminal/product storytelling, but GitMemo should stay flatter and less atmospheric.

## 2. Core Design Principles

1. **Real product over illustration**
   Use real GitMemo screenshots or restrained product-like mockups. Avoid abstract blobs, stock imagery, and generic gradient scenes.

2. **Sections are not cards**
   Page sections should be full-width bands or open layouts. Do not wrap entire feature rows, scenario rows, or page sections in decorative card containers with heavy borders/shadows.

3. **Cards are for repeated items**
   Cards are acceptable for compact repeated items such as capability tiles, download tiles, comparison rows, or individual UI mock panels. Do not nest cards inside cards.

4. **Monospace is the brand voice**
   The website uses JetBrains Mono everywhere. Hierarchy comes from size, weight, spacing, and color, not from changing typefaces.

5. **One accent, sparingly**
   `#007aff` is the main accent. Use it for CTAs, active states, section labels, links, and a few meaningful highlights. Do not turn the page into a blue theme.

6. **Warm, not sterile**
   Use warm near-black, warm off-white, and warm borders. Avoid pure black/white unless displaying screenshots, terminal windows, or PDF-like documents.

## 3. Color Palette & Roles

### Dark Theme

- **Canvas / surface**: `#201d1d`
  Primary website background.
- **Surface 2**: `#302c2c`
  Raised surfaces, terminal headers, nav hover, subtle panels.
- **Text**: `#fdfcfc`
  Primary text on dark surfaces.
- **Text secondary**: `#9a9898`
  Body copy, captions, muted metadata.
- **Border**: `rgba(15, 0, 0, 0.12)` in tokens, plus light translucent borders on dark cards.
  Section dividers and UI outlines.
- **Accent blue**: `#007aff`
  Primary CTA, links, active nav, icon highlights.
- **Accent hover**: `#0056b3`
  CTA hover.
- **Success green**: `#30d158`
  Saved/synced states.

### Light Theme

- **Canvas / surface**: `#f7f4f2`
  Warm parchment background.
- **Surface 2**: `#eeebe8`
  Secondary panels and hover surfaces.
- **Text**: `#201d1d`
  Primary text.
- **Text secondary**: `#7a7574`
  Body copy and captions.
- **Border**: `rgba(15, 0, 0, 0.10)`
  Hairline separators and low-contrast outlines.
- **Accent blue**: `#007aff`
  Same semantic role as dark theme.
- **Success green**: `#248a3d`
  Saved/synced states.

### Color Usage Rules

- Do not introduce a multi-color palette for marketing decoration.
- Supporting colors are semantic only: green success, yellow warning/PDF, red danger, violet AI/Markdown.
- Color blocks should be low alpha: 6-16% backgrounds, 20-35% borders.
- Avoid dominant purple, beige-only, or blue-only visual themes.

## 4. Typography Rules

### Font Family

Use JetBrains Mono across the website:

```css
"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace
```

No secondary display font. No serif accent font.

### Type Scale

| Role | Size | Weight | Line Height | Usage |
| --- | --- | --- | --- | --- |
| Hero H1 | 48-60px desktop, 36-40px mobile | 800 | 1.1-1.2 | Primary headline only |
| Section H2 | 30-40px | 700 | 1.2 | Section headings |
| Scenario H3 | 26-32px | 700 | 1.2 | Scenario titles |
| Card title | 15-18px | 600-700 | 1.35 | Capability/download tiles |
| Body | 15-18px | 400-500 | 1.65-1.8 | Marketing copy |
| Caption | 11-13px | 500-600 | 1.4-1.6 | Labels, metadata |
| Code | 12-14px | 400-600 | 1.5-1.7 | Terminal snippets and paths |

### Typography Rules

- Letter spacing should be `0` except uppercase micro labels, where `0.04em` is allowed.
- Do not scale font size with viewport width.
- Do not use hero-scale type inside cards or compact panels.
- Chinese copy needs more line-height than English: prefer `1.75-1.9` for paragraphs.

## 5. Layout Principles

### Page Structure

Recommended home order:

1. Hero
2. Scenarios
3. Core capabilities
4. Architecture
5. Downloads
6. How it works
7. Comparison
8. Desktop app
9. Mobile app
10. Quick start
11. Footer

### Section Rhythm

- Standard section padding: `py-24 px-6`.
- Use `border-t border-border` as section separators.
- Max content width:
  - Text-focused sections: `max-w-5xl`
  - Product screenshot/scenario sections: `max-w-6xl`
  - Narrow prose blocks: `max-w-2xl` or `max-w-3xl`
- Use open grids and whitespace, not outer wrapper cards.

### Scenario Layout

Scenarios are the website's primary storytelling surface.

- Each scenario row is a direct grid: visual + copy.
- Alternate image/text order on desktop.
- On mobile, stack visual and text naturally.
- Do not wrap the whole row in a card, border, or shadow.
- Product visual panels may have their own internal border if they represent an app window, terminal, or document.
- Text side should use:
  - a small semantic/kicker label
  - a clear outcome title
  - one short paragraph
  - two checkmarked outcomes or capability notes

### Capability Grid

- Use compact repeated cards for core capabilities.
- Cards may use `.glass-card`, but keep them flat and consistent.
- Card radius: 4px default, 8px maximum.
- Avoid large decorative icon blocks unless every card uses the same pattern.

## 6. Component Styling

### Buttons

Primary CTA:

- Background: `#007aff`
- Text: white
- Radius: 8px maximum
- Padding: `12px 24px`
- Icon + text preferred for download/action buttons.

Secondary CTA:

- Transparent or surface background.
- Border: `1px solid var(--color-border)`
- Text: primary text.
- Hover: accent border and accent text.

Rules:

- Do not use pill CTAs as the default style.
- Use lucide icons where available.
- Buttons must not resize when content changes.

### Navigation

- Sticky top nav, semi-opaque surface with backdrop blur.
- Links: small text, muted by default, stronger on hover.
- Mobile nav should prioritize icons for downloads and README.
- Keep nav compact; avoid marketing-heavy nav labels.

### Terminal Blocks

- Background: `#201d1d`
- Header: `#302c2c`
- Border: stronger warm gray.
- Radius: 4px.
- Use monospaced text and realistic command output.

### Product Screenshots

- Prefer real screenshots from `website/src/assets`.
- Frame screenshots only enough to separate them from the background.
- Do not blur or heavily crop when the user needs to inspect product behavior.
- Use shadows sparingly; no heavy shadow around entire sections.

### Badges and Pills

- Use for status or metadata only.
- Recommended styles:
  - saved/synced: green low-alpha background
  - source/type: neutral surface with border
  - accent labels: blue low-alpha background
- Avoid long paragraph text inside pill-shaped containers.

## 7. Do's and Don'ts

### Do

- Lead with scenarios: screenshots, copied text, Codex terminal output, Markdown, AI archive, AI reuse.
- Use concrete nouns: `clips/`, `notes/manual/`, `PDF`, `MCP`, `Git`.
- Use real product surfaces and real UI language.
- Keep copy concise and outcome-oriented.
- Use borders and spacing before shadows.
- Keep the page readable in both light and dark themes.

### Don't

- Do not wrap every section or scenario row in a decorative card.
- Do not use nested cards.
- Do not add heavy shadows around large layout blocks.
- Do not use generic gradient blobs, bokeh, or decorative orbs.
- Do not use abstract SVG illustrations when a product screenshot or UI mock can explain the scene.
- Do not make the page mostly blue, purple, beige, or slate.
- Do not add in-app explanatory text that says how to use the UI unless it is part of documentation, not marketing UI.
- Do not present unimplemented features as if they are current product behavior.

## 8. Responsive Behavior

- Breakpoints:
  - Mobile: single-column, visual above copy unless copy context is essential.
  - Tablet: single-column or balanced two-column only when both columns remain readable.
  - Desktop: two-column layout for scenarios and architecture.
- Text must never overlap product images.
- Avoid fixed heights for text-heavy sections.
- For mock windows, use stable min-height and responsive internal grids.
- Touch targets on mobile: at least 44px high for interactive elements.

## 9. Agent Prompt Guide

When modifying the website, follow these rules:

1. Keep the GitMemo site warm, terminal-native, and product-led.
2. Use JetBrains Mono only.
3. Put scenario storytelling before feature lists.
4. Use real screenshots or restrained product-like UI mocks.
5. Do not add an outer card around scenario rows.
6. Do not add decorative orbs, heavy gradients, or generic SaaS hero art.
7. Use `#007aff` sparingly for actionable emphasis.
8. Keep cards flat: border, subtle surface shift, small radius.
9. Keep copy concrete: what was captured, where it goes, how it is reused.
10. Validate with `npm run build --prefix website` after structural changes.
