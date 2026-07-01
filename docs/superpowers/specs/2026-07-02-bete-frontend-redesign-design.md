# Bete Frontend Redesign — IMPHNEN Design System Deep Integration

**Date:** 2026-07-02
**Status:** Design Spec (draft)
**Project:** Bete — Guild Moderation Watcher for IMPHNEN Discord
**Approach:** "Deep Foundation" (Layer 0 → 4)

---

## Overview

Bete is a real-time Discord moderation dashboard serving the IMPHNEN community. The frontend (React 19 + Vite 8 + Tailwind 4) already has the IMPHNEN design tokens partially applied, but suffers from:

1. **Fragmented color system** — many components bypass CSS variables with hardcoded Tailwind utility colors (emerald, amber, orange, red — documented in `DESIGN_TOKENS.md` §13)
2. **No dark mode** — the design system only defines light tokens
3. **Inconsistent brand expression** — Sidebar collapses brand assets, navigation feels detached from community identity
4. **Mobile experience is minimal** — only a basic `MobileTabBar`
5. **Technical debt** in animation keyframes, z-index scale, component variant consistency

This design spec outlines a systematic redesign across 5 layers, executed top-to-bottom (foundation → components → layout → features → polish), with **light + dark mode support** baked in from the start.

---

## Layer 0: Design Tokens & Theme System

### Current State

- CSS custom properties defined in `styles.css` under `:root` — light only
- Tailwind config duplicates token definitions in JS — fragmentasi source of truth
- `DESIGN_TOKENS.md` documents 13 known issues, mostly hardcoded hex colors bypassing the token system

### Proposed System

#### Theme Engine

CSS-first approach. Tailwind 4 `@theme` directive references CSS custom properties. Dark mode driven by `prefers-color-scheme` and manual `[data-theme="dark"]` attribute toggle.

```css
/* styles.css */
:root {
  /* Light tokens */
  --surface: #ffffff;
  --on-surface: #1a1a1a;
  --primary: #23a1eb;
  --primary-soft: #e1f0fd;
  --border: #e0e0e0;
  /* … */
}

[data-theme="dark"] {
  --surface: #1c1c1f;
  --on-surface: #f0f0f2;
  --primary: #54a2ff;
  --primary-soft: #18263a;
  --border: #343438;
  /* … */
}

@theme {
  --color-primary: var(--primary);
  --color-primary-soft: var(--primary-soft);
  /* … */
}
```

#### Dark Mode Palette

| Token | Light | Dark |
|-------|-------|------|
| `--surface` | `#ffffff` | `#1c1c1f` |
| `--surface-dim` | `#f5f5f5` | `#141417` |
| `--surface-container` | `#e8e8e8` | `#26262a` |
| `--surface-bright` | `#ffffff` | `#2c2c30` |
| `--on-surface` | `#1a1a1a` | `#f0f0f2` |
| `--on-surface-variant` | `#666666` | `#a0a0a6` |
| `--inverse-surface` | `#1a1a1a` | `#f0f0f2` |
| `--inverse-on-surface` | `#f5f5f5` | `#1a1a1a` |
| `--primary` | `#23a1eb` | `#54a2ff` |
| `--primary-soft` | `#e1f0fd` | `#18263a` |
| `--primary-hover` | `#1a8fd9` | `#3d8ee8` |
| `--secondary` | `#1877f2` | `#4a8ef5` |
| `--secondary-soft` | `#e7f1ff` | `#1a274a` |
| `--tertiary` | `#5865f2` | `#7984f5` |
| `--tertiary-soft` | `#eef0ff` | `#20266a` |
| `--border` | `#e0e0e0` | `#343438` |
| `--border-hover` | `#cccccc` | `#48484d` |
| `--outline` | `#999999` | `#6a6a70` |
| `--outline-variant` | `#cccccc` | `#404044` |
| `--success` | `#22c55e` | `#34d399` |
| `--success-soft` | `#dcfce7` | `#13261a` |
| `--warning` | `#f59e0b` | `#fbbf24` |
| `--warning-soft` | `#fef3c7` | `#261a10` |
| `--destructive` | `#e4405f` | `#f87171` |
| `--destructive-soft` | `#ffebee` | `#2a1418` |
| `--info` | `#3b82f6` | `#60a5fa` |
| `--info-soft` | `#dbeafe` | `#141e38` |

#### Theme Switching

- **Default**: follow `prefers-color-scheme`
- **Manual toggle**: `[data-theme="dark"]` attribute on `<html>`, persisted to `localStorage`
- **Transition**: CSS `transition: background-color 200ms, color 150ms` on `body` and key containers
- All components respond without re-render since they reference CSS variables

#### Migration Strategy (Hardcoded Hex → CSS Vars)

All components documented in `DESIGN_TOKENS.md` §13 will be migrated:

**Before** (example from `MessageCard.tsx`):
```tsx
className="bg-red-100 text-red-700 border-red-200"
```

**After**:
```tsx
className="bg-destructive-soft text-destructive border-destructive/20"
```

Where `--destructive-soft`, `--destructive`, `--destructive/20` are CSS variable–backed.

#### Z-Index Registry

Standardize z-index stack to avoid collisions:

| Value | Component |
|-------|-----------|
| `10` | Sticky Header |
| `20` | Sidebar |
| `30` | Tab Strip (sticky if scrolled) |
| `40` | Toast Container |
| `50` | Mobile Bottom Nav |
| `60` | Mascot Chatbot |
| `70` | Modal / Dialog |
| `100` | Overlay backdrop |

---

## Layer 1: Shared UI Components

### Guiding Principle

Every component matches exactly **one** design token reference per visual property. No component uses raw Tailwind utility colors like `emerald-*`, `amber-*`, `red-*` — only CSS variables.

### Component Audit & Changes

#### Button (`shared/ui/button.tsx`)
**Status:** Mostly good — uses CSS vars already ✅
**Changes:**
- Add `variant: "tertiary"` (#5865f2 / #7984f5 dark) for Discord-specific actions
- Add `size: "icon-sm"` (h-8 w-8, h-4 w-4 icon) for compact icon buttons
- Ensure `active:scale-[0.97]` is consistent across all variants

#### Badge (`shared/ui/badge.tsx`)
**Status:** Needs fix — `success` uses hardcoded `emerald-100 text-emerald-700` ❌
**Changes:**
- Map `success` → `bg-success-soft text-success`
- Map `warning` → `bg-warning-soft text-warning`
- Add `variant: "tertiary"` for Discord brand accent
- All variants reference CSS variables

#### Card (`shared/ui/card.tsx`)
**Status:** Good — `shadow-sm hover:shadow-md transition-shadow` ✅
**Changes:**
- Add `variant: "elevated"` for modals/important containers (shadow-md default, shadow-lg hover)
- Add `variant: "bordered"` for inline containers (border only, no shadow)

#### Input (`shared/ui/input.tsx`)
**Status:** Good — proper focus ring, border ✅
**Changes:**
- Add `variant: "soft"` for search/filter inputs (muted background, no border on idle)
- Add `disabled` styling that's distinct (not just opacity-50)

#### Select (`shared/ui/select.tsx`)
**Status:** Same as Input — needs soft variant ✅
**Changes:**
- Same `variant: "soft"` for filters
- Chevron icon should use primary color on focus

#### Toast (`shared/ui/toast.tsx`)
**Status:** Needs rewrite — `emerald-500`/`amber-500` hardcoded ❌
**Changes:**
- Replace `border-l-emerald-500 text-emerald-500` → `border-l-success text-success`
- Replace `border-l-amber-500 text-amber-500` → `border-l-warning text-warning`
- Change z-index from `z-50` to `z-40` to avoid colliding with MobileTabBar
- Stack animation: slide-in from right, fade-out

#### Skeleton (`shared/ui/skeleton.tsx`)
**Status:** `animate-shimmer` duration mismatch between CSS (1.5s) and Tailwind config (2s) ❌
**Changes:**
- Pick **CSS as canonical** (1.5s ease-in-out)
- Remove duplicate from Tailwind config
- Add `variant` prop: `rounded`, `circular`, `rectangular`
- Add `width`/`height` props with sensible defaults

#### Tabs (`shared/ui/tabs.tsx`)
**Status:** Good — Radix-based, uses CSS vars ✅
**Changes:**
- Add `variant: "pills"` for filter-style tabs (used in Messages filter bar)
- Add `variant: "underline"` for navigation tabs (used instead of sidebar tab switching)
- TabsContent should have `mt-6` spacing consistent

#### ScrollArea (`shared/ui/scroll-area.tsx`)
**Status:** Good ✅
**Changes:**
- Style scrollbar thumb with design system `--border` and `--primary` on hover

### New Components

#### Switch (`shared/ui/switch.tsx`)
- Radix `Switch` primitive
- Colors: `--border` (off), `--primary` (on), thumb white
- Dark mode aware via CSS vars
- For settings toggles (future: retention policies, auto-delete config)

#### Dialog (`shared/ui/dialog.tsx`)
- Radix `Dialog` primitive
- Overlay: `bg-black/40 backdrop-blur-sm`
- Content: Card variant `elevated`, max-w-md, centered
- Enter: scaleIn + fadeIn animations
- For confirmations, warnings, and future settings panels

#### DropdownMenu (`shared/ui/dropdown-menu.tsx`)
- Radix `DropdownMenu` primitive
- Trigger: ghost button
- Content: card surface with shadow-lg, rounded-lg
- Items: list-item pattern with hover state
- For overflow actions (message actions, bulk operations)

#### EmptyState (`shared/ui/empty-state.tsx`)
Standard empty/error/loading state component:
- Props: `icon` (Lucide), `title` (string), `description` (string), `action` ({label, onClick} | ReactNode)
- Visual: centered flexbox, mascot-style illustration or icon, muted text
- Animation: fade-in-up on mount
- All feature panels use this — no more ad-hoc empty states

#### IconButton (`shared/ui/icon-button.tsx`)
- Sizes: `sm` (h-8 w-8), `md` (h-10 w-10), `lg` (h-12 w-12)
- Variants: `ghost`, `outline`, `primary`, `destructive`, `tertiary`
- Tooltip on hover (custom or Radix Tooltip)
- For action buttons in MessageCard (reanalyze, moderate, etc.)

---

## Layer 2: Layout & Navigation

### Guiding Principle

The layout is the "frame" for IMPHNEN's brand identity. Every structural decision reinforces the community-centered moderation tool narrative.

### Desktop Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ┌─────────┐  ┌──────────────────────────────────────────────┐   │
│ │         │  │  [Logo] IMPHNEN              ● ● ●           │   │
│ │  SIDEBAR │  │            Guild Watcher   🟢 Online 🟡 Idle│   │
│ │  w-64    │  ├──────────────────────────────────────────────┤   │
│ │  fixed   │  │                                              │   │
│ │          │  │  ┌── TAB STRIP ──────────────────────────┐   │   │
│ │  ● Logo  │  │  │ [≡] Pesan    Voice    Dashboard      │   │   │
│ │  "IMPH-  │  │  └──────────────────────────────────────┘   │   │
│ │   NEN"   │  │                                              │   │
│ │  Guild   │  │  ┌── MAIN CONTENT (max-w-1280) ─────────┐   │   │
│ │  Watcher │  │  │                                        │   │   │
│ │          │  │  │  [Page title]                          │   │   │
│ │  ─────── │  │  │  [Subtitle]                            │   │   │
│ │          │  │  │                                        │   │   │
│ │  [💬]    │  │  │  [Content — cards, lists, grids]      │   │   │
│ │   Pesan  │  │  │                                        │   │   │
│ │  [📡]    │  │  │                                        │   │   │
│ │   Voice  │  │  │                                        │   │   │
│ │  [📊]    │  │  │                                        │   │   │
│ │   Guild  │  │  │                                        │   │   │
│ │          │  │  └──────────────────────────────────────────┘   │
│ │  ─────── │  │                                              │   │
│ │  🐱      │  │                                              │   │
│ │  Mascot  │  │                                              │   │
│ └─────────┘  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

#### Sidebar

- **Desktop**: `w-64`, **expanded by default** with mascot visible
- Collapsible via hamburger toggle to `w-16` (icon-only)
- **Brand section**: Logo + gradient "IMPHNEN" text + "Guild Watcher" subtitle + live dot
- **Nav items**: Icon + label, active state with `--primary-soft` background
- **Mascot section**: Small mascot image (clickable → chat), active status, at bottom
- **Border-right**: `border-[--border]`
- **Sticky**: Full height, fixed on scroll

#### Header (Brand Bar)

- **Sticky top-0**, `z-10`
- **Left**: Logo + brand name (40% width)
- **Right**: Status badges row (WS indicator, Voice indicator, Theme toggle, Notification bell)
- **Background**: `bg-surface/70 backdrop-blur-md`
- **Border-bottom**: `border-[--border]`
- **Height**: `h-14` (56px) — more compact than current (h-16)

#### Tab Strip

- **Horizontal** row below header, between brand bar and content
- **Tabs**: `[Messages] [Voice & Media] [Dashboard Guild]`
- **Active indicator**: underline bar (selected) or filled pill
- **Sticky** with `z-20` when content scrolls
- On mobile: horizontal scroll with snap points

#### Content Area

- **Max-width**: `1280px`
- **Padding**: `p-4 md:p-6 lg:p-8`
- **Page title + subtitle** rendered inside content (not header), consistent across all 3 tabs
- **Grid gap**: `gap-6` between sections, `gap-4` between cards in a grid

### Mobile Layout

```
┌─────────────────────────┐
│  [←] IMPHNEN     ☰ 🌙  │  ← Compact header (brand + toggle)
├─────────────────────────┤
│  Tab Strip (horizontal  │
│  scroll, snap points)   │
├─────────────────────────┤
│                         │
│  Content (single col,   │
│  stacked vertically)    │
│                         │
│                         │
├─────────────────────────┤
│  💬    📡    📊    🐱 │  ← Bottom Nav (safe area)
└─────────────────────────┘
```

- **Header**: Compact — brand + collapse/expand + theme toggle
- **Tab Strip**: Horizontal scroll, no Sidebar
- **Bottom Nav**: 4 tabs (Messages, Voice, Dashboard, Mascot) with active state indicator
- **Safe area**: `pb-4 md:pb-0` for notched devices
- **Particle background**: Skipped entirely on mobile

### Particle Background

**Status:** Three.js canvas, always rendered ✅ but heavy
**Changes:**
- Only render when `prefers-reduced-motion: no-preference`
- **Mobile**: Skip entirely (conditional render via `useMediaQuery`)
- **Desktop**: Reduce particle count from current (default) to ~30 orbs
- Use CSS `opacity` transition for mount/unmount
- Color references `--primary` and `--tertiary` from CSS vars (currently hardcoded hex)

---

## Layer 3: Feature Components

### Guiding Principle

Every feature panel uses the same design language — same spacing, same typography, same color semantics, same interaction patterns. A user switching between Messages and Dashboard should feel like the same app.

### MessageCard (`features/messages/components/MessageCard.tsx`)

**Visual structure:**
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  [Avatar] username          [Badge] timestamp [actions] │
│                                                         │
│  Message content (word-wrap, max-height truncated)      │
│                                                         │
│  [flag badge 1] [flag badge 2] [flag badge 3]          │
│                                                         │
│  ──────────────────────────────────────────────         │
│    AI: Analysis summary (1-2 lines, collapsible)        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Changes:**
- Replace all hardcoded status colors with `Badge` component variants
  - `ai_status="clean"` → `<Badge variant="success">`
  - `ai_status="flagged"` → `<Badge variant="destructive">`
  - `ai_status="error"` → `<Badge variant="warning">`
  - `ai_status="pending"` → `<Badge variant="outline">`
- AI analysis section collapsible (default collapsed, show first 80 chars)
- Flag badges use `Badge` component (not inline spans)
- Avatar + username row compact (h-8 avatar, text-sm)
- Card hover: subtle shadow increase + border-highlight
- Action buttons (reanalyze) → `IconButton` component

### Dashboard Stats (`features/dashboard/components/DashboardStats.tsx`)

**Changes:**
- 4 stat cards: Total, Clean, Flagged, Error — using semantic colors
- `StatCard` component (internal or shared) with `variant` prop:
  - `variant="primary"` → icon + accent in primary color
  - `variant="success"` → icon + accent in success color
  - `variant="destructive"` → icon + accent in destructive color
  - `variant="warning"` → icon + accent in warning color
- Replace all hardcoded `emerald-*`, `blue-*`, `violet-*` with variant classes
- Grid: `sm:grid-cols-2 lg:grid-cols-4 gap-4`
- Animation: stagger with `cardStagger`

### UserSummaryList (`features/dashboard/components/UserSummaryList.tsx`)

**Changes:**
- Each user card: avatar + name + message count + status badge
- Status badges use semantic colors (clean → success, flagged → destructive)
- List item pattern with hover state
- Search input: `variant="soft"`
- Infinite scroll / pagination consistent

### UserProfileDetail (`features/dashboard/components/UserProfileDetail.tsx`)

**Changes:**
- All hardcoded `emerald-*`, `red-*`, `amber-*` → semantic CSS vars
- Detail sections with consistent spacing (`space-y-6`)
- Back button → `IconButton` with arrow-left
- Loading state → `Skeleton` with matching layout
- Error state → `EmptyState` with retry action

### ChannelProfileDetail (same pattern as UserProfileDetail)

### VoiceConnectionCard (`features/live/components/VoiceConnectionCard.tsx`)

**Changes:**
- Compact layout: guild select + channel select + connect button in one row
- Select dropdowns: `variant="soft"`
- Status indicator: `Badge` with connected/disconnected state
- Mic level meter: uses `--primary` as bar gradient

### AudioVisualizer (`features/live/components/AudioVisualizer.tsx`)

**Changes:**
- Read `--primary` CSS variable at paint time instead of hardcoded `#23a1eb`
- ```ts
  const primaryColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary').trim();
  ```
- Bar color adapts to theme (lighter in dark mode)
- Responsive height: `h-32 md:h-40`

### ActiveSpeakers (`features/live/components/ActiveSpeakers.tsx`)

**Changes:**
- Replace hardcoded `text-emerald-700` with `text-success`
- Stacked avatar + name + speaking indicator dot
- Speaking: `bg-success` dot with pulse animation
- Idle: `bg-outline` dot
- Empty state: "No active speakers" with `EmptyState` component

### RecordingsSubPanel (`features/live/components/RecordingsSubPanel.tsx`)

**Changes:**
- Replace `bg-white` → `bg-surface` (CSS var)
- Replace `border-sky-200` → `border-outline-variant`
- Recording item layout: icon + filename + size + date + action button

### MessagesPanel Search & Filters

**Changes:**
- Search input: `variant="soft"`, debounced input (300ms)
- Filter pills: `Tabs variant="pills"` with `[All] [Clean] [Flagged] [Error] [Pending]`
- Stat badges row at top: uses `Badge` with semantic variants (not inline hardcoded spans)

---

## Layer 4: Polish & Micro-interactions

### Entry Animations

| Element | Animation | Timing | Source |
|---------|-----------|--------|--------|
| Page/panel enter | `fadeSlideUp` | 0.5s, [0.25,0.46,0.45,0.94] | `useFramerStagger` |
| Card grid enter | `cardStagger` + `cardItem` | stagger 80ms, item 400ms | `useFramerStagger` |
| List items enter | `cardStagger` + `cardItem` | stagger 50ms, item 300ms | `useFramerStagger` |
| Modal/dialog enter | `scaleIn` | 0.3s, backOut spring | `useFramerStagger` |
| Toast enter | slideInRight | 0.3s ease-out | Inline |
| Theme switch | CSS transition | 200ms background, 150ms color | CSS global |
| Sidebar collapse/expand | Spring physics | stiffness 300, damping 30 | Inline (existing) |

### Loading States

All skeleton components use consistent `animate-shimmer` with `1.5s ease-in-out` (CSS-canonical):

| Component | Skeleton Pattern | Width/Height |
|-----------|-----------------|--------------|
| MessageCard | Card shape: 3 lines + header blob | Full card |
| StatCard | Rectangular blob + icon circle | h-24 |
| User list item | Avatar circle + 2 text lines | h-14 |
| Detail view | Sidebar + header + content blobs | Full view |

### Empty States

| Context | Title | Description | Action |
|---------|-------|-------------|--------|
| Messages (no data) | "Belum Ada Pesan" | "Tunggu aktivitas di server. Pesan akan muncul secara real-time." | — |
| Messages (no search results) | "Tidak Ditemukan" | "Tidak ada pesan yang cocok dengan pencarianmu." | [Clear Search] |
| Voice (disconnected) | "Belum Connect" | "Pilih guild dan channel voice, lalu klik Connect." | — |
| Voice (no speakers) | "Sunyi Senyap" | "Belum ada yang speak di channel ini." | — |
| Dashboard (no data) | "Data Belum Siap" | "Data guild akan muncul setelah gateway aktif." | [Refresh] |
| Dashboard (no users) | "Belum Ada Pengguna" | "Data pengguna akan terkumpul seiring aktivitas server." | — |
| Recordings (empty) | "Belum Ada Rekaman" | "Rekaman voice akan muncul setelah ada sesi voice." | — |

### Toast Notification System

- **Position**: `fixed top-4 right-4 z-40` (not bottom — avoids MobileTabBar collision)
- **Stack**: gap-2, newest at top, max 5 visible
- **Types**: `info`, `success`, `error`, `warning` — all using semantic CSS vars
- **Auto-dismiss**: 4s (existing), with close button
- **Entry**: slide from right
- **Exit**: fade out + slide right
- **Grouping**: consecutive same-type toasts from same source merge into one

### Theme Toggle

- **Location**: Header (right side, near status badges)
- **Icon**: Sun/Moon from Lucide, animated (rotate + scale on switch)
- **Default**: Follow `prefers-color-scheme` media query
- **Persistence**: `localStorage.setItem('theme', 'light' | 'dark' | 'system')`
- **DOM attribute**: `document.documentElement.dataset.theme`
- **Transition**: CSS `transition` on `body` and card surfaces for smooth cross-fade

### Mascot Chatbot

- **Toggle**: Sidebar bottom button (existing) — playful bounce on click
- **Panel**: Floating card (320px wide) anchored to sidebar, not `z-[9999]`
- **Chat bubble**: Rounded-xl with primary-soft background, subtle shadow
- **Input**: `variant="soft"`, compact, with send icon
- **Empty state**: Mascot greeting in IMPHNEN voice: "Hai! Ada yang bisa dibantu?"
- **Error state**: "Wah, lagi error nih. Coba lagi ya!"
- **Reduced motion**: Chatbot itself has no animation, only fade mount

### Hover & Active States

| Element | Hover | Active | Transition |
|---------|-------|--------|------------|
| Sidebar nav item | `bg-primary-soft/50` | `bg-primary-soft` | 200ms |
| Card | `shadow-md border-primary/20` | — | 300ms |
| Button | Brightness/shift | `scale-[0.97]` | 150ms |
| List item | `bg-surface-container-high` | — | 150ms |
| Badge | Cursor pointer (if clickable) | — | — |
| Input | `border-hover` | `border-primary + ring` | 150ms |

---

## Spec Self-Review

### Placeholder Scan
- All sections above are complete with specific values (hex codes, component shapes, animation timings). No "TBD" or "TODO" remains.

### Internal Consistency
- Layer 0 (theme tokens) feeds directly into Layer 1 (components via CSS vars), Layer 2 (layout) uses same tokens. No contradiction.
- Dark palette maintains IMPHNEN's primary/secondary/tertiary distinction — secondary stays social-platform, tertiary stays Discord-specific.
- Z-index scale (z-10 through z-100) resolves existing collision between Toast (z-50) and MobileTabBar (z-50).
- Animation timings across layers: entry animations (0.3–0.5s), hover (150–200ms), theme switch (150–200ms) — all within IMPHNEN's "snappy" < 300ms promise.

### Scope Check
- Focused on visual redesign and brand cohesion of the existing React frontend.
- No changes to backend, API, database, or WebSocket protocol.
- No new features — all existing functionality is preserved, only the visual layer is redesigned.
- Scope is appropriate for a single implementation plan (see below).

### Ambiguity Check
- All design decisions are explicit: hex values, component variants, animation timings, layout measurements.
- The "ParticleBackground" behavior on mobile is specifically defined (skipped).
- Dark mode fallback is explicitly defined (system preference → manual toggle).

---

## Migration Sequence

The redesign will be implemented in order (Layer 0 → 4), with testing at each layer before proceeding:

1. **Layer 0** — Theme tokens, dark mode palette, CSS variable migration, fix shimmer mismatch, fix z-index
2. **Layer 1** — Badge (fix colors), Toast (rewrite), Skeleton (fix shimmer), new primitives (Switch, Dialog, EmptyState, IconButton)
3. **Layer 2** — Sidebar (expanded default), Header (simplified brand bar), Tab Strip (new), Mobile layout (overhaul), Particle (lazy)
4. **Layer 3** — MessageCard (refine), Dashboard (stat/User/Channel components), Live panels (AudioVisualizer, Speakers, Recordings)
5. **Layer 4** — Entry animations audit, empty/loading states, theme toggle, toast positioning, mascot polish, hover state consistency

Each layer is tested in both light and dark modes before proceeding to the next.

---

## Appendix: Feature Panel Map

| File | Layer | Priority | Changes |
|------|-------|----------|---------|
| `tailwind.config.js` | 0 | P0 | Remove duplicate tokens, keep only what `@theme` can't cover |
| `styles.css` | 0 | P0 | Add dark mode `:root` overrides, make canonical |
| `DESIGN_TOKENS.md` | 0 | P0 | Update to reflect changes, remove resolved issues |
| `shared/ui/badge.tsx` | 1 | P0 | Fix hardcoded success/warning colors |
| `shared/ui/toast.tsx` | 1 | P0 | Rewrite with CSS vars, fix z-index, change position |
| `shared/ui/skeleton.tsx` | 1 | P0 | Fix shimmer duration, add variants |
| `shared/ui/button.tsx` | 1 | P1 | Add tertiary variant, icon-sm size |
| `shared/ui/card.tsx` | 1 | P1 | Add elevated/bordered variants |
| `shared/ui/input.tsx` | 1 | P1 | Add soft variant |
| `shared/ui/empty-state.tsx` | 1 | P0 | New component |
| `shared/ui/switch.tsx` | 1 | P2 | New component |
| `shared/ui/dialog.tsx` | 1 | P2 | New component |
| `shared/ui/icon-button.tsx` | 1 | P1 | New component |
| `widgets/Sidebar.tsx` | 2 | P0 | Expanded default, better brand display |
| `widgets/Header.tsx` | 2 | P0 | Simplified brand bar, theme toggle |
| `widgets/DashboardLayout.tsx` | 2 | P0 | Add TabStrip, adjust layout |
| `widgets/TabStrip.tsx` | 2 | P0 | New component |
| `widgets/MobileTabBar.tsx` | 2 | P1 | Refine bottom nav, add safe area |
| `widgets/ParticleBackground.tsx` | 2 | P1 | Lazy render, mobile skip, CSS var colors |
| `features/messages/components/MessageCard.tsx` | 3 | P0 | Fix all hardcoded colors, use Badge |
| `features/messages/components/MessagesPanel.tsx` | 3 | P0 | Fix hardcoded stat badges |
| `features/messages/components/ImageGrid.tsx` | 3 | P1 | Fix hardcoded colors |
| `features/dashboard/components/DashboardStats.tsx` | 3 | P0 | Semantic color cleanup |
| `features/dashboard/components/UserSummaryList.tsx` | 3 | P0 | Fix hardcoded colors |
| `features/dashboard/components/UserProfileDetail.tsx` | 3 | P0 | Fix hardcoded colors |
| `features/dashboard/components/ChannelProfileDetail.tsx` | 3 | P1 | Fix hardcoded colors |
| `features/live/components/AudioVisualizer.tsx` | 3 | P0 | Read CSS var, not hardcoded hex |
| `features/live/components/ActiveSpeakers.tsx` | 3 | P1 | Fix hardcoded emerald |
| `features/live/components/RecordingsSubPanel.tsx` | 3 | P1 | Fix bg-white, fix sky-200 |
| `features/live/components/VoiceConnectionCard.tsx` | 3 | P2 | Compact layout |
| `features/auth/index.tsx` | 2 | P1 | Use EmptyState, consistent spacing |
| `App.tsx` | 2 | P0 | Add TabStrip state, theme toggle |
| All feature hooks | 3 | P2 | No visual changes |
