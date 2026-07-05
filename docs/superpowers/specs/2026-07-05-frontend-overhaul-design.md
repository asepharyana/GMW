# Frontend Overhaul — IMPHNEN Dashboard

**Date:** 2026-07-05
**Status:** Spec (approved design, pre-implementation)

---

## 1. Goals

1. **Visual redesign** — Elevate the dashboard from "functional prototype" to "premium monitoring tool" using the Neuform-inspired dark design language (AeroNet, Nexus Capital, Summit references from `design/`).
2. **Code restructure** — Split oversized files, modularize CSS, eliminate inline styles, and add consistent state handling across all components.

---

## 2. Scope

Two sequential phases, both targeting the Leptos 0.9.0-alpha WASM frontend at `services/frontend/frontend/`.

| Phase | Focus | Deliverables |
|-------|-------|-------------|
| **Fase 1** | Code Restructure | File splits, CSS modules, inline→classes, state consistency |
| **Fase 2** | Visual Redesign | Palette, layout, all panels, UI primitives |

---

## 3. File Splitting (Fase 1)

### 3.1 `message_card.rs` (453 lines → 4 files)

| New file | Content | Lines (est.) |
|----------|---------|-------------|
| `message_card.rs` | Main component — card layout orchestration | ~100 |
| `message_embed.rs` | Discord embed rendering (title, fields, images, footer) | ~120 |
| `message_meta.rs` | Author row, timestamp, channel badge, AI status chip | ~100 |
| `message_actions.rs` | Reanalyze button, moderate action, expand/collapse | ~80 |

### 3.2 `messages/mod.rs` (397 lines → 3 files)

| New file | Content | Lines (est.) |
|----------|---------|-------------|
| `mod.rs` | Panel orchestrator — wires FilterBar + MessageList | ~60 |
| `filter_bar.rs` | Channel picker, search input, status filter chips, live count | ~150 |
| `message_list.rs` | Infinite scroll logic, pagination, skeleton/empty/error states | ~180 |

### 3.3 `ws/socket.rs` (227 lines → 2 files)

| New file | Content | Lines (est.) |
|----------|---------|-------------|
| `connection.rs` | WebSocket lifecycle (connect, reconnect, heartbeat, close) | ~120 |
| `handlers.rs` | Event dispatch — maps WS event types to signal updates | ~100 |

### 3.4 Dashboard (`dashboard/mod.rs`, 276 lines)

Already well-split (`stats_overview.rs`, `channel_summary_list.rs`, `user_summary_list.rs` are separate). Extract orchestrator wiring from `mod.rs` into a focused panel component. No further splitting needed.

---

## 4. CSS Architecture (Fase 1)

### 4.1 File Structure

```
src/styles/
├── main.css          @import hub — imported by index.html
├── tokens.css        CSS custom properties (dark + light)
├── reset.css         Reset, base elements, scrollbar, selection
├── utilities.css     Utility classes (flex, gap, grid, w-full, etc.)
├── layout.css        App shell, sidebar, topbar, content area, mobile tab
├── ui.css            Button, card, input, select, modal, badge,
│                     skeleton, tabs, scroll area, toast, status badge
├── messages.css      Message card, feed, embed, image grid, filter bar
├── live.css          Voice connection, speakers, visualizer, mic meter,
│                     music player, screen share, recordings, waveform
├── dashboard.css     Stats overview, channel/user summary lists
└── polish.css        Particle background, theme toggle, mascot chatbot
```

### 4.2 Bundling

`index.html` links to `src/styles/main.css`. Trunk resolves `@import` statements and bundles into a single CSS file in the build output. Ordering is guaranteed by `@import` sequence.

### 4.3 Design Tokens (`tokens.css`)

#### Dark theme (default — `:root` without attribute selector)

```css
:root {
  --surface-base: #050510;
  --surface-raised: #0a0a1a;
  --surface-overlay: #12122a;
  --surface-container: #1a1a35;
  --surface-border: rgba(255, 255, 255, 0.06);
  --surface-hover: rgba(59, 130, 246, 0.06);
  --surface-glass: rgba(5, 5, 16, 0.78);

  --text-primary: #f1f1f9;
  --text-secondary: #9d9db5;
  --text-tertiary: #5c5c78;
  --text-inverse: #050510;

  --color-primary: #3b82f6;
  --color-primary-hover: #60a5fa;
  --color-primary-active: #2563eb;
  --color-primary-muted: rgba(59, 130, 246, 0.12);
  --gradient-primary: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
  --gradient-brand: linear-gradient(135deg, #3b82f6 0%, #5865f2 50%, #6366f1 100%);

  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;

  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.4);

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 23px;
  --radius-pill: 9999px;

  --sidebar-width: 240px;
  --header-height: 0px; /* header dihapus */
}
```

#### Light theme (`[data-theme="light"]`)

```css
[data-theme="light"] {
  --surface-base: #f4f6fb;
  --surface-raised: #ffffff;
  --surface-overlay: #eeeff4;
  --surface-container: #dde0e8;
  --surface-border: rgba(0, 0, 0, 0.06);
  --surface-hover: rgba(35, 161, 235, 0.05);
  --surface-glass: rgba(255, 255, 255, 0.72);

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-tertiary: #94a3b8;
  --text-inverse: #ffffff;

  --color-primary: #2563eb;
  --color-primary-hover: #3b82f6;
  --color-primary-active: #1d4ed8;
  --color-primary-muted: rgba(37, 99, 235, 0.1);
  --gradient-primary: linear-gradient(135deg, #2563eb 0%, #6366f1 100%);
  --gradient-brand: linear-gradient(135deg, #2563eb 0%, #5865f2 50%, #6366f1 100%);

  /* reuse same semantic tokens */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #2563eb;

  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.08);
}
```

---

## 5. Layout Architecture (Fase 2)

### 5.1 Current → Proposed

```
// Current (app.rs)
app-shell
├── app-header           (brand + ThemeToggle + WS status — redundant)
├── app-main
│   ├── app-sidebar     (TabButton × 3 — no icons, inline styles)
│   └── app-content     (tab panel)

// Proposed
app-shell
├── app-sidebar
│   ├── brand           (◉ IMPHNEN + "Guild Watcher" subtitle)
│   ├── nav             (3 items with lucide icons + active indicator)
│   └── footer          (WS status dot + compact ThemeToggle)
└── app-content
    └── tab-panel       (no header wrapper — full height)
```

### 5.2 Sidebar Specifics

- **Width:** 240px, full viewport height, sticky/fixed
- **Brand area:** 60px tall, logo placeholder (◉) + "IMPHNEN" bold + subtitle "Guild Watcher" (JetBrains Mono 11px)
- **Nav items:** icon (lucide-leptos) + label, 40px tall, border-radius 10px on hover/active
  - Active state: 3px left border indicator + `var(--surface-overlay)` background
- **Footer:** separated by a subtle divider, WS dot + status text + ThemeToggle icon-button
- **Mobile:** sidebar collapses or slides overlay, MobileTabBar at bottom

### 5.3 Content Area

- Full remaining width, scrollable, padding 24px (desktop)
- Max-width 1400px for readability
- No header at top — brand is in sidebar

---

## 6. Components Redesign (Fase 2)

### 6.1 Messages Panel

**FilterBar:**
- **Channel picker:** `<select>` redesigned — card-style dropdown with active channel name displayed, chevron icon
- **Search:** input with magnifying glass icon (lucide), compact height (36px)
- **Status chips:** pill-style toggle buttons — "All", "Clean", "Warn", "Flagged", "Error" — active chip gets primary background
- **Live count:** `--text-tertiary` label "X,XXX pesan" next to heading

**MessageCard:**
```
┌─────────────────────────────────────────────┐
│ @username · #channel · 12:34            ◉   │  ← meta row
├─────────────────────────────────────────────┤
│ Message content — Inter 14px,              │
│ line-height 1.5, wraps naturally           │
│                                             │
│ [Embed card-in-card]                        │
│ ┌───────────────────────────────────────┐   │
│ │ Embed title (semibold)                │   │
│ │ Embed description                     │   │
│ │ [thumbnail]                           │   │
│ └───────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│ ● Clean  98%   [⟳]  [⚙]                    │  ← actions bar
└─────────────────────────────────────────────┘
```

- Card: `surface-raised`, border `1px solid border`, radius `--radius-md`
- Meta row: JetBrains Mono 12px, `text-secondary`
- AI badge: chip dengan soft background (`--color-primary-muted` atau `--color-success` variant), 6px radius
- Content: Inter 14px, max 6 lines with fade gradient overflow
- Actions bar: icon-only buttons, visible always (not on hover)
- Timestamp: relative (baru dimodalin — "2m ago", "1h ago")
- Shadow: `--shadow-sm`

**States:**
| State | Component |
|-------|-----------|
| Loading | 3-5 skeleton cards, each with pulse animation (gradient shimmer) |
| Empty | Icon + "Belum ada pesan" + "Coba ubah filter atau channel" |
| Error | Error icon + error message + "Coba lagi" button |
| Success | Normal message list |

### 6.2 Live Panel (Bento Grid)

2-column grid with `gap: --space-4`:

```
┌──────────────────────┬──────────────────────┐
│ VoiceConnectionCard  │ ActiveSpeakers        │
├──────────────────────┼──────────────────────┤
│ AudioVisualizer      │ MicLevelMeter         │
├──────────────────────┴──────────────────────┤
│ MusicPlayer (NowPlaying + controls)         │
├──────────────────────┬──────────────────────┤
│ ScreenSubPanel       │ RecordingsSubPanel    │
└──────────────────────┴──────────────────────┘
```

**VoiceConnectionCard:**
- Shows channel name, connection status (dot + text), connect/disconnect button
- States: disconnected (picker CTA), connecting (pulse), connected (info)

**AudioVisualizer + MicLevelMeter:**
- Canvas 2D with glass card background
- Waveform rendering yang lebih smooth

**NowPlaying / MusicPlayer:**
- Track info (thumbnail/icon + title + artist)
- Progress bar + time
- Controls: prev/play-pause/next + volume + stop

**States:**
| State | Display |
|-------|---------|
| No voice connected | CTA card: "Connect to a voice channel" with guild/channel picker |
| Connecting | Animated pulse on status indicator |
| Connected, no speakers | Empty state: "Waiting for speakers..." |
| Music idle | "No track playing" + queue button |
| All normal | Full grid |

### 6.3 Dashboard Panel

**StatsOverview (4-column grid):**
```
┌──────────┬──────────┬──────────┬──────────┐
│ Metrics  │ Metrics  │ Metrics  │ Metrics  │
│ 12,458   │ 3,201    │ 89       │ 24       │
│ Messages │ Users    │ Channels │ Flagged  │
│ +12%     │ Active   │ Total    │ ↑3      │
└──────────┴──────────┴──────────┴──────────┘
```

- Each stat card: 140px tall, number in JetBrains Mono 28px bold, label in Inter 12px secondary, trend line in 11px
- Trend: green for positive/neutral, red for negative

**ChannelSummaryList / UserSummaryList:**
- Row cards (border-bottom yang subtle, hover background)
- Channel: `#` icon + name + message count + last active tooltip
- User: avatar initial circle + username + message count + trust score badge
- Loading: 5 skeleton rows
- Empty: "Belum ada data"

---

## 7. UI Primitives Upgrade (Fase 2)

| Component | Upgrade |
|-----------|---------|
| **Button** | Pill radius (`--radius-pill`), icon slot via `children`, loading spinner overlay, hover lift (translateY -1px + shadow-md), variants: primary/ghost/destructive/icon |
| **Card** | `--radius-md`, border `1px solid border`, shadow-sm, optional interactive hover (shadow-md + border-primary) |
| **Badge** | `--radius-sm`, soft background (opacity variant), compact padding 4px 8px |
| **Skeleton** | Gradient shimmer (base → highlight → base sliding), `--radius-sm` |
| **Modal** | Backdrop blur (8px), enter transition (scale 0.95→1 + fade), exit reverse |
| **Input** | --radius-sm, focus ring 2px `--color-primary` + subtle glow, border `1px solid border` → primary on focus |
| **Select** | Same as input, custom chevron icon |
| **Toast** | Fixed bottom-right, enter slide-in right, progress bar for auto-dismiss, variants: success/error/info |
| **Tabs** | Underline indicator (2px primary), no fill |

---

## 8. State Handling Convention

Every data-fetching component MUST handle these four states:

```rust
// Pattern (pseudocode)
match loading, data, error {
    (true, _, _) => render_skeleton(),
    (false, Some(data), _) => render_success(data),
    (false, None, Some(err)) => render_error(err, retry_fn),
    (false, None, None) => render_empty(empty_msg, icon),
}
```

List of components requiring state audit:
- `MessageList` (messages) — skeleton needed, empty/error exist?
- `VoiceConnectionCard` (live) — exists partially
- `ActiveSpeakers` (live) — empty state needed
- `RecordingsSubPanel` (live) — loading/empty needed
- `MusicSubPanel` (live) — idle/loading needed
- `StatsOverview` (dashboard) — skeleton needed
- `ChannelSummaryList` (dashboard) — loading/empty needed
- `UserSummaryList` (dashboard) — loading/empty needed
- `ImageGrid` (messages) — loading/empty needed
- `MascotChatbot` (polish) — loading needed

---

## 9. Inline Styles → CSS Classes (Fase 1)

Files with `style=` props that must be extracted:

| File | Inline styles | Action |
|------|--------------|--------|
| `sidebar.rs` | `style:width`, `style:background`, `style:color` on NavItem | Extract to `.sidebar`, `.nav-item`, `.nav-item.is-active` |
| `header.rs` (being removed) | `style:` for header layout, status dot | Style moves to layout.css |
| `mobile_tab_bar.rs` | `style:color`, flex on buttons | Extract to `.mobile-tab-bar`, `.mobile-tab-item` |
| `auth.rs` | Inline button style, close button | Extract to `.auth-box`, `.auth-close-btn` |

---

## 10. Implementation Order

### Fase 1 — Code Restructure (dilakukan duluan biar Fase 2 punya fondasi bersih)

1. CSS modular: buat `src/styles/` dan pindahkan CSS dari `app.css`
2. File splitting: `message_card.rs` → 4 files, `messages/mod.rs` → 3 files, `ws/socket.rs` → 2 files
3. Inline style → CSS classes: sidebar, mobile_tab_bar, auth
4. State audit: tambah loading/empty/error states ke komponen yang kurang
5. Dead code cleanup, verify build still works

### Fase 2 — Visual Redesign

1. Update design tokens (`tokens.css`) — new palette, dark default
2. Layout restructure: hapus header, rebuild sidebar as primary nav
3. UI primitives upgrade (button, card, modal, etc.)
4. Messages Panel redesign (FilterBar, MessageCard)
5. Live Panel redesign (bento grid)
6. Dashboard Panel redesign (stat cards, row lists)
7. Polish: transitions, micro-interactions, responsive

---

## 11. Out of Scope

- Leptos version upgrade (staying on 0.9.0-alpha)
- New features or panels (pure overhaul of existing surface)
- Backend changes
- Performance optimization beyond CSS/rendering
- Test coverage (separate effort)
