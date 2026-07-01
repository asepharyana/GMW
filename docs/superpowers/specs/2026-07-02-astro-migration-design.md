# Astro Migration — BETE Design System Implementation

> Migrasi frontend React SPA ke Astro SSG dengan React islands, mengikuti design system di `design/`.

**Date:** 2026-07-02
**Status:** Draft
**Owner:** @asephs

---

## 🎯 Ringkasan

Migrasi frontend dari React 19 + Vite (+ Tailwind 4) ke **Astro SSG** dengan React islands untuk komponen interaktif. Mengganti `services/frontend` yang sekarang dengan struktur Astro yang baru. Semua desain dari `design/` (16 dokumen) diimplementasikan sebagai fondasi visual.

---

## 🔗 Referensi Desain

Dokumen desain yang menjadi acuan implementasi:

| Dokumen | Konsep Kunci |
|---------|-------------|
| `core/01-color-system.md` | OKLCH colors, glassmorphism, semantic tokens |
| `core/02-typography.md` | Fluid type scale (clamp), Outfit + JetBrains Mono |
| `core/03-spatial-system.md` | 4px baseline grid, spacing/radius/z-index tokens |
| `core/04-motion-system.md` | Easing curves, duration tokens, micro-interactions |
| `core/05-component-architecture.md` | Atomic design taxonomy |
| `patterns/06-interaction-patterns.md` | Interaction feedback matrix, keyboard shortcuts |
| `patterns/09-state-machines.md` | Quad-state pattern (loading/error/empty/success) |
| `patterns/10-responsive-system.md` | Breakpoints, mobile-nav, container queries |
| `services/11-frontend-ui.md` | Tech stack, Tailwind config, glass utilities |
| `system/15-theme-architecture.md` | CSS vars, dark/light theme switching |

---

## 🛠️ Tech Stack

| Tool | Versi | Peran |
|------|-------|-------|
| Astro | 5.x | Meta-framework, SSG, routing, component model |
| React | 19.x | Interactive islands (WebSocket, canvas, state) |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Utility-first CSS (`@theme` block) |
| Zustand | 5.x | Client state (UI, voice, messages) |
| TanStack Query | 5.x | Server state (API data fetching) |
| Radix UI | — | Headless primitives (Modal, Dropdown, Tabs) |
| Framer Motion | 11.x | Complex animations (islands only) |
| Three.js | 0.170+ | Particle background (deferred island) |

---

## 🚧 Pendekatan: Astro-First + React Islands

**Prinsip:**
- Semua komponen **non-interaktif** → `.astro` (zero JavaScript)
- Komponen **interaktif** → React islands (`src/islands/`) dengan client directives
- Routing → file-based Astro pages
- Data fetching → REST API dari browser (SSG tidak punya backend runtime)

### React Islands per Fitur

| Island | Client Directive | Alasan |
|--------|-----------------|--------|
| AuthGuard | `client:load` | Cek auth state on mount |
| VoiceControls | `client:load` | WebSocket + voice interaction |
| AudioVisualizer | `client:idle` | Canvas-based, bukan prioritas awal |
| MessageFeed | `client:load` | WebSocket + infinite scroll |
| MascotChat | `client:idle` | Secondary feature |
| ThemeToggle | `client:idle` | Non-critical UI |
| Particles | `client:idle` | Background decoration |
| ActiveSpeakers | `client:idle` | WS-driven list |
| NowPlaying | `client:idle` | Media state |

---

## 📁 Struktur Proyek

```
services/frontend/
├── astro.config.ts
├── package.json
├── tsconfig.json
├── src/
│   ├── pages/
│   │   ├── index.astro        → Dashboard (Live tab sebagai default)
│   │   ├── live.astro          → Live panel
│   │   ├── messages.astro      → Message feed
│   │   ├── settings.astro      → Settings
│   │   ├── login.astro         → Auth page
│   │   ├── recordings.astro    → Recordings
│   │   └── 404.astro
│   │
│   ├── layouts/
│   │   ├── DashboardLayout.astro   # Sidebar + Header + <slot/>
│   │   └── AuthLayout.astro        # Minimal, centered card
│   │
│   ├── components/                 # Astro components — zero JS
│   │   ├── ui/
│   │   │   ├── Button.astro
│   │   │   ├── Badge.astro
│   │   │   ├── SeverityBadge.astro
│   │   │   ├── Card.astro
│   │   │   ├── Skeleton.astro
│   │   │   └── Spinner.astro
│   │   ├── sidebar/
│   │   │   ├── Sidebar.astro
│   │   │   └── NavItem.astro
│   │   ├── header/
│   │   │   └── Header.astro
│   │   └── states/
│   │       ├── EmptyState.astro
│   │       ├── ErrorState.astro
│   │       └── LoadingSkeleton.astro
│   │
│   ├── islands/                    # React components — interactive
│   │   ├── AuthGuard.tsx           # client:load
│   │   ├── VoiceControls.tsx       # client:load
│   │   ├── AudioVisualizer.tsx     # client:idle
│   │   ├── MessageFeed.tsx         # client:load
│   │   ├── MascotChat.tsx          # client:idle
│   │   ├── ThemeToggle.tsx         # client:idle
│   │   ├── Particles.tsx           # client:idle
│   │   ├── ActiveSpeakers.tsx      # client:idle
│   │   └── NowPlaying.tsx          # client:idle
│   │
│   ├── stores/                     # Zustand stores
│   │   ├── ui-store.ts
│   │   ├── voice-store.ts
│   │   └── message-store.ts
│   │
│   ├── shared/
│   │   ├── api/client.ts           # REST API calls
│   │   ├── ws/socket.ts            # WebSocket manager
│   │   ├── hooks/
│   │   │   ├── useMessages.ts
│   │   │   ├── useVoiceStatus.ts
│   │   │   ├── useMediaControl.ts
│   │   │   ├── useUIState.ts
│   │   │   └── useReducedMotion.ts
│   │   └── lib/utils.ts            # cn(), formatters
│   │
│   └── styles/
│       └── base.css                # Tailwind + design tokens + glass
│
└── public/
    └── favicon.svg
```

---

## 🎨 CSS Architecture

### Layer Stack

```
base.css
  ├── @import "tailwindcss"
  ├── @theme {}         → Tailwind 4 semantic tokens
  ├── :root {}          → Dark theme CSS vars (OKLCH)
  ├── [data-theme="light"] {} → Light theme overrides
  ├── @layer base       → Reset, font-face, scrollbar styling
  ├── @layer components → Glass, gradient-text, typography classes
  └── @layer utilities  → Animations keyframes
```

### CSS Variables: Prefix Categories

| Kategori | Prefix | Contoh |
|----------|--------|--------|
| Warna | `--clr-*` | `--clr-surface-base`, `--clr-primary` |
| Spacing | `--sp-*` | `--sp-3` (16px), `--sp-5` (32px) |
| Typography | `--fs-*`, `--fw-*`, `--lh-*` | `--fs-base`, `--fw-semibold` |
| Radius | `--rd-*` | `--rd-md` (8px), `--rd-xl` (16px) |
| Shadow | `--sh-*` | `--sh-card`, `--sh-modal` |
| Z-index | `--z-*` | `--z-header` (30), `--z-modal` (60) |
| Timing | `--dur-*` | `--dur-fast` (150ms) |
| Easing | `--ease-*` | `--ease-out`, `--ease-out-quint` |

### Glass Utility Classes

```css
.glass {
  background: oklch(from var(--clr-surface-elevated) l c h / 0.6);
  backdrop-filter: blur(16px);
  border: 1px solid oklch(from var(--clr-border) l c h / 0.2);
}
.gradient-text { /* ... */ }
```

---

## 🧩 Component Design (Key Components)

### Button (Astro)

```astro
---
export interface Props {
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'default' | 'lg' | 'icon';
  disabled?: boolean;
  class?: string;
}

const { variant = 'primary', size = 'default', disabled = false, class: className = '' } = Astro.props;
---

<button
  class:list={[`button button--${variant} button--${size}`, className]}
  {disabled}
>
  <slot />
</button>

<style>
  .button {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-1);
    border-radius: var(--rd-md); font-size: var(--fs-sm); font-weight: var(--fw-medium);
    transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
  }
  .button--primary { background: var(--clr-primary); color: var(--clr-text-on-primary); }
  .button--secondary { background: var(--clr-interactive-hover); color: var(--clr-text); }
  .button--ghost { background: transparent; color: var(--clr-text); }
  .button:disabled { opacity: 0.5; cursor: not-allowed; }
  .button:focus-visible { outline: 2px solid var(--clr-primary-400); outline-offset: 2px; }
</style>
```

### Card (Astro — Slot-based)

```astro
---
export interface Props {
  variant?: 'default' | 'elevated' | 'glass' | 'interactive';
  padding?: 'sm' | 'default' | 'lg' | 'none';
  class?: string;
}
---
<div class:list={[`card card--${variant}`, Astro.props.class]}>
  <slot />
</div>

<style>
  .card { background: var(--clr-surface-elevated); border: 1px solid var(--clr-border); border-radius: var(--rd-lg); }
  .card--glass { background: var(--glass-bg); backdrop-filter: blur(16px); }
  .card--interactive:hover { transform: translateY(-2px); box-shadow: var(--sh-hover); }
</style>
```

### MessageFeed (React Island — most complex)

```tsx
// islands/MessageFeed.tsx
// Keeps the existing MessageFeed logic but imports types from @bete/shared
// Uses useInfiniteQuery for cursor pagination
// Subscribes to WebSocket via SocketManager for real-time updates
// Integrates with Zustand message-store for optimistic updates
// Renders: cards with severity badges, action buttons, attachment previews
// States: loading → skeleton, error → retry, empty → mascot, success → list

interface MessageFeedProps {
  channelId?: string;
}
```

---

## 🔌 Data Flow

### WebSocket Architecture

```
Browser → WebSocket → Backend (Express + ws)
  ↑                         ↓
  └─────────────────────────┘
  (real-time events via SocketManager)
```

- `SocketManager` singleton dengan exponential backoff reconnect
- Events dipetakan ke Zustand stores → trigger React re-render
- REST API untuk initial data fetch (TanStack Query)

### Authentication

- Password disimpan di localStorage
- `X-Admin-Password` header di semua API calls
- AuthGuard island: cek localStorage, verify via `/api/health`, redirect ke login

---

## 📱 Responsive Behavior

| Viewport | Sidebar | Header | Grid | Navigation |
|----------|---------|--------|------|------------|
| < 640px | Bottom tab (56px) | Compact | 1 col | Tab bar |
| 640–768px | Bottom tab | Compact | 1-2 col | Tab bar |
| 768–1024px | Icon (64px) | Standard | 2-3 col | Sidebar icon |
| 1024–1280px | Full (256px) | Standard | 3 col | Sidebar full |
| 1280px+ | Full (256px) | Full | 3-4 col | Sidebar full |

---

## 📦 Fase Migrasi (5 Fase)

### Fase 1: Foundation 🔧
- Inisialisasi Astro + React integration
- `base.css` dengan design tokens + Tailwind 4 `@theme`
- DashboardLayout, Sidebar, Header (Astro komponen)
- Theme switching (island)

### Fase 2: UI Component Library 🧱
- Semua Astro components: Button, Badge, Card, Skeleton, SeverityBadge
- State components: EmptyState, ErrorState, LoadingSkeleton
- Glass utilities + animation keyframes

### Fase 3: Auth & Messages 📨
- AuthGuard island (login, localStorage)
- MessageFeed island (TanStack Query + WebSocket)
- Infinite scroll + real-time updates

### Fase 4: Live / Voice 🎤
- VoiceControls island (connect/disconnect)
- ActiveSpeakers, AudioVisualizer, NowPlaying islands
- Recordings page

### Fase 5: Polish ✨
- 3D Particles (three.js, deferred)
- MascotChat island
- View Transitions
- Settings page
- Mobile bottom tab bar

---

## ⚠️ Known Risks & Mitigations

| Risk | Dampak | Mitigasi |
|------|--------|----------|
| WebSocket reconnect di SSG | Koneksi terputus saat navigasi | SocketManager global singleton persist across islands |
| Bundle size React islands | JS besar di halaman interaktif | Split per halaman, gunakan `client:idle` bila memungkinkan |
| Auth check blocking render | Flash of login page | AuthGuard render spinner dulu, baru cek localStorage |
| Design token mismatch | Warna/spasi berbeda dari desain | CSS variables sebagai single source of truth, verifikasi visual tiap fase |
| react-three-fiber compatibility | Mungkin perlu workaround SSR | Island di-defer via `client:idle`, Three.js murni client-side |

---

## ✅ Spec Self-Review

- **Placeholder scan:** All sections filled. No TBD/TODO left.
- **Consistency:** All design tokens reference the same CSS variable naming from `design/`. Component architecture matches atomic taxonomy in `05-component-architecture.md`. State patterns follow `09-state-machines.md`.
- **Scope:** Focused on frontend migration only. Backend/gateway unchanged. All existing features preserved.
- **Ambiguity resolved:**
  - Astro output mode: SSG (confirmed)
  - React islands scope: only truly interactive components (confirmed)
  - All existing features retained (confirmed)

---

*Spec ditulis berdasarkan brainstorming dan persetujuan 7 section design.*
