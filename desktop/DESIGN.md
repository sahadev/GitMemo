# Design System Inspiration of OpenCode

## 1. Visual Theme & Atmosphere

OpenCode's website embodies a terminal-native, monospace-first aesthetic that reflects its identity as an open source AI coding agent. The entire visual system is built on a stark dark-on-light contrast using a near-black background (`#201d1d`) with warm off-white text (`#fdfcfc`). This isn't a generic dark theme -- it's a warm, slightly reddish-brown dark that feels like a sophisticated terminal emulator rather than a cold IDE. The warm undertone in both the darks and lights (notice the subtle red channel in `#201d1d` -- rgb(32, 29, 29)) creates a cohesive, lived-in quality.

Berkeley Mono is the sole typeface, establishing an unapologetic monospace identity. Every element -- headings, body text, buttons, navigation -- shares this single font family, creating a unified "everything is code" philosophy. The heading at 38px bold with 1.50 line-height is generous and readable, while body text at 16px with weight 500 provides a slightly heavier-than-normal reading weight that enhances legibility on screen. The monospace grid naturally enforces alignment and rhythm across the layout.

The color system is deliberately minimal. The primary palette consists of just three functional tones: the warm near-black (`#201d1d`), a medium warm gray (`#9a9898`), and a bright off-white (`#fdfcfc`). Semantic colors borrow from the Apple HIG palette -- blue accent (`#007aff`), red danger (`#ff3b30`), green success (`#30d158`), orange warning (`#ff9f0a`) -- giving the interface familiar, trustworthy signal colors without adding brand complexity. Borders use a subtle warm transparency (`rgba(15, 0, 0, 0.12)`) that ties into the warm undertone of the entire system.

**Key Characteristics:**
- Berkeley Mono as the sole typeface -- monospace everywhere, no sans-serif or serif voices
- Warm near-black primary (`#201d1d`) with reddish-brown undertone, not pure black
- Off-white text (`#fdfcfc`) with warm tint, not pure white
- Minimal 4px border radius throughout -- sharp, utilitarian corners
- 8px base spacing system scaling up to 96px
- Apple HIG-inspired semantic colors (blue, red, green, orange)
- Transparent warm borders using `rgba(15, 0, 0, 0.12)`
- Email input with generous 20px padding and 6px radius -- the most generous component radius
- Single button variant: dark background, light text, tight vertical padding (4px 20px)
- Underlined links as default link style, reinforcing the text-centric identity

## 2. Color Palette & Roles

### Primary
- **OpenCode Dark** (`#201d1d`): Primary background, button fills, link text.
- **OpenCode Light** (`#fdfcfc`): Primary text on dark surfaces, button text.
- **Mid Gray** (`#9a9898`): Secondary text, muted links.

### Secondary
- **Dark Surface** (`#302c2c`): Slightly lighter than primary dark, used for elevated surfaces.
- **Border Gray** (`#646262`): Stronger borders, outline rings on interactive elements.
- **Light Surface** (`#f1eeee`): Light mode surface, subtle background variation.

### Accent
- **Accent Blue** (`#007aff`): Primary accent, links, interactive highlights.
- **Accent Blue Hover** (`#0056b3`): Darker blue for hover states.
- **Accent Blue Active** (`#004085`): Deepest blue for pressed/active states.

### Semantic
- **Danger Red** (`#ff3b30`): Error states, destructive actions.
- **Success Green** (`#30d158`): Success states, positive feedback.
- **Warning Orange** (`#ff9f0a`): Warning states, caution signals.

### Border
- **Border Warm** (`rgba(15, 0, 0, 0.12)`): Primary border color, warm transparent black.
- **Border Tab** (`#9a9898`): Tab underline border, 2px solid bottom.
- **Border Outline** (`#646262`): 1px solid outline border for containers.

## 3. Typography Rules

### Font Family
- **Universal**: `Berkeley Mono`, with fallbacks: `IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace`

### Hierarchy

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Heading 1 | 38px | 700 | 1.50 |
| Heading 2 | 16px | 700 | 1.50 |
| Body | 16px | 400 | 1.50 |
| Body Medium | 16px | 500 | 1.50 |
| Caption | 14px | 400 | 2.00 |

### Principles
- One font, one voice. Hierarchy through size and weight only.
- 700 for headings, 500 for interactive, 400 for body.
- 1.50 standard line-height, 1.00 for tight interactive elements.

## 4. Component Stylings

### Buttons
- Background: `#201d1d`, Text: `#fdfcfc`
- Padding: 4px 20px, Radius: 4px
- Font: 16px weight 500

### Inputs
- Background: `#f8f7f7`, Border: `1px solid rgba(15, 0, 0, 0.12)`
- Padding: 20px, Radius: 6px

### Links
- Color: `#201d1d`, underline 1px, weight 500

### Tabs
- Border-bottom: `2px solid #9a9898` (active)
- Font: 16px weight 500

## 5. Layout Principles

- 8px spacing grid: 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px
- Border radius: 4px default, 6px for inputs only
- No shadows, no gradients, no blur — flat terminal aesthetic
- Depth via borders and background color shifts only

## 6. Agent Prompt Guide

### Iteration Rules
1. Berkeley Mono only — never introduce a second typeface
2. Keep surfaces flat: no shadows, no gradients, no blur
3. Warm undertone: `#201d1d` not `#000000`, `#fdfcfc` not `#ffffff`
4. Border radius 4px everywhere except inputs (6px)
5. Semantic colors: `#007aff` blue, `#ff3b30` red, `#30d158` green, `#ff9f0a` orange
6. Three-stage interaction: default → hover → active
7. Borders use `rgba(15, 0, 0, 0.12)` — warm transparent dark
8. Spacing follows 8px grid
