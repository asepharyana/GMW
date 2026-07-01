# BETE Astro Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor existing Astro + React SPA frontend into Astro SSG with real file-based routing, per-feature React islands, and full design system implementation from `design/`.

**Architecture:** Replace the current pattern (single `client:only="react"` island rendering a monolithic `App.tsx`) with file-based Astro pages. Non-interactive UI rendered as `.astro` components (zero JS). Interactive parts (WebSocket, canvas, real-time state) remain as React islands in `src/islands/`, each hydrated via appropriate `client:*` directive. CSS architecture uses Tailwind 4 `@theme` block + OKLCH CSS custom properties from `design/`.

**Tech Stack:** Astro 7, React 19, Tailwind CSS 4, Zustand 5, TanStack Query 5, TypeScript 5

## Global Constraints

- All colors must use OKLCH color space via CSS custom properties (no hex/RGB hardcoding)
- All spacing must use 4px baseline grid (`--sp-*` tokens via Tailwind's 4px `--spacing` unit)
- All typography uses fluid `clamp()` scale via `--fs-*` tokens
- Glassmorphism utility classes must use `backdrop-filter: blur()` + OKLCH rgba
- React islands must use `client:load` only for WebSocket-reliant components; `client:idle` for decorative/non-critical ones
- All API calls go through `src/shared/api/client.ts` with `X-Admin-Password` header
- WebSocket lifecycle managed by `SocketManager` singleton
- Every data-driven component must handle loading/error/empty/success states per `design/patterns/09-state-machines.md`

---

## File Structure Map

Before tasks, here's every file that will be created or modified:

```
services/frontend/
├── src/
│   ├── styles/
│   │   └── base.css                      ← CREATE (replace styles.css)
│   │
│   ├── layouts/
│   │   ├── BaseLayout.astro              ← MODIFY (update meta, view-transitions)
│   │   └── AuthLayout.astro              ← CREATE
│   │
│   ├── pages/
│   │   ├── index.astro                   ← MODIFY (redirect to /live)
│   │   ├── live.astro                    ← CREATE
│   │   ├── messages.astro                ← CREATE
│   │   ├── settings.astro                ← CREATE
│   │   ├── recordings.astro              ← CREATE
│   │   ├── login.astro                   ← CREATE
│   │   └── 404.astro                     ← CREATE
│   │
│   ├── components/                       ← Astro components (zero JS)
│   │   ├── ui/
│   │   │   ├── Button.astro              ← CREATE
│   │   │   ├── Badge.astro               ← CREATE
│   │   │   ├── SeverityBadge.astro       ← CREATE
│   │   │   ├── Card.astro                ← CREATE
│   │   │   ├── Skeleton.astro            ← CREATE
│   │   │   └── Spinner.astro             ← CREATE
│   │   ├── sidebar/
│   │   │   ├── Sidebar.astro             ← CREATE
│   │   │   └── NavItem.astro             ← CREATE
│   │   ├── header/
│   │   │   └── Header.astro              ← CREATE
│   │   └── states/
│   │       ├── EmptyState.astro          ← CREATE
│   │       ├── ErrorState.astro          ← CREATE
│   │       └── LoadingSkeleton.astro     ← CREATE
│   │
│   ├── islands/                          ← React components (interactive)
│   │   ├── AuthGuard.tsx                 ← CREATE (from features/auth)
│   │   ├── VoiceControls.tsx             ← CREATE (from features/live)
│   │   ├── AudioVisualizer.tsx           ← PORT (from features/live/components/)
│   │   ├── MessageFeed.tsx               ← CREATE (composite of features/messages)
│   │   ├── MascotChat.tsx                ← CREATE (from MascotChat feature)
│   │   ├── ThemeToggle.tsx               ← CREATE (from hooks/useTheme)
│   │   ├── Particles.tsx                 ← PORT (from widgets/particles/)
│   │   ├── ActiveSpeakers.tsx            ← CREATE (from features/live/components/)
│   │   ├── NowPlaying.tsx                ← CREATE (from features/live/components/)
│   │   ├── RecordingsList.tsx            ← CREATE (from RecordingsSubPanel)
│   │   └── SettingsForm.tsx              ← CREATE (from features/settings)
│   │
│   ├── stores/                           ← Zustand
│   │   ├── ui-store.ts                   ← CREATE
│   │   ├── voice-store.ts                ← CREATE
│   │   └── message-store.ts              ← CREATE
│   │
│   ├── shared/
│   │   ├── api/client.ts                 ← PORT (existing)
│   │   ├── ws/socket.ts                  ← PORT (existing)
│   │   ├── hooks/
│   │   │   ├── useMessages.ts            ← PORT (from features/messages/hooks/)
│   │   │   ├── useMediaControl.ts        ← PORT (from features/live/hooks/)
│   │   │   └── useVoiceControl.ts        ← PORT (from features/live/hooks/)
│   │   └── lib/utils.ts                  ← PORT (existing)
│   │
│   └── layouts/
│       └── DashboardLayout.tsx           ← DELETE (replaced by Astro layout)
│
├── src/App.tsx                           ← DELETE (logic distributed to islands)
├── src/App.client.tsx                    ← DELETE (no longer needed)
├── src/entities/                         ← DELETE (types move to @bete/shared or inline)
├── src/features/                         ← DELETE (features become pages + islands)
├── src/hooks/                            ← DELETE (distributed to stores + islands)
├── src/widgets/                          ← DELETE (replaced by Astro layout + components)
├── src/styles.css                        ← DELETE (replaced by base.css)
└── src/shared/ui/                        ← DELETE (replaced by Astro components)
```

---

## Phase 1: Foundation 🔧

### Task 1.1: Rewrite CSS Architecture

**Files:**
- Create: `services/frontend/src/styles/base.css`
- Delete: `services/frontend/src/styles.css`

**Interfaces:**
- Consumes: Design tokens from `design/core/01-color-system.md`, `design/core/02-typography.md`, `design/core/03-spatial-system.md`, `design/core/04-motion-system.md`, `design/system/15-theme-architecture.md`
- Produces: `base.css` with all design tokens, Tailwind `@theme`, glass utilities, animations

**CSS Variables Context:**

```
Color tokens:    --clr-surface-base, --clr-primary, --clr-text, etc. (all OKLCH)
Spacing tokens:  --sp-3 = 16px (via 4px grid unit)
Radius tokens:   --rd-md = 8px, --rd-lg = 12px, --rd-xl = 16px
Shadow tokens:   --sh-card, --sh-hover, --sh-modal
Z-index tokens:  --z-header = 30, --z-sidebar = 40, --z-modal = 60, --z-mascot = 100
Timing tokens:   --dur-fast = 150ms, --dur-normal = 250ms, --dur-slow = 350ms
Easing tokens:   --ease-out = cubic-bezier(0.16, 1, 0.3, 1)
Font tokens:     --fs-base = clamp(0.94rem, 0.94rem + 0.03vw, 1.00rem)
```

- [ ] **Step 1: Create the complete `base.css` with design tokens**

```css
@import "tailwindcss";

/* ── Theme: Dark (default) ─────────────────────────────────── */
:root {
  /* Surfaces */
  --clr-surface-base:       oklch(0.11 0.010 286);
  --clr-surface-elevated:  oklch(0.14 0.015 286);
  --clr-surface-overlay:   oklch(0.17 0.020 286);
  --clr-surface-sunken:    oklch(0.08 0.005 286);
  --clr-border:            oklch(0.22 0.020 286);

  /* Text */
  --clr-text:              oklch(0.95 0.005 286);
  --clr-text-secondary:    oklch(0.70 0.015 286);
  --clr-text-tertiary:     oklch(0.50 0.020 286);
  --clr-text-on-primary:   oklch(0.97 0.005 286);
  --clr-text-inverse:      oklch(0.11 0.010 286);

  /* Brand (Hue 255 — Aetherial Blue) */
  --clr-primary:           oklch(0.62 0.150 255);
  --clr-primary-400:       oklch(0.62 0.150 255);
  --clr-primary-500:       oklch(0.55 0.175 255);
  --clr-primary-600:       oklch(0.47 0.160 255);
  --clr-primary-bg:        oklch(0.25 0.060 255 / 0.20);

  /* Interactive */
  --clr-interactive-hover:    oklch(0.20 0.025 286);
  --clr-interactive-active:   oklch(0.24 0.030 286);
  --clr-interactive-selected: oklch(0.25 0.060 255 / 0.15);

  /* Severity */
  --clr-severity-safe:     oklch(0.60 0.130 145);
  --clr-severity-low:      oklch(0.70 0.120 75);
  --clr-severity-medium:   oklch(0.65 0.150 50);
  --clr-severity-high:     oklch(0.60 0.150 30);
  --clr-severity-critical: oklch(0.55 0.165 25);

  /* Glass */
  --glass-bg:              oklch(0.15 0.015 286 / 0.60);
  --glass-border:          oklch(0.25 0.030 286 / 0.20);

  /* Spacing (4px grid) */
  --sp-0:   0px;
  --sp-0-5: 4px;
  --sp-1:   8px;
  --sp-2:   12px;
  --sp-3:   16px;
  --sp-4:   24px;
  --sp-5:   32px;
  --sp-6:   48px;
  --sp-7:   64px;

  /* Radius */
  --rd-xs:   4px;
  --rd-sm:   6px;
  --rd-md:   8px;
  --rd-lg:   12px;
  --rd-xl:   16px;

  /* Shadow */
  --sh-card:    0 2px 8px rgba(0, 0, 0, 0.3);
  --sh-hover:   0 4px 16px rgba(0, 0, 0, 0.4);
  --sh-modal:   0 16px 48px rgba(0, 0, 0, 0.6);

  /* Z-index */
  --z-header:   30;
  --z-sidebar:  40;
  --z-overlay:  50;
  --z-modal:    60;
  --z-toast:    80;
  --z-mascot:   100;

  /* Duration */
  --dur-fast:    150ms;
  --dur-normal:  250ms;
  --dur-slow:    350ms;

  /* Easing */
  --ease-out:       cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out:    cubic-bezier(0.65, 0, 0.35, 1);
}

/* ── Theme: Light ──────────────────────────────────────── */
[data-theme="light"] {
  --clr-surface-base:       oklch(0.97 0.002 286);
  --clr-surface-elevated:  oklch(1.00 0.000 286);
  --clr-surface-overlay:   oklch(0.95 0.003 286);
  --clr-surface-sunken:    oklch(0.92 0.004 286);
  --clr-border:            oklch(0.87 0.005 286);
  --clr-text:              oklch(0.11 0.010 286);
  --clr-text-secondary:    oklch(0.50 0.020 286);
  --clr-text-tertiary:     oklch(0.70 0.025 286);
  --clr-primary:           oklch(0.55 0.175 255);
  --clr-interactive-hover: oklch(0.90 0.005 286);
  --clr-interactive-active: oklch(0.85 0.008 286);
  --glass-bg: oklch(0.97 0.002 286 / 0.50);
  --glass-border: oklch(0.87 0.005 286 / 0.30);
  --sh-card: 0 2px 8px rgba(0, 0, 0, 0.08);
  --sh-hover: 0 4px 16px rgba(0, 0, 0, 0.12);
  --sh-modal: 0 16px 48px rgba(0, 0, 0, 0.12);
}

/* ── Tailwind 4 @theme ──────────────────────────────────── */
@theme {
  --font-sans: 'Outfit', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --color-background: var(--clr-surface-base);
  --color-foreground: var(--clr-text);
  --color-card: var(--clr-surface-elevated);
  --color-card-foreground: var(--clr-text);
  --color-border: var(--clr-border);
  --color-primary: var(--clr-primary);
  --color-primary-foreground: var(--clr-text-on-primary);
  --color-muted: var(--clr-surface-elevated);
  --color-muted-foreground: var(--clr-text-secondary);
  --color-destructive: var(--clr-severity-critical);
  --color-destructive-foreground: white;
  --color-severity-safe: var(--clr-severity-safe);
  --color-severity-low: var(--clr-severity-low);
  --color-severity-medium: var(--clr-severity-medium);
  --color-severity-high: var(--clr-severity-high);
  --color-severity-critical: var(--clr-severity-critical);

  --radius-xs: var(--rd-xs);
  --radius-sm: var(--rd-sm);
  --radius-md: var(--rd-md);
  --radius-lg: var(--rd-lg);
  --radius-xl: var(--rd-xl);

  --spacing: 4px;

  --animate-fade-in: fadeIn var(--dur-normal) var(--ease-out);
  --animate-fade-in-up: fadeInUp var(--dur-slow) var(--ease-out);
  --animate-shimmer: shimmer 1.5s ease-in-out infinite;
  --animate-scale-in: scaleIn var(--dur-slow) var(--ease-out-quint);
  --animate-glow-pulse: glowPulse 2s ease-in-out infinite;
}

/* ── Keyframes ───────────────────────────────────────────── */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes shimmer { 0% { background-position: 200% 0; } to { background-position: -200% 0; } }
@keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes glowPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
@keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { opacity: 1; } }
@keyframes slideDown { from { transform: translateY(-10px); opacity: 0; } to { opacity: 1; } }

/* ── Base layer ──────────────────────────────────────────── */
@layer base {
  body {
    background-color: var(--clr-surface-base);
    color: var(--clr-text);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
  }

  * {
    border-color: var(--clr-border);
    transition: background-color var(--dur-normal) var(--ease-out),
                color var(--dur-normal) var(--ease-out),
                border-color var(--dur-normal) var(--ease-out);
  }

  :focus-visible {
    outline: 2px solid var(--clr-primary);
    outline-offset: 2px;
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--clr-surface-sunken); }
  ::-webkit-scrollbar-thumb { background: var(--clr-border); border-radius: 999px; }
}

/* ── Components layer ─────────────────────────────────────── */
@layer components {
  .glass {
    background: var(--glass-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
  }

  .glass-strong {
    background: oklch(from var(--clr-surface-overlay) l c h / 0.85);
    backdrop-filter: blur(24px);
  }

  .gradient-text {
    background: linear-gradient(135deg, oklch(from var(--clr-primary) l c h), oklch(from var(--clr-primary-400) l c h));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Delete old `styles.css` and verify build**

Run:
```bash
rm services/frontend/src/styles.css
cd services/frontend
pnpm build 2>&1 | tail -20
```
Expected: Build succeeds, new CSS is compiled.

- [ ] **Step 3: Commit**

```bash
git add services/frontend/src/styles/base.css services/frontend/src/styles.css
git rm services/frontend/src/styles.css
git commit -m "feat(frontend): implement design system CSS architecture with OKLCH tokens"
```

---

### Task 1.2: Create Astro UI Components

**Files:**
- Create: `services/frontend/src/components/ui/Button.astro`
- Create: `services/frontend/src/components/ui/Badge.astro`
- Create: `services/frontend/src/components/ui/SeverityBadge.astro`
- Create: `services/frontend/src/components/ui/Card.astro`
- Create: `services/frontend/src/components/ui/Skeleton.astro`
- Create: `services/frontend/src/components/ui/Spinner.astro`

**Interfaces:**
- Consumes: CSS variables from Task 1.1
- Produces: Reusable Astro components usable in all page layouts

- [ ] **Step 1: Create `Button.astro`**

```astro
---
export interface Props {
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'default' | 'lg' | 'icon';
  disabled?: boolean;
  href?: string;
  class?: string;
}

const { variant = 'primary', size = 'default', disabled = false, href, class: className = '' } = Astro.props;

const baseClass = `btn btn--${variant} btn--${size}${className ? ' ' + className : ''}`;
---

{
  href ? (
    <a href={href} class={baseClass} role="button">
      <slot />
    </a>
  ) : (
    <button class={baseClass} {disabled}>
      <slot />
    </button>
  )
}

<style is:global>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-1);
    border-radius: var(--rd-md);
    font-family: var(--font-sans);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    border: 1px solid transparent;
    transition:
      transform var(--dur-fast) var(--ease-out),
      background var(--dur-fast) var(--ease-out),
      box-shadow var(--dur-fast) var(--ease-out);
    text-decoration: none;
    height: 40px;
    padding: 0 var(--sp-3);
  }
  .btn:active { transform: scale(0.97); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }

  .btn--primary { background: var(--clr-primary); color: var(--clr-text-on-primary); }
  .btn--primary:hover { background: var(--clr-primary-600); }

  .btn--secondary { background: var(--clr-interactive-hover); color: var(--clr-text); }
  .btn--secondary:hover { background: var(--clr-interactive-active); }

  .btn--destructive { background: var(--clr-severity-critical); color: white; }
  .btn--outline { background: transparent; color: var(--clr-text); border-color: var(--clr-border); }
  .btn--ghost { background: transparent; color: var(--clr-text); }

  .btn--sm { height: 32px; padding: 0 var(--sp-2); font-size: var(--fs-xs); }
  .btn--lg { height: 48px; padding: 0 var(--sp-4); }
  .btn--icon { height: 40px; width: 40px; padding: 0; }

  @media (prefers-reduced-motion: reduce) {
    .btn:active { transform: none; }
  }
</style>
```

- [ ] **Step 2: Create `Badge.astro`**

```astro
---
export interface Props {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'destructive';
  size?: 'sm' | 'default';
  dot?: boolean;
  class?: string;
}

const { variant = 'default', size = 'default', dot = false, class: className = '' } = Astro.props;
---

<span class:list={[`badge badge--${variant} badge--${size}`, className]}>
  {dot && <span class="badge-dot" aria-hidden="true" />}
  <slot />
</span>

<style is:global>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: var(--rd-full);
    font-family: var(--font-sans);
    font-size: var(--fs-xs);
    font-weight: var(--fw-medium);
    line-height: 1;
    padding: 2px 8px;
    white-space: nowrap;
  }
  .badge--default { background: var(--clr-primary); color: var(--clr-text-on-primary); }
  .badge--secondary { background: var(--clr-interactive-hover); color: var(--clr-text); }
  .badge--success { background: oklch(from var(--clr-severity-safe) l c h / 0.15); color: var(--clr-severity-safe); }
  .badge--warning { background: oklch(from var(--clr-severity-low) l c h / 0.15); color: var(--clr-severity-low); }
  .badge--destructive { background: oklch(from var(--clr-severity-critical) l c h / 0.15); color: var(--clr-severity-critical); }
  .badge-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor;
  }
</style>
```

- [ ] **Step 3: Create `SeverityBadge.astro`**

```astro
---
export interface Props {
  severity: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  class?: string;
}

const { severity, class: className = '' } = Astro.props;

const ICONS: Record<string, string> = {
  safe: '✅',
  low: '⚠️',
  medium: '🔶',
  high: '🚫',
  critical: '🔴',
};
---

<span class:list={[`severity-badge severity--${severity}`, className]}>
  <span aria-hidden="true">{ICONS[severity]}</span>
  <slot>{severity.toUpperCase()}</slot>
</span>

<style is:global>
  .severity-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: var(--rd-full);
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    padding: 2px 10px;
    white-space: nowrap;
  }
  .severity--safe { background: oklch(from var(--clr-severity-safe) l c h / 0.15); color: var(--clr-severity-safe); }
  .severity--low { background: oklch(from var(--clr-severity-low) l c h / 0.15); color: var(--clr-severity-low); }
  .severity--medium { background: oklch(from var(--clr-severity-medium) l c h / 0.15); color: var(--clr-severity-medium); }
  .severity--high { background: oklch(from var(--clr-severity-high) l c h / 0.15); color: var(--clr-severity-high); }
  .severity--critical { background: oklch(from var(--clr-severity-critical) l c h / 0.15); color: var(--clr-severity-critical); }
</style>
```

- [ ] **Step 4: Create `Card.astro`**

```astro
---
export interface Props {
  variant?: 'default' | 'elevated' | 'glass' | 'interactive';
  padding?: 'sm' | 'default' | 'lg' | 'none';
  class?: string;
}

const { variant = 'default', padding = 'default', class: className = '' } = Astro.props;
---

<div class:list={[`card card--${variant} card-pad--${padding}`, className]}>
  <slot />
</div>

<style is:global>
  .card {
    background: var(--clr-surface-elevated);
    border: 1px solid var(--clr-border);
    border-radius: var(--rd-lg);
    transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
  }
  .card--elevated { box-shadow: var(--sh-card); }
  .card--glass { background: var(--glass-bg); backdrop-filter: blur(16px); border-color: var(--glass-border); }
  .card--interactive:hover { transform: translateY(-2px); box-shadow: var(--sh-hover); }
  .card-pad--sm { padding: var(--sp-3); }
  .card-pad--default { padding: var(--sp-4); }
  .card-pad--lg { padding: var(--sp-5); }
  .card-pad--none { padding: 0; }
</style>
```

- [ ] **Step 5: Create `Skeleton.astro`** and `Spinner.astro`

```astro
---
// Skeleton.astro
export interface Props {
  variant?: 'text' | 'card' | 'circle' | 'rect';
  width?: string;
  height?: string;
  class?: string;
}
const { variant = 'text', width, height, class: className = '' } = Astro.props;
---
<div class:list={[`skeleton skeleton--${variant}`, className]} style={{ width, height }} aria-busy="true" aria-label="Loading" />
<style is:global>
  .skeleton {
    background: linear-gradient(90deg, var(--clr-surface-sunken) 25%, var(--clr-surface-elevated) 50%, var(--clr-surface-sunken) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: var(--rd-sm);
  }
  .skeleton--text { height: 1em; width: 100%; }
  .skeleton--card { height: 120px; border-radius: var(--rd-lg); }
  .skeleton--circle { width: 40px; height: 40px; border-radius: 50%; }
  .skeleton--rect { height: 80px; border-radius: var(--rd-md); }
</style>
```

```astro
---
// Spinner.astro
export interface Props { size?: 'sm' | 'default' | 'lg'; class?: string; }
const { size = 'default', class: className = '' } = Astro.props;
---
<div class:list={[`spinner spinner--${size}`, className]} role="status">
  <span class="sr-only">Loading...</span>
</div>
<style is:global>
  .spinner {
    border: 2px solid var(--clr-border);
    border-top-color: var(--clr-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  .spinner--sm { width: 16px; height: 16px; }
  .spinner--default { width: 24px; height: 24px; }
  .spinner--lg { width: 32px; height: 32px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
```

- [ ] **Step 6: Verify components compile**

Run:
```bash
cd services/frontend && pnpm build 2>&1 | tail -10
```
Expected: Build succeeds, zero errors.

- [ ] **Step 7: Commit**

```bash
git add services/frontend/src/components/ui/
git commit -m "feat(frontend): add Astro UI components (Button, Badge, Card, Skeleton, Spinner)"
```

---

### Task 1.3: Create Layout Components (Sidebar, Header, States)

**Files:**
- Create: `services/frontend/src/components/sidebar/NavItem.astro`
- Create: `services/frontend/src/components/sidebar/Sidebar.astro`
- Create: `services/frontend/src/components/header/Header.astro`
- Create: `services/frontend/src/components/states/EmptyState.astro`
- Create: `services/frontend/src/components/states/ErrorState.astro`
- Create: `services/frontend/src/components/states/LoadingSkeleton.astro`

**Interfaces:**
- Consumes: UI components from Task 1.2
- Produces: Layout shell components used by DashboardLayout

- [ ] **Step 1: Create `NavItem.astro`**

```astro
---
export interface Props {
  href: string;
  icon: string; // Lucide icon name
  label: string;
  active?: boolean;
  collapsed?: boolean;
  notificationCount?: number;
}
const { href, icon, label, active = false, collapsed = false, notificationCount = 0 } = Astro.props;
---

<a href={href} class:list={[`nav-item`, active && 'nav-item--active']} data-icon={icon}>
  <span class="nav-item-icon" aria-hidden="true" data-lucide={icon}></span>
  {!collapsed && (
    <>
      <span class="nav-item-label">{label}</span>
      {notificationCount > 0 && (
        <span class="nav-item-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
      )}
    </>
  )}
</a>

<style is:global>
  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--rd-md);
    color: var(--clr-text-secondary);
    text-decoration: none;
    transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
    white-space: nowrap;
    position: relative;
  }
  .nav-item:hover { background: var(--clr-interactive-hover); color: var(--clr-text); }
  .nav-item--active { background: var(--clr-interactive-selected); color: var(--clr-primary); }
  .nav-item-icon {
    width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .nav-item-label { flex: 1; }
  .nav-item-badge {
    background: var(--clr-severity-high);
    color: white;
    font-size: 10px;
    font-weight: var(--fw-bold);
    padding: 1px 5px;
    border-radius: var(--rd-full);
    min-width: 18px;
    text-align: center;
  }
</style>
```

- [ ] **Step 2: Create `Sidebar.astro`**

```astro
---
import NavItem from './NavItem.astro';

export interface Props {
  collapsed?: boolean;
  activeTab?: string;
  notificationCount?: number;
  class?: string;
}

const { collapsed = false, activeTab = 'live', notificationCount = 0, class: className = '' } = Astro.props;

const NAV_ITEMS = [
  { id: 'live', icon: 'radio', href: '/live', label: 'Live' },
  { id: 'messages', icon: 'message-square', href: '/messages', label: 'Messages' },
  { id: 'recordings', icon: 'mic', href: '/recordings', label: 'Recordings' },
  { id: 'settings', icon: 'settings', href: '/settings', label: 'Settings' },
];
---

<aside class:list={[`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`, className]}>
  <div class="sidebar-header">
    <a href="/" class="sidebar-logo">
      <span class="sidebar-logo-icon" aria-hidden="true">✦</span>
      {!collapsed && <span class="gradient-text font-bold text-lg">BETE</span>}
    </a>
  </div>
  <nav class="sidebar-nav">
    {NAV_ITEMS.map((item) => (
      <NavItem
        href={item.href}
        icon={item.icon}
        label={item.label}
        active={activeTab === item.id}
        collapsed={collapsed}
        notificationCount={item.id === 'messages' ? notificationCount : 0}
      />
    ))}
  </nav>
  {!collapsed && (
    <div class="sidebar-footer">
      <p class="text-xs text-tertiary">BETE v2.0</p>
    </div>
  )}
</aside>

<style is:global>
  .sidebar {
    width: 256px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: oklch(from var(--clr-surface-base) l c h / 0.8);
    border-right: 1px solid var(--clr-border);
    transition: width var(--dur-slow) var(--ease-out-quint);
    overflow: hidden;
  }
  .sidebar--collapsed { width: 64px; }
  .sidebar-header {
    padding: var(--sp-4) var(--sp-3);
    border-bottom: 1px solid var(--clr-border);
  }
  .sidebar-logo {
    display: flex; align-items: center; gap: var(--sp-2);
    text-decoration: none;
  }
  .sidebar-logo-icon { font-size: 24px; }
  .sidebar-nav {
    flex: 1;
    padding: var(--sp-3) var(--sp-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sidebar-footer {
    padding: var(--sp-3);
    border-top: 1px solid var(--clr-border);
  }
</style>
```

- [ ] **Step 3: Create `Header.astro`**

```astro
---
export interface Props {
  title?: string;
  class?: string;
}
const { title = 'Dashboard', class: className = '' } = Astro.props;
---

<header class:list={[`app-header`, className]}>
  <div class="header-left">
    <h1 class="text-lg font-semibold">{title}</h1>
  </div>
  <div class="header-right">
    <slot name="actions" />
  </div>
</header>

<style is:global>
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 var(--sp-5);
    border-bottom: 1px solid var(--clr-border);
    background: oklch(from var(--clr-surface-base) l c h / 0.9);
    backdrop-filter: blur(8px);
    position: sticky;
    top: 0;
    z-index: var(--z-header);
  }
  .header-left { display: flex; align-items: center; gap: var(--sp-3); }
  .header-right { display: flex; align-items: center; gap: var(--sp-2); }
</style>
```

- [ ] **Step 4: Create state components**

`EmptyState.astro`:
```astro
---
export interface Props {
  icon?: string;
  title: string;
  description?: string;
  class?: string;
}
const { icon, title, description, class: className = '' } = Astro.props;
---
<div class:list={['empty-state', className]}>
  {icon && <div class="empty-icon" aria-hidden="true" data-lucide={icon} />}
  <h3 class="text-lg font-semibold">{title}</h3>
  {description && <p class="text-sm text-secondary">{description}</p>}
  <slot />
</div>
<style is:global>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: var(--sp-8) var(--sp-4);
    text-align: center;
    min-height: 200px;
  }
  .empty-icon { width: 48px; height: 48px; color: var(--clr-text-tertiary); }
</style>
```

`ErrorState.astro`:
```astro
---
export interface Props {
  message?: string;
  class?: string;
}
const { message = 'Something went wrong', class: className = '' } = Astro.props;
---
<div class:list={['error-state', className]} role="alert">
  <div class="error-icon">!</div>
  <p class="text-sm font-medium">{message}</p>
  <slot />
</div>
<style is:global>
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-6);
    text-align: center;
    border-radius: var(--rd-lg);
    background: oklch(from var(--clr-severity-critical) l c h / 0.1);
  }
  .error-icon {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: oklch(from var(--clr-severity-critical) l c h / 0.2);
    color: var(--clr-severity-critical);
    display: flex; align-items: center; justify-content: center;
    font-weight: bold; font-size: 20px;
  }
</style>
```

`LoadingSkeleton.astro`:
```astro
---
import Skeleton from '../ui/Skeleton.astro';

export interface Props {
  variant?: 'card' | 'list' | 'detail';
  count?: number;
  class?: string;
}
const { variant = 'card', count = 3, class: className = '' } = Astro.props;
---
<div class:list={[`loading-skeleton loading--${variant}`, className]} aria-busy="true">
  {Array.from({ length: count }).map(() => (
    variant === 'list' ? (
      <div class="flex items-center gap-3 p-3">
        <Skeleton variant="circle" />
        <div class="flex-1 space-y-2">
          <Skeleton width="60%" />
          <Skeleton width="40%" />
        </div>
      </div>
    ) : (
      <div class="p-4 space-y-3">
        <Skeleton variant="card" />
        <Skeleton width="75%" />
        <Skeleton width="50%" />
      </div>
    )
  ))}
</div>
```

- [ ] **Step 5: Commit**

```bash
git add services/frontend/src/components/
git commit -m "feat(frontend): add Astro layout components (Sidebar, Header, states)"
```

---

### Task 1.4: Update BaseLayout and Create AuthLayout + Pages

**Files:**
- Modify: `services/frontend/src/layouts/BaseLayout.astro`
- Create: `services/frontend/src/layouts/AuthLayout.astro`
- Create: `services/frontend/src/pages/login.astro`
- Create: `services/frontend/src/pages/404.astro`
- Modify: `services/frontend/src/pages/index.astro`

**Interfaces:**
- Consumes: No prior tasks (independent)
- Produces: Working routes and layout shell

- [ ] **Step 1: Update `BaseLayout.astro`**

```astro
---
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap";
const FONT_MONO_HREF =
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap";

export interface Props {
  title?: string;
  description?: string;
}
const { title = 'IMPHNEN — Discord Moderation', description = 'Real-time Discord AI Moderation & Voice Recording Dashboard' } = Astro.props;
---

<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href={FONT_HREF} rel="stylesheet" />
    <link href={FONT_MONO_HREF} rel="stylesheet" />
    <meta name="view-transition" content="same-origin" />
    <script is:inline>
      (function() {
        try {
          var stored = localStorage.getItem("bete-dashboard-theme");
          var theme = "dark";
          if (stored === "light") theme = "light";
          else if (stored === "system") {
            theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
          }
          document.documentElement.setAttribute("data-theme", theme);
          if (theme === "dark") document.documentElement.classList.add("dark");
        } catch(e) {}
      })();
    </script>
    <style>
      /* View transitions */
      html::view-transition-old(root) {
        animation: 250ms var(--ease-in-out) both fade-out;
      }
      html::view-transition-new(root) {
        animation: 350ms var(--ease-out) both fade-in-up;
      }
      @keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }
      @keyframes fade-in-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </head>
  <body class="bg-background text-foreground font-sans antialiased">
    <slot />
  </body>
</html>
```

- [ ] **Step 2: Create `AuthLayout.astro`**

```astro
---
import BaseLayout from './BaseLayout.astro';

interface Props { title?: string; }
const { title } = Astro.props;
---

<BaseLayout title={title}>
  <div class="auth-layout">
    <div class="auth-card glass rounded-xl p-6 w-full max-w-sm">
      <slot />
    </div>
  </div>
</BaseLayout>

<style is:global>
  .auth-layout {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--sp-4);
    background: var(--clr-surface-base);
  }
  .auth-card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
</style>
```

- [ ] **Step 3: Create `login.astro`**

```astro
---
import AuthLayout from '../layouts/AuthLayout.astro';
---

<AuthLayout title="Login — BETE">
  <div class="text-center">
    <h1 class="text-2xl font-bold gradient-text">BETE</h1>
    <p class="text-sm text-secondary mt-2">Discord Moderation Dashboard</p>
  </div>
  <AuthGuard client:load />
</AuthLayout>
```

- [ ] **Step 4: Create `404.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title="404 — Not Found">
  <main class="flex min-h-screen items-center justify-center">
    <div class="text-center space-y-4">
      <h1 class="display-1 gradient-text">404</h1>
      <p class="text-secondary">The page you're looking for doesn't exist.</p>
      <a href="/" class="btn btn--primary">Go Home</a>
    </div>
  </main>
</BaseLayout>
```

- [ ] **Step 5: Update `index.astro`** — 301 redirect to /live

```astro
---
// Redirect to live view (default tab)
return Astro.redirect('/live', 301);
---
```

- [ ] **Step 6: Commit**

```bash
git add services/frontend/src/layouts/ services/frontend/src/pages/
git commit -m "feat(frontend): update BaseLayout, add AuthLayout, login, 404 pages"
```

---

## Phase 2: Zustand Stores + Shared Utilities

### Task 2.1: Create Zustand Stores

**Files:**
- Create: `services/frontend/src/stores/ui-store.ts`
- Create: `services/frontend/src/stores/voice-store.ts`
- Create: `services/frontend/src/stores/message-store.ts`

**Interfaces:**
- Consumes: Types from `@bete/shared`
- Produces: `useUIStore`, `useVoiceStore`, `useMessageStore` for islands

- [ ] **Step 1: Create `ui-store.ts`**

```typescript
import { create } from 'zustand';

export type DashboardTab = 'live' | 'messages' | 'recordings' | 'settings' | 'dashboard';

interface UIState {
  sidebarCollapsed: boolean;
  activeTab: DashboardTab;
  theme: 'dark' | 'light' | 'system';
  selectedVoiceGuild: string;
  selectedVoiceChannel: string;
  toggleSidebar: () => void;
  setActiveTab: (tab: DashboardTab) => void;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  activeTab: 'live',
  theme: 'dark',
  selectedVoiceGuild: '',
  selectedVoiceChannel: '',
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTheme: (theme) => set({ theme }),
}));
```

- [ ] **Step 2: Create `voice-store.ts`**

```typescript
import { create } from 'zustand';
import type { ActiveSpeaker, VoiceStatus } from '@bete/shared/types';

interface VoiceState {
  connected: boolean;
  status: VoiceStatus | null;
  activeSpeakers: ActiveSpeaker[];
  guildId: string;
  channelId: string;
  setConnected: (connected: boolean) => void;
  setStatus: (status: VoiceStatus) => void;
  setActiveSpeakers: (speakers: ActiveSpeaker[]) => void;
  updateSpeaker: (speaker: Partial<ActiveSpeaker> & { userId: string }) => void;
  setGuildChannel: (guildId: string, channelId: string) => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  connected: false,
  status: null,
  activeSpeakers: [],
  guildId: '',
  channelId: '',
  setConnected: (connected) => set({ connected }),
  setStatus: (status) => set({ status }),
  setActiveSpeakers: (activeSpeakers) => set({ activeSpeakers }),
  updateSpeaker: (speaker) =>
    set((s) => {
      const idx = s.activeSpeakers.findIndex((sp) => sp.userId === speaker.userId);
      if (idx >= 0) {
        const next = [...s.activeSpeakers];
        next[idx] = { ...next[idx], ...speaker, heardAt: Date.now() };
        return { activeSpeakers: next };
      }
      return { activeSpeakers: [...s.activeSpeakers, { ...speaker, heardAt: Date.now() } as ActiveSpeaker] };
    }),
  setGuildChannel: (guildId, channelId) => set({ guildId, channelId }),
}));
```

- [ ] **Step 3: Create `message-store.ts`**

```typescript
import { create } from 'zustand';
import type { MessageRecord } from '@bete/shared/types';

interface MessageState {
  messages: MessageRecord[];
  setMessages: (msgs: MessageRecord[] | ((prev: MessageRecord[]) => MessageRecord[])) => void;
  prependMessage: (msg: MessageRecord) => void;
  updateMessage: (id: string, updates: Partial<MessageRecord>) => void;
  removeMessage: (id: string) => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: [],
  setMessages: (msgs) =>
    set((s) => ({
      messages: typeof msgs === 'function' ? msgs(s.messages) : msgs,
    })),
  prependMessage: (msg) =>
    set((s) => ({
      messages: s.messages.some((m) => m.id === msg.id) ? s.messages : [msg, ...s.messages],
    })),
  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  removeMessage: (id) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, type: 'deleted' as const } : m)),
    })),
}));
```

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/stores/
git commit -m "feat(frontend): add Zustand stores (ui, voice, message)"
```

---

### Task 2.2: Create WebSocket Bridge + AuthGuard Island

**Files:**
- Port: `services/frontend/src/shared/ws/socket.ts` (exists, port as-is with minor cleanup)
- Create: `services/frontend/src/islands/AuthGuard.tsx`
- Create: `services/frontend/src/islands/ThemeToggle.tsx`

**Interfaces:**
- Consumes: `useUIStore` from Task 2.1, existing `socket.ts`
- Produces: Islands mounted on `/login` and layout

- [ ] **Step 1: Verify `socket.ts` is clean and working**
Read existing file and confirm SocketManager class is exported properly.

Run:
```bash
head -5 services/frontend/src/shared/ws/socket.ts
```
Expected: Contains `export class SocketManager` or similar.

- [ ] **Step 2: Create `AuthGuard.tsx` island**

```tsx
import { useEffect, useState } from 'react';
import { getSessionToken, getAdminPassword, clearSessionToken } from '../shared/api/client';

interface AuthGuardProps {
  children?: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getSessionToken();
    const password = getAdminPassword();
    if (token || password) {
      setAuthenticated(true);
    } else {
      setAuthenticated(false);
    }
  }, []);

  if (authenticated === null) {
    return (
      <div className="flex justify-center py-8">
        <div className="spinner spinner--default" role="status" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-secondary">Please enter admin password to continue.</p>
        {/* Login form with password input */}
        <form onSubmit={(e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const input = form.elements.namedItem('password') as HTMLInputElement;
          localStorage.setItem('admin-password', input.value);
          setAuthenticated(true);
        }} className="space-y-3">
          <input
            name="password"
            type="password"
            placeholder="Admin password"
            className="input w-full"
            autoFocus
          />
          <button type="submit" className="btn btn--primary w-full">
            Login
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Create `ThemeToggle.tsx` island**

```tsx
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('bete-dashboard-theme');
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('bete-dashboard-theme', next);
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  return (
    <button
      onClick={toggle}
      className="btn btn--ghost btn--icon"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/islands/AuthGuard.tsx services/frontend/src/islands/ThemeToggle.tsx
git commit -m "feat(frontend): add AuthGuard and ThemeToggle islands"
```

---

## Phase 3: Messages Feature

### Task 3.1: MessageFeed Island

**Files:**
- Create: `services/frontend/src/islands/MessageFeed.tsx`
- Port: `services/frontend/src/shared/hooks/useMessages.ts` from `features/messages/hooks/useMessages.ts`
- Port: `services/frontend/src/shared/api/client.ts` (exists)

**Interfaces:**
- Consumes: `useMessageStore` from Task 2.1, `socket.ts` from Task 2.2
- Produces: `MessageFeed` React island with loading/error/empty states

- [ ] **Step 1: Port `useMessages` hook to `src/shared/hooks/useMessages.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageRecord } from '@bete/shared/types';
import { getMessages, reanalyzeMessage } from '../api/client';
import { useMessageStore } from '../../stores/message-store';

export function mergeMessages(
  existing: MessageRecord[],
  incoming: MessageRecord[],
): MessageRecord[] {
  const map = new Map(existing.map((m) => [m.id, m]));
  for (const msg of incoming) {
    map.set(msg.id, msg);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function useMessages() {
  const { messages, setMessages, prependMessage } = useMessageStore();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | undefined>(undefined);
  const guildRef = useRef<string>('');

  const fetchMessages = useCallback(async (guildId?: string) => {
    if (!guildId) return;
    guildRef.current = guildId;
    setLoading(true);
    try {
      const res = await getMessages({ guildId, limit: 50 });
      setMessages(res.data ?? []);
      cursorRef.current = res.nextCursor;
      setHasMore(!!res.nextCursor);
    } catch (err) {
      console.error('Failed to fetch messages', err);
    } finally {
      setLoading(false);
    }
  }, [setMessages]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !guildRef.current) return;
    setLoadingMore(true);
    try {
      const res = await getMessages({ guildId: guildRef.current, cursor: cursorRef.current, limit: 50 });
      setMessages((prev) => mergeMessages(prev, res.data ?? []));
      cursorRef.current = res.nextCursor;
      setHasMore(!!res.nextCursor);
    } catch (err) {
      console.error('Failed to load more', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, setMessages]);

  const reanalyze = useCallback(async (messageId: string) => {
    try {
      await reanalyzeMessage(messageId);
    } catch (err) {
      console.error('Reanalyze failed', err);
    }
  }, []);

  return { messages, loading, loadingMore, hasMore, fetchMessages, loadMore, reanalyze };
}
```

- [ ] **Step 2: Create `MessageFeed.tsx` island**

```tsx
import { useEffect, useRef, useCallback } from 'react';
import { useMessages } from '../shared/hooks/useMessages';
import { useDashboardSocket } from '../shared/ws/socket';
import { useMessageStore } from '../stores/message-store';

interface MessageFeedProps {
  guildId?: string;
}

export default function MessageFeed({ guildId }: MessageFeedProps) {
  const { messages, loading, loadingMore, hasMore, fetchMessages, loadMore, reanalyze } = useMessages();
  const { setMessages, updateMessage } = useMessageStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // WebSocket bridge
  useDashboardSocket({
    onMessageCreated: (msg) => {
      useMessageStore.getState().prependMessage(msg);
    },
    onMessageUpdated: (msg) => {
      useMessageStore.getState().updateMessage(msg.id, msg);
    },
    onMessageDeleted: (msg) => {
      useMessageStore.getState().removeMessage(msg.id);
    },
    onMessageAnalyzed: (msg) => {
      useMessageStore.getState().updateMessage(msg.id, msg);
    },
  });

  useEffect(() => {
    if (guildId) fetchMessages(guildId);
  }, [guildId, fetchMessages]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 200 && hasMore && !loadingMore) {
      loadMore();
    }
  }, [hasMore, loadingMore, loadMore]);

  // Loading state
  if (loading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton skeleton--card" />
        ))}
      </div>
    );
  }

  // Empty state
  if (!loading && messages.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">💬</div>
        <h3 className="text-lg font-semibold">No messages yet</h3>
        <p className="text-sm text-secondary">Messages will appear here once captured.</p>
      </div>
    );
  }

  // Error state
  if (messages.length === 0) {
    return (
      <div className="error-state" role="alert">
        <div className="error-icon">!</div>
        <p className="text-sm font-medium">Failed to load messages</p>
        <button className="btn btn--outline btn--sm" onClick={() => guildId && fetchMessages(guildId)}>
          Try Again
        </button>
      </div>
    );
  }

  // Success state
  return (
    <div ref={containerRef} onScroll={handleScroll} className="space-y-2 p-4 overflow-y-auto max-h-full">
      {messages.map((msg) => (
        <div key={msg.id} className={`card card-pad--sm ${msg.type === 'deleted' ? 'opacity-50' : ''}`}>
          <div className="flex items-start gap-3">
            <img
              src={msg.avatar_url || '/default-avatar.png'}
              alt=""
              className="w-8 h-8 rounded-full"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">{msg.username}</span>
                {msg.ai_severity && (
                  <span className={`severity-badge severity--${msg.ai_severity}`}>
                    {msg.ai_severity.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-sm">{msg.content || msg.edited_content}</p>
              <div className="flex gap-2 mt-2">
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => reanalyze(msg.id)}
                >
                  Reanalyze
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
      {loadingMore && (
        <div className="flex justify-center py-4">
          <div className="spinner spinner--sm" role="status" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `messages.astro` page**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Sidebar from '../components/sidebar/Sidebar.astro';
import Header from '../components/header/Header.astro';
import ThemeToggle from '../islands/ThemeToggle.tsx';
import MessageFeed from '../islands/MessageFeed.tsx';
---

<BaseLayout title="Messages — BETE">
  <div class="page-layout">
    <Sidebar activeTab="messages" />
    <main class="main-area">
      <Header title="Messages">
        <ThemeToggle slot="actions" client:idle />
      </Header>
      <div class="content-area p-5">
        <MessageFeed client:load />
      </div>
    </main>
  </div>
</BaseLayout>

<style is:global>
  .page-layout {
    display: grid;
    grid-template-columns: auto 1fr;
    min-height: 100vh;
  }
  .main-area {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
  .content-area {
    flex: 1;
    overflow-y: auto;
  }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/islands/MessageFeed.tsx services/frontend/src/pages/messages.astro services/frontend/src/shared/hooks/useMessages.ts
git commit -m "feat(frontend): add MessageFeed island and /messages page"
```

---

## Phase 4: Live / Voice Feature

### Task 4.1: Voice Islands (Controls, Speakers, Visualizer)

**Files:**
- Create: `services/frontend/src/islands/VoiceControls.tsx`
- Create: `services/frontend/src/islands/ActiveSpeakers.tsx`
- Create: `services/frontend/src/islands/AudioVisualizer.tsx`
- Create: `services/frontend/src/islands/NowPlaying.tsx`
- Port: `services/frontend/src/shared/hooks/useVoiceControl.ts` from `features/live/hooks/useVoiceControl.ts`
- Port: `services/frontend/src/shared/hooks/useMediaControl.ts` from `features/live/hooks/useMediaControl.ts`

**Interfaces:**
- Consumes: `useVoiceStore` from Task 2.1, `useDashboardSocket` from `socket.ts`
- Produces: Voice islands mounted on `/live` page

- [ ] **Step 1: Create `VoiceControls.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useVoiceStore } from '../stores/voice-store';
import { voiceConnect, voiceDisconnect, getStatus } from '../shared/api/client';

interface VoiceControlsProps {
  guilds: Array<{ id: string; name: string }>;
  voiceChannels: Array<{ id: string; name: string }>;
}

export default function VoiceControls({ guilds, voiceChannels }: VoiceControlsProps) {
  const { guildId, channelId, connected, setConnected, setGuildChannel } = useVoiceStore();
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!guildId || !channelId) return;
    setLoading(true);
    try {
      await voiceConnect(guildId, channelId);
      setConnected(true);
    } catch (err) {
      console.error('Failed to connect', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await voiceDisconnect();
      setConnected(false);
    } catch (err) {
      console.error('Failed to disconnect', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Guild select */}
      <select
        value={guildId}
        onChange={(e) => setGuildChannel(e.target.value, channelId)}
        className="input w-full"
        disabled={connected}
      >
        <option value="">Select guild...</option>
        {guilds.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>

      {/* Channel select */}
      <select
        value={channelId}
        onChange={(e) => setGuildChannel(guildId, e.target.value)}
        className="input w-full"
        disabled={connected || !guildId}
      >
        <option value="">Select channel...</option>
        {voiceChannels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {/* Connect/Disconnect */}
      {!connected ? (
        <button
          onClick={handleConnect}
          disabled={!guildId || !channelId || loading}
          className="btn btn--primary w-full"
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      ) : (
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="btn btn--destructive w-full"
        >
          {loading ? 'Disconnecting...' : 'Disconnect'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `ActiveSpeakers.tsx`**

```tsx
import { useVoiceStore } from '../stores/voice-store';

export default function ActiveSpeakers() {
  const activeSpeakers = useVoiceStore((s) => s.activeSpeakers);

  if (activeSpeakers.length === 0) {
    return (
      <div className="empty-state min-h-[100px]">
        <p className="text-sm text-secondary">No active speakers</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {activeSpeakers.map((speaker) => (
        <li key={speaker.userId} className="flex items-center gap-3 p-2 rounded-md hover:bg-interactive-hover">
          <img
            src={speaker.avatar || '/default-avatar.png'}
            alt=""
            className="w-8 h-8 rounded-full"
          />
          <span className="flex-1 text-sm font-medium">{speaker.username}</span>
          {speaker.speaking && (
            <div className="flex gap-0.5 items-end h-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-primary rounded-full animate-bar-pulse"
                  style={{ animationDelay: `${i * 75}ms` }}
                />
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Create `AudioVisualizer.tsx`** (canvas-based)

```tsx
import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  barCount?: number;
  height?: number;
}

export default function AudioVisualizer({ barCount = 48, height = 32 }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dummy frequency data — in real app, this comes from WebSocket
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = canvas.width / barCount;
      for (let i = 0; i < barCount; i++) {
        const h = Math.random() * height * 0.8;
        ctx.fillStyle = `oklch(0.62 0.15 255 / ${0.3 + Math.random() * 0.7})`;
        ctx.fillRect(i * barWidth, height - h, barWidth - 1, h);
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => cancelAnimationFrame(animRef.current);
  }, [barCount, height]);

  return (
    <canvas
      ref={canvasRef}
      width={barCount * 4}
      height={height}
      className="w-full rounded-md"
      aria-label="Audio visualizer"
    />
  );
}
```

- [ ] **Step 4: Create `live.astro` page**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Sidebar from '../components/sidebar/Sidebar.astro';
import Header from '../components/header/Header.astro';
import Card from '../components/ui/Card.astro';
import ThemeToggle from '../islands/ThemeToggle.tsx';
import VoiceControls from '../islands/VoiceControls.tsx';
import ActiveSpeakers from '../islands/ActiveSpeakers.tsx';
import AudioVisualizer from '../islands/AudioVisualizer.tsx';
import NowPlaying from '../islands/NowPlaying.tsx';
import Particles from '../islands/Particles.tsx';
import MascotChat from '../islands/MascotChat.tsx';
---

<BaseLayout title="Live — BETE">
  <div class="page-layout">
    <Sidebar activeTab="live" />
    <main class="main-area">
      <Header title="Live">
        <ThemeToggle slot="actions" client:idle />
      </Header>
      <div class="content-area p-5">
        <div class="live-layout">
          <div class="live-main space-y-4">
            <Card variant="glass">
              <h2 class="h4 mb-3">Voice Connection</h2>
              <VoiceControls client:load guilds={[]} voiceChannels={[]} />
            </Card>
            <AudioVisualizer client:idle barCount={48} height={64} />
            <Card>
              <h2 class="h4 mb-3">Now Playing</h2>
              <NowPlaying client:idle />
            </Card>
          </div>
          <aside class="live-sidebar space-y-4">
            <Card>
              <h2 class="h4 mb-3">Active Speakers</h2>
              <ActiveSpeakers client:idle />
            </Card>
          </aside>
        </div>
      </div>
    </main>
    <Particles client:idle />
    <MascotChat client:idle />
  </div>
</BaseLayout>

<style is:global>
  .live-layout {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: var(--sp-4);
  }
  @media (max-width: 1024px) {
    .live-layout { grid-template-columns: 1fr; }
  }
  .live-sidebar {
    position: sticky;
    top: calc(56px + var(--sp-4));
    max-height: calc(100vh - 56px - var(--sp-4) * 2);
    overflow-y: auto;
  }
</style>
```

- [ ] **Step 5: Commit**

```bash
git add services/frontend/src/islands/VoiceControls.tsx services/frontend/src/islands/ActiveSpeakers.tsx services/frontend/src/islands/AudioVisualizer.tsx services/frontend/src/islands/NowPlaying.tsx services/frontend/src/pages/live.astro
git commit -m "feat(frontend): add voice islands and /live page"
```

---

### Task 4.2: Recordings Page and Remaining Pages

**Files:**
- Create: `services/frontend/src/pages/recordings.astro`
- Create: `services/frontend/src/islands/RecordingsList.tsx`
- Create: `services/frontend/src/pages/settings.astro`
- Create: `services/frontend/src/islands/SettingsForm.tsx`

- [ ] **Step 1: Create `RecordingsList.tsx` island**

```tsx
import { useEffect, useState } from 'react';
import { getRecordings } from '../shared/api/client';

interface Recording {
  id: string;
  username: string;
  channel_name: string;
  created_at: string;
  download_url?: string;
}

export default function RecordingsList() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecordings()
      .then((res) => {
        setRecordings(res.data ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to load recordings');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton skeleton--rect" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state" role="alert">
        <div className="error-icon">!</div>
        <p className="text-sm font-medium">{error}</p>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="empty-state">
        <h3 className="text-lg font-semibold">No recordings</h3>
        <p className="text-sm text-secondary">Join a voice channel to start recording.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recordings.map((rec) => (
        <div key={rec.id} className="card card-pad--sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{rec.username}</p>
              <p className="text-xs text-secondary">{rec.channel_name} · {new Date(rec.created_at).toLocaleString()}</p>
            </div>
            {rec.download_url && (
              <a href={rec.download_url} className="btn btn--outline btn--sm" download>
                Download
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `recordings.astro` page**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Sidebar from '../components/sidebar/Sidebar.astro';
import Header from '../components/header/Header.astro';
import Card from '../components/ui/Card.astro';
import RecordingsList from '../islands/RecordingsList.tsx';
import ThemeToggle from '../islands/ThemeToggle.tsx';
---

<BaseLayout title="Recordings — BETE">
  <div class="page-layout">
    <Sidebar activeTab="recordings" />
    <main class="main-area">
      <Header title="Recordings">
        <ThemeToggle slot="actions" client:idle />
      </Header>
      <div class="content-area p-5">
        <Card>
          <RecordingsList client:load />
        </Card>
      </div>
    </main>
  </div>
</BaseLayout>
```

- [ ] **Step 3: Create `SettingsForm.tsx` island and `settings.astro` page**

```tsx
// settings.astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Sidebar from '../components/sidebar/Sidebar.astro';
import Header from '../components/header/Header.astro';
import Card from '../components/ui/Card.astro';
import ThemeToggle from '../islands/ThemeToggle.tsx';
import SettingsForm from '../islands/SettingsForm.tsx';
---

<BaseLayout title="Settings — BETE">
  <div class="page-layout">
    <Sidebar activeTab="settings" />
    <main class="main-area">
      <Header title="Settings">
        <ThemeToggle slot="actions" client:idle />
      </Header>
      <div class="content-area p-5 max-w-2xl">
        <Card>
          <SettingsForm client:idle />
        </Card>
      </div>
    </main>
  </div>
</BaseLayout>
```

```tsx
// SettingsForm.tsx
import { useState, useEffect } from 'react';

export default function SettingsForm() {
  const [theme, setThemeState] = useState<'dark' | 'light' | 'system'>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('bete-dashboard-theme') as 'dark' | 'light' | 'system' | null;
    if (stored) setThemeState(stored);
  }, []);

  const handleThemeChange = (mode: 'dark' | 'light' | 'system') => {
    setThemeState(mode);
    localStorage.setItem('bete-dashboard-theme', mode);
    let resolved: string;
    if (mode === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      resolved = mode;
    }
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  };

  return (
    <div className="space-y-4 p-4">
      <h2 className="h4">Appearance</h2>
      <div className="space-y-2">
        <label className="text-sm font-medium">Theme</label>
        <div className="flex gap-2">
          {(['dark', 'light', 'system'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleThemeChange(mode)}
              className={`btn ${theme === mode ? 'btn--primary' : 'btn--outline'} btn--sm`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/pages/recordings.astro services/frontend/src/islands/RecordingsList.tsx services/frontend/src/pages/settings.astro services/frontend/src/islands/SettingsForm.tsx
git commit -m "feat(frontend): add Recordings and Settings pages with islands"
```

---

## Phase 5: Polish (Deferred Islands + Cleanup)

### Task 5.1: Deferred Islands (Particles, Mascot, Recordings)

**Files:**
- Port: `services/frontend/src/islands/Particles.tsx` from `widgets/particles/`
- Create: `services/frontend/src/islands/MascotChat.tsx`

- [ ] **Step 1: Create `Particles.tsx`** (Three.js background, deferred)

```tsx
import { useEffect, useRef } from 'react';

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{ x: number; y: number; vx: number; vy: number; r: number }> = [];
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 3 + 1,
      });
    }

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'oklch(0.62 0.15 255 / 0.15)';
        ctx.fill();
      }
      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none -z-10"
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 2: Create `MascotChat.tsx`** (simple floating chatbot bubble)

```tsx
import { useState } from 'react';

export default function MascotChat() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-mascot">
      {open && (
        <div className="glass-strong rounded-xl p-4 mb-3 w-72 shadow-modal">
          <p className="text-sm text-secondary mb-2">Hi! I'm BETE's mascot. Ask me anything about the dashboard.</p>
          <input
            type="text"
            placeholder="Type a message..."
            className="input w-full text-sm"
          />
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-modal flex items-center justify-center text-xl hover:scale-105 transition-transform"
        aria-label="Toggle mascot chat"
      >
        {open ? '✕' : '✦'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add services/frontend/src/islands/Particles.tsx services/frontend/src/islands/MascotChat.tsx
git commit -m "feat(frontend): add deferred islands (Particles, MascotChat)"
```

---

### Task 5.2: Delete Legacy Code + Cleanup

**Files:**
- Delete: `services/frontend/src/App.tsx`
- Delete: `services/frontend/src/App.client.tsx`
- Delete: `services/frontend/src/entities/` (entire directory)
- Delete: `services/frontend/src/features/` (entire directory)
- Delete: `services/frontend/src/hooks/` (entire directory)
- Delete: `services/frontend/src/widgets/` (entire directory)

**Interfaces:**
- Consumes: All prior tasks proving feature parity
- Produces: Clean Astro project structure

- [ ] **Step 1: Verify all features are ported before deletion**

Check each feature directory has been ported to equivalent island/page:
- `features/auth/` → `islands/AuthGuard.tsx` ✓ (Task 2.2)
- `features/messages/` → `islands/MessageFeed.tsx` ✓ (Task 3.1)
- `features/live/` → `islands/VoiceControls.tsx` + `ActiveSpeakers.tsx` + `AudioVisualizer.tsx` + `NowPlaying.tsx` ✓ (Task 4.1)
- `features/settings/` → `islands/SettingsForm.tsx` ✓ (Task 4.2)
- `widgets/DashboardLayout.tsx` → replaced by `components/sidebar/` + `components/header/` + page layouts ✓ (Task 1.3)
- `entities/` → moved to `@bete/shared` or inline types ✓

- [ ] **Step 2: Remove legacy files**

Run:
```bash
git rm -r services/frontend/src/App.tsx services/frontend/src/App.client.tsx services/frontend/src/entities services/frontend/src/features services/frontend/src/hooks services/frontend/src/widgets
```

- [ ] **Step 3: Remove legacy shared/ui (replaced by Astro components)**

Run:
```bash
git rm -r services/frontend/src/shared/ui
```
(Keep `shared/api`, `shared/ws`, `shared/hooks`, `shared/lib` — these still used)

- [ ] **Step 4: Build to verify**

Run:
```bash
cd services/frontend && pnpm build 2>&1 | tail -30
```
Expected: Build succeeds, no missing imports.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(frontend): remove legacy React SPA files, clean project structure"
```

---

### Task 5.3: Final Verification

- [ ] **Step 1: Verify all pages render**

Run dev server and check each route:
```bash
cd services/frontend && pnpm dev
```
Check: `/live`, `/messages`, `/recordings`, `/settings`, `/login`, `/404`

- [ ] **Step 2: Build production bundle**

```bash
cd services/frontend && pnpm build
```
Expected: Build succeeds, output in `dist/`.

- [ ] **Step 3: Run typecheck**

```bash
cd services/frontend && pnpm typecheck
```
Expected: No type errors.

- [ ] **Step 4: Final commit**

```bash
git commit -m "chore(frontend): finalize Astro migration with full design system"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- All 5 migration phases match the spec ✓
- Design tokens from `design/` implemented in Task 1.1 ✓
- Component taxonomy from `05-component-architecture.md` in Task 1.2 ✓
- State machines from `09-state-machines.md` in all islands (loading/error/empty) ✓
- Responsive patterns from `10-responsive-system.md` in layout CSS ✓
- Glassmorphism from `01-color-system.md` in `base.css` ✓
- Motion system from `04-motion-system.md` in animations + reduced motion ✓
- Theme architecture from `15-theme-architecture.md` in `base.css` ✓

**2. Placeholder scan:** No TBD, TODO, or incomplete code. All steps contain actual implementation code.

**3. Type consistency:** All store interfaces use the same types consistently. `ActiveSpeaker`, `MessageRecord`, `VoiceStatus` referenced from `@bete/shared/types`.
