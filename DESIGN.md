# Snapsort — Landing Page Design System & Brand Specification

This document provides the complete, authoritative design system, brand tokens, typography rules, component styling specifications, and implementation configurations for creating the **Snapsort** landing page. 

It is designed to be directly ingested by an AI coding agent or frontend engineer to build a landing page that seamlessly matches the native Snapsort macOS desktop application.

---

## 1. Brand Identity & Visual Philosophy

- **Product Essence:** 100% local, privacy-first intelligent image and video search for macOS. Nothing leaves the machine.
- **Aesthetic Direction:** Obsidian Dark Mode — high-contrast, tactile, modern craft. Precision engineering inspired by pro macOS creative tools, darkroom hardware, and terminal utilities.
- **Signature Elements:**
  - Deep layered obsidian surfaces (`#0F0F0F` to `#262626`).
  - High-voltage Amber/Gold accent (`#FFC400`) representing search focus and highlights.
  - Electric Cyan (`#5AC8FA`) for ML bounding boxes and computer-vision detection overlays.
  - Fully-rounded pill controls (`rounded-full`) contrasting against sleek rectangular media frames.
  - Subtle dark gradients and delicate 1px border lines (`#2A2A2A`).

---

## 2. Color Palette & Semantic Tokens

### 2.1 Surfaces & Backgrounds
Snapsort uses an elevation model built with subtle luminance steps:

| Token Name | Hex Code | Purpose & Usage |
|---|---|---|
| `--surface-0` | `#0F0F0F` | **Canvas Root**: Page background, hero background, full viewport base. |
| `--surface-1` | `#141414` | **Container Base**: Navbars, section backdrops, cards, sidebar elements. |
| `--surface-2` | `#1C1C1C` | **Elevated Layer**: Interactive cards, dropdowns, inputs, secondary buttons. |
| `--surface-3` | `#262626` | **Hover & Accent Layer**: Hover states, media placeholders, active item tiles. |

### 2.2 Borders & Dividers
| Token Name | Hex Code | Purpose & Usage |
|---|---|---|
| `--border` | `#2A2A2A` | Standard 1px border for cards, inputs, pills, and dividers. |
| `--border-subtle` | `#1E1E1E` | Very soft hairline dividers and nested element borders. |
| `--border-focus` | `#FFC400` | Active input outline, focused pills, matched search highlights. |

### 2.3 Typography Colors
| Token Name | Hex Code | Purpose & Usage |
|---|---|---|
| `--text` | `#F5F5F5` | **Primary Text**: Headings, active labels, body copy (high contrast, crisp). |
| `--text-muted` | `#8A8A8A` | **Secondary Text**: Captions, timestamps, descriptions, pill counters. |
| `--text-dim` | `#5A5A5A` | **Tertiary Text**: Placeholder text, disabled indicators, subtle metadata. |

### 2.4 Accents & Functional Colors
| Token Name | Hex Code | Purpose & Usage |
|---|---|---|
| `--accent` | `#FFC400` | **Brand Gold / Amber**: Primary CTA button, brand dot, active filter state, match glow. |
| `--accent-hover` | `#E5B000` | Primary CTA hover state. |
| `--accent-active` | `#CC9D00` | Primary CTA pressed/active state. |
| `--accent-ink` | `#111111` | Text and icon color rendered *on top of* `--accent` backgrounds. |
| `--accent-subtle` | `rgba(255, 196, 0, 0.12)` | Subtle tinted glow, badge background, chip highlight tint. |
| `--overlay-object`| `#5AC8FA` | **Computer Vision Cyan**: Object detection boxes, person face tags, radar cues. |
| `--danger` | `#FF5A4E` | Errors, warnings, destructive triggers. |
| `--success` | `#30D158` | Verified status, "100% Local / On-Device" confirmation badges. |

---

## 3. Typography Hierarchy

### 3.1 Font Families
- **Primary / Sans:** `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  - Clean geometric sans-serif with friendly curves and high legibility.
- **Monospace / Code:** `'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, monospace`
  - Used for terminal commands (`uv run snapsort`), hotkeys (`⌘K`), and technical specs.

### 3.2 Type Scale

| Level | Size | Line Height | Tracking | Weight | Example Usage |
|---|---|---|---|---|---|
| **Display / Hero** | `56px` – `64px` (`3.5rem`–`4rem`) | `1.08` | `-0.035em` | `800` (ExtraBold) | Hero main headline |
| **H1** | `40px` – `44px` (`2.5rem`–`2.75rem`) | `1.15` | `-0.03em` | `700` (Bold) | Section headlines |
| **H2** | `28px` – `32px` (`1.75rem`–`2rem`) | `1.25` | `-0.025em` | `700` (Bold) | Feature headers, sub-sections |
| **H3** | `20px` – `22px` (`1.25rem`–`1.375rem`) | `1.35` | `-0.02em` | `600` (SemiBold) | Feature card titles, modal titles |
| **Body Large** | `18px` – `20px` (`1.125rem`–`1.25rem`)| `1.6` | `-0.01em` | `400` (Regular) | Hero subheader, intro callouts |
| **Body Regular** | `15px` – `16px` (`0.9375rem`–`1rem`) | `1.5` | `normal` | `400` / `500` | Standard paragraph, card descriptions |
| **Body Small** | `13px` – `14px` (`0.8125rem`–`0.875rem`)| `1.4` | `normal` | `400` / `500` | Secondary copy, footer links |
| **Micro / Mono** | `11px` – `12px` (`0.6875rem`–`0.75rem`)| `1.3` | `+0.02em` | `500` / `600` | Chip counters (`tabular-nums`), badges |

> **Pro Tip on Numbers:** Always enable `tabular-nums` (or CSS `font-variant-numeric: tabular-nums;`) for frame rates, file counters, and metrics.

---

## 4. Logo & Wordmark Assets

The Snapsort brand features two primary logotype expressions:

### 4.1 Variant A: Dot Wordmark (`snapsort.`)
Used in navigation bars, headers, and standard horizontal branding. The letters are crisp off-white with a signature `#FFC400` dot.

```html
<div class="inline-flex items-baseline font-bold tracking-tight text-[#F5F5F5] text-2xl select-none">
  <span>snapsort</span>
  <span class="text-[#FFC400] text-[1.25em] leading-none ml-[1.5px]">.</span>
</div>
```

### 4.2 Variant B: Bracket Mark (`snaps[ ]rt`) & Icon Glyph
The "o" in snapsort is formed by an aperture-style bracket viewfinder icon.

#### Standalone Bracket Mark SVG (`size: 24` or scalable):
```svg
<svg width="24" height="24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Top Left Bracket -->
  <path d="M15 45 C15 25 25 15 45 15 C48 15 50 17 50 20 C50 23 48 25 45 25 C32 25 25 32 25 45 C25 48 23 50 20 50 C17 50 15 48 15 45 Z" fill="#FFC400" />
  <!-- Top Right Bracket -->
  <path d="M85 45 C85 25 75 15 55 15 C52 15 50 17 50 20 C50 23 52 25 55 25 C68 25 75 32 75 45 C75 48 77 50 80 50 C83 50 85 48 85 45 Z" fill="#FFC400" />
  <!-- Bottom Left Bracket -->
  <path d="M15 55 C15 75 25 85 45 85 C48 85 50 83 50 80 C50 77 48 75 45 75 C32 75 25 68 25 55 C25 52 23 50 20 50 C17 50 15 52 15 55 Z" fill="#FFC400" />
  <!-- Bottom Right Bracket -->
  <path d="M85 55 C85 75 75 85 55 85 C52 85 50 83 50 80 C50 77 52 75 55 75 C68 75 75 68 75 55 C75 52 77 50 80 50 C83 50 85 52 85 55 Z" fill="#FFC400" />
</svg>
```

#### Bracket Wordmark Inline HTML:
```html
<div class="inline-flex items-center gap-1 font-black tracking-tight text-[#F5F5F5] text-2xl select-none">
  <span>snaps</span>
  <svg class="mx-0.5 inline-block" width="22" height="22" viewBox="0 0 100 100" fill="none">
    <path d="M15 45 C15 25 25 15 45 15 C48 15 50 17 50 20 C50 23 48 25 45 25 C32 25 25 32 25 45 C25 48 23 50 20 50 C17 50 15 48 15 45 Z" fill="#FFC400" />
    <path d="M85 45 C85 25 75 15 55 15 C52 15 50 17 50 20 C50 23 52 25 55 25 C68 25 75 32 75 45 C75 48 77 50 80 50 C83 50 85 48 85 45 Z" fill="#FFC400" />
    <path d="M15 55 C15 75 25 85 45 85 C48 85 50 83 50 80 C50 77 48 75 45 75 C32 75 25 68 25 55 C25 52 23 50 20 50 C17 50 15 52 15 55 Z" fill="#FFC400" />
    <path d="M85 55 C85 75 75 85 55 85 C52 85 50 83 50 80 C50 77 52 75 55 75 C68 75 75 68 75 55 C75 52 77 50 80 50 C83 50 85 52 85 55 Z" fill="#FFC400" />
  </svg>
  <span>rt</span>
</div>
```

---

## 5. UI Component Specs

### 5.1 Buttons
All primary and secondary action buttons utilize fully rounded ends (`border-radius: 9999px / rounded-full`).

#### Primary CTA (Download macOS):
- **Background:** `#FFC400`
- **Text:** `#111111` (font weight: `700` Bold)
- **Padding:** `px-6 py-3.5` (height: `48px` / `h-12`)
- **Radius:** `rounded-full`
- **Shadow:** `0 1px 2px rgba(0,0,0,0.2)`
- **Hover:** `bg-[#E5B000] scale-[1.02] transition-transform`
- **Active:** `bg-[#CC9D00] scale-[0.98]`
- **Focus:** `outline-none ring-2 ring-[#FFC400] ring-offset-2 ring-offset-[#0F0F0F]`

#### Secondary Action (GitHub / Docs / Release Notes):
- **Background:** `#1C1C1C`
- **Border:** `1px solid #2A2A2A`
- **Text:** `#F5F5F5` (font weight: `500` Medium)
- **Hover:** `bg-[#262626] border-[#3A3A3A] text-white`
- **Radius:** `rounded-full`

#### Ghost / Nav Links:
- **Background:** Transparent
- **Text:** `#8A8A8A`
- **Hover:** `text-[#F5F5F5] bg-[#1C1C1C]/50`
- **Radius:** `rounded-full`

---

### 5.2 Filter Pills & Feature Chips
Signature interactive elements representing search tags, AI filters, and facets:

```html
<!-- Standard Filter Pill -->
<div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1C1C1C] text-[#F5F5F5] border border-[#2A2A2A] hover:border-[#8A8A8A] transition-colors cursor-pointer select-none">
  <span>Beach</span>
  <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#262626] text-[#8A8A8A] tabular-nums">42</span>
</div>

<!-- Active Filter Pill (Selected) -->
<div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#FFC400] text-[#111111] shadow-sm select-none">
  <span>Anna</span>
  <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-black/15 text-[#111111] tabular-nums">128</span>
</div>

<!-- AI-Generated Filter Pill (with Sparkle) -->
<div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1C1C1C] text-[#F5F5F5] border border-[#2A2A2A] select-none">
  <span class="text-[#FFC400]">✦</span>
  <span>wearing red</span>
</div>
```

---

### 5.3 Media Cards & Search Highlights

- **Aspect Ratio:** `16:10` (or `aspect-[16/10]`) uniform cards.
- **Card Background:** `#141414`
- **Card Border:** `1px solid #2A2A2A`
- **Border Radius:** `16px` (`rounded-2xl` on large feature containers, `rounded-xl` / `12px` on grid items).
- **Match Highlight State (The "Yellow Outline" signature):**
  - When an item matches a query, apply:
    - `border-2 border-[#FFC400]`
    - `box-shadow: 0 0 16px -2px rgba(255, 196, 0, 0.25)`

#### Computer Vision Bounding Box Overlay:
- For showcasing person and object detection:
  - Bounding box border: `1.5px solid #5AC8FA` (Electric Cyan)
  - Tag pill: `bg-[#5AC8FA] text-[#0F0F0F] text-[10px] font-bold px-1.5 py-0.5 rounded-sm`

---

### 5.4 Privacy & Local Specs Badges

```html
<!-- "100% On-Device" Pill Badge -->
<span class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#1C1C1C] text-[#F5F5F5] border border-[#2A2A2A]">
  <span class="w-2 h-2 rounded-full bg-[#30D158] animate-pulse"></span>
  Zero Cloud Calls • 100% Local Apple Silicon
</span>
```

---

## 6. Spacing, Borders, and Radii Guidelines

| Property | Values | Notes |
|---|---|---|
| **Border Radii** | `9999px` (`rounded-full`) | Buttons, badges, search bars, filter pills, counter tags. |
| | `16px` (`rounded-2xl`) | Feature preview cards, interactive demo containers. |
| | `12px` (`rounded-xl`) | Grid cards, dropdown menus, modals. |
| | `8px` (`rounded-lg`) | Code command blocks, tooltips. |
| **Grid Spacing** | `gap-4` to `gap-6` (16px–24px)| Between grid cards. |
| **Section Padding** | `py-20` to `py-28` (80px–112px)| Vertical padding between major landing page sections. |
| **Max Container** | `max-w-6xl` (1152px) or `max-w-7xl` (1280px)| Centered with `mx-auto px-6`. |

---

## 7. Ambient Lighting & Effects

To achieve the premium obsidian hardware vibe without clutter:

### 7.1 Subtle Amber Ambient Radial Glow
Place in the hero section behind the primary headline or app mockup:
```css
background: radial-gradient(
  60% 50% at 50% 0%, 
  rgba(255, 196, 0, 0.08) 0%, 
  rgba(255, 196, 0, 0.02) 40%, 
  transparent 100%
);
```

### 7.2 Glassmorphism Navbar (Fixed Top)
- **Background:** `rgba(15, 15, 15, 0.8)` (`backdrop-blur-md`)
- **Border Bottom:** `1px solid rgba(42, 42, 42, 0.6)`

---

## 8. Ready-to-Use Code Configurations

### 8.1 Pure CSS Variables (`tokens.css`)

```css
:root {
  /* Surfaces */
  --surface-0: #0f0f0f;
  --surface-1: #141414;
  --surface-2: #1c1c1c;
  --surface-3: #262626;

  /* Borders */
  --border: #2a2a2a;
  --border-subtle: #1e1e1e;
  --border-focus: #ffc400;

  /* Typography */
  --text: #f5f5f5;
  --text-muted: #8a8a8a;
  --text-dim: #5a5a5a;

  /* Accents & Brand */
  --accent: #ffc400;
  --accent-hover: #e5b000;
  --accent-active: #cc9d00;
  --accent-ink: #111111;
  --accent-subtle: rgba(255, 196, 0, 0.12);

  /* Functional */
  --overlay-object: #5ac8fa;
  --danger: #ff5a4e;
  --success: #30d158;

  /* Fonts */
  --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, monospace;
}

body {
  background-color: var(--surface-0);
  color: var(--text);
  font-family: var(--font-sans);
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

---

### 8.2 Tailwind CSS v4 Configuration (`app.css` / `@theme`)

If using Tailwind CSS v4:

```css
@import "tailwindcss";

@theme {
  --color-surface-0: #0f0f0f;
  --color-surface-1: #141414;
  --color-surface-2: #1c1c1c;
  --color-surface-3: #262626;

  --color-border-base: #2a2a2a;
  --color-border-subtle: #1e1e1e;

  --color-text-base: #f5f5f5;
  --color-text-muted: #8a8a8a;
  --color-text-dim: #5a5a5a;

  --color-accent: #ffc400;
  --color-accent-hover: #e5b000;
  --color-accent-active: #cc9d00;
  --color-accent-ink: #111111;

  --color-overlay-cv: #5ac8fa;
  --color-status-success: #30d158;
  --color-status-danger: #ff5a4e;

  --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'SF Mono', 'JetBrains Mono', Menlo, monospace;

  --radius-pill: 9999px;
  --radius-card: 16px;
}
```

---

### 8.3 Tailwind CSS v3 Configuration (`tailwind.config.js`)

If using Tailwind CSS v3:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0F0F0F',
          1: '#141414',
          2: '#1C1C1C',
          3: '#262626',
        },
        border: {
          DEFAULT: '#2A2A2A',
          subtle: '#1E1E1E',
        },
        text: {
          DEFAULT: '#F5F5F5',
          muted: '#8A8A8A',
          dim: '#5A5A5A',
        },
        accent: {
          DEFAULT: '#FFC400',
          hover: '#E5B000',
          active: '#CC9D00',
          ink: '#111111',
          subtle: 'rgba(255, 196, 0, 0.12)',
        },
        overlay: {
          object: '#5AC8FA',
        },
        status: {
          success: '#30D158',
          danger: '#FF5A4E',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        pill: '9999px',
      },
      boxShadow: {
        match: '0 0 16px -2px rgba(255, 196, 0, 0.25)',
      },
    },
  },
  plugins: [],
};
```

---

## 9. Google Fonts Embed Snippet

To load the official typeface in `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

---

## 10. Summary Quick Reference for Coding Agents

When styling any landing page element:
1. **Background**: Always default to `#0F0F0F`. Never use pure `#000000` or washed out gray `#1F2937`.
2. **Cards**: Use `#141414` with a `1px solid #2A2A2A` border and `rounded-2xl` (16px).
3. **Buttons & Pills**: Always use `rounded-full`.
4. **Primary CTA**: `#FFC400` background with bold `#111111` ink.
5. **Secondary CTA**: `#1C1C1C` background with `#F5F5F5` text and `#2A2A2A` border.
6. **Highlights**: Accent yellow `#FFC400` border with a subtle golden glow.
7. **Computer Vision elements**: Cyan `#5AC8FA` bounding boxes and labels.
8. **Font**: Plus Jakarta Sans everywhere, monospace for CLI and shortcuts.
