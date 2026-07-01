# Bete Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full visual redesign of Bete frontend to deeply integrate IMPHNEN design system, add dark mode, fix hardcoded colors, and polish every component.

**Architecture:** 5-layer incremental approach. Foundation (CSS vars + dark mode) first, then shared components, then layout, then feature components, then polish. Each layer is tested before the next. No new features — visual and structural changes only.

**Tech Stack:** React 19, Vite 8, Tailwind 4, Framer Motion, Radix UI, Lucide Icons

**Design Spec:** `docs/superpowers/specs/2026-07-02-bete-frontend-redesign-design.md`

## Global Constraints

- All components use CSS custom properties, not raw Tailwind utility colors. No `emerald-*`, `amber-*`, `red-*`, `blue-*` etc. Only `--success`, `--warning`, `--destructive`, `--primary`, etc.
- Dark mode: all components must render correctly in both `data-theme="light"` and `data-theme="dark"`
- No new features — preserve all existing functionality exactly
- Animation durations under 300ms for interactive elements, under 500ms for entry animations
- Z-index follows the registry: Header(10), Sidebar(20), TabStrip(30), Toast(40), MobileNav(50), Mascot(60), Modal(70), Overlay(100)
- Poppins monofamily throughout — no other typefaces
- Scroll areas use custom scrollbars styled with `--border` and `--primary`

---

## Task Map

```
Layer 0 ── T01: Theme engine + dark mode palette (styles.css)
           T02: Fix animation keyframes (shimmer, glowPulse)
           T03: Update DESIGN_TOKENS.md specs
           T04: Create theme context + toggle hook

Layer 1 ── T05: Badge (fix success/warning colors)
           T06: Toast (rewrite with CSS vars + z-index)
           T07: Skeleton (fix shimmer duration + variants)
           T08: EmptyState component (new)
           T09: Button/Card/Input minor variants

Layer 2 ── T10: TabStrip component (new)
           T11: Sidebar (expanded default, brand section)
           T12: Header (simplified brand bar + theme toggle UI)
           T13: MobileTabBar (overhaul)
           T14: DashboardLayout integrate all layout changes
           T15: ParticleBackground (lazy + mobile skip)

Layer 3 ── T16: MessageCard + MessagesPanel color cleanup
           T17: DashboardStats + User/Channel components cleanup
           T18: Live panel components cleanup (AudioVisualizer, Speakers, Recordings)

Layer 4 ── T19: Empty states integration across all panels
           T20: Theme toggle final integration + CSS transition
           T21: Hover state consistency + entry animation audit
```

---

### Task 1: Theme Engine & Dark Mode Palette

**Files:**
- Modify: `services/frontend/src/styles.css` — add dark mode `:root` overrides, restructure `@theme` block

**Interfaces:**
- Produces: CSS custom properties at `:root` (light) and `[data-theme="dark"]` (dark) levels
- Produces: Updated `@theme` block referencing CSS vars

- [ ] **Step 1: Add dark mode CSS variables after existing `:root`**

Add to `styles.css` after the `:root` block:

```css
[data-theme="dark"] {
  --background: #1c1c1f;
  --foreground: #f0f0f2;
  --card: #1c1c1f;
  --card-foreground: #f0f0f2;
  --muted: #141417;
  --muted-foreground: #a0a0a6;
  --accent: #26262a;
  --accent-foreground: #f0f0f2;
  --popover: #1c1c1f;
  --popover-foreground: #f0f0f2;

  --primary: #54a2ff;
  --primary-foreground: #0d0d0f;
  --primary-soft: #18263a;
  --primary-hover: #3d8ee8;
  --primary-active: #2a7ad4;

  --secondary: #4a8ef5;
  --secondary-foreground: #0d0d0f;
  --secondary-soft: #1a274a;

  --tertiary: #7984f5;
  --tertiary-foreground: #0d0d0f;
  --tertiary-soft: #20266a;

  --success: #34d399;
  --success-soft: #13261a;
  --warning: #fbbf24;
  --warning-soft: #261a10;
  --destructive: #f87171;
  --destructive-soft: #2a1418;
  --info: #60a5fa;
  --info-soft: #141e38;

  --border: #343438;
  --border-hover: #48484d;
  --input: #343438;
  --ring: #54a2ff;

  --outline: #6a6a70;
  --outline-variant: #404044;

  --primary-glow: rgba(84, 162, 255, 0.15);
  --tertiary-glow: rgba(121, 132, 245, 0.15);
  --destructive-glow: rgba(248, 113, 113, 0.15);
  --success-glow: rgba(52, 211, 153, 0.15);

  --surface: #1c1c1f;
  --surface-dim: #141417;
  --surface-bright: #2c2c30;
  --on-surface: #f0f0f2;
  --on-surface-variant: #a0a0a6;
  --inverse-surface: #f0f0f2;
  --inverse-on-surface: #1c1c1f;
  --surface-container: #26262a;
  --surface-container-low: #202023;
  --surface-container-high: #2c2c30;
  --surface-container-highest: #323236;
}
```

- [ ] **Step 2: Restructure `@theme` to reference CSS vars properly**

Update the existing `@theme` block in `styles.css`. The current approach already works with Tailwind 4 — verify the `@theme` directives reference the CSS custom properties correctly (not hardcoded hex values).

The existing `@theme` block already uses `--color-primary: #23a1eb` etc. — need to decide if we keep `@theme` with hex values (they're compile-time tokens that reference the CSS vars at runtime) or change them to reference the CSS vars. In Tailwind 4, `@theme` is a compile-time construct. The runtime values come from CSS custom properties. So `@theme` should have the light values as defaults, and `[data-theme="dark"]` overrides the CSS vars at runtime.

Current pattern:
```css
@theme {
  --color-primary: #23a1eb;
}
```
With dark mode, this is fine — `@theme` defines the utility class `text-primary` → `color: var(--color-primary)`, and the CSS var `--color-primary` changes value under `[data-theme="dark"]`.

BUT — components that use `bg-primary` will get `var(--color-primary)` which is fine. But components that use `var(--primary)` directly (from custom properties) need the CSS var, not the `@theme` one. 

The safest approach: **Keep `@theme` with light defaults** (it provides the utility classes) and **add `[data-theme="dark"]` CSS vars** that override at the CSS custom property level for both the `@theme` colors AND the raw custom properties.

- [ ] **Step 3: Add CSS transition for smooth theme switch**

At the end of the base layer in `styles.css`, add:

```css
/* Smooth theme transition */
html.theme-transitioning,
html.theme-transitioning *,
html.theme-transitioning *::before,
html.theme-transitioning *::after {
  transition: background-color 200ms ease,
              color 150ms ease,
              border-color 150ms ease,
              box-shadow 200ms ease !important;
}
```

Note: We apply this class only during the actual theme switch (via JS) to avoid performance issues with `transition: all`.

- [ ] **Step 4: Remove `@keyframes glowPulse` from tailwind.config.js if present**

Check `tailwind.config.js` for `glowPulse` keyframes. If they exist there but not in `styles.css`, remove from config and add to `styles.css`:

```css
@keyframes glowPulse {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 0.8; }
}
```

- [ ] **Step 5: Commit**

```bash
git add services/frontend/src/styles.css services/frontend/tailwind.config.js
git commit -m "feat(theme): add dark mode palette, CSS var transitions, fix keyframes"
```

---

### Task 2: Fix Animation Keyframes

**Files:**
- Modify: `services/frontend/src/styles.css` — add missing keyframes, fix shimmer
- Modify: `services/frontend/tailwind.config.js` — remove `glowPulse` keyframes

**Interfaces:**
- Consumes: Task 1 (updated styles.css base)
- Produces: Canonical animation keyframes in CSS only

- [ ] **Step 1: Fix shimmer duration to be consistent**

In `styles.css`, ensure `.animate-shimmer` has the canonical definition:

```css
.animate-shimmer {
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.06) 0%,
    rgba(0, 0, 0, 0.02) 40%,
    rgba(0, 0, 0, 0.06) 80%,
    rgba(0, 0, 0, 0.08) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

(Keep the existing definition — it's already correct at 1.5s.)

- [ ] **Step 2: Remove duplicate keyframes from tailwind.config.js**

In `tailwind.config.js`, find and remove any `glowPulse` or `shimmer` keyframes from the `keyframes` object — they should only live in `styles.css`.

- [ ] **Step 3: Commit**

```bash
git add services/frontend/src/styles.css services/frontend/tailwind.config.js
git commit -m "fix(theme): consolidate animation keyframes in styles.css, remove config duplicates"
```

---

### Task 3: Update DESIGN_TOKENS.md

**Files:**
- Modify: `services/frontend/DESIGN_TOKENS.md` — update known issues section, add dark mode notes

- [ ] **Step 1: Update §13 Known Issues to reflect resolved items**

Mark as resolved:
- §13.1 Hardcoded utility colors → "Addressing in T05-T19 across all component files"
- §13.4 `glow-pulse` keyframe fragmentation → "Resolved in T02"
- §13.5 `shimmer` duration mismatch → "Resolved in T02"
- §13.6 Z-index scale not formalized → "Resolved in design spec, implementing across layout layers"
- §13.7 Toast container z-index collision → "Resolved in T06"

- [ ] **Step 2: Add dark mode section**

Add a new section documenting the dark mode palette and `[data-theme="dark"]` approach.

- [ ] **Step 3: Commit**

```bash
git add services/frontend/DESIGN_TOKENS.md
git commit -m "docs: update DESIGN_TOKENS.md with dark mode and resolved issues"
```

---

### Task 4: Create Theme Context & Toggle Hook

**Files:**
- Create: `services/frontend/src/shared/hooks/useTheme.ts`

**Interfaces:**
- Produces: `useTheme()` hook returning `{ theme: 'light' | 'dark' | 'system', setTheme, resolvedTheme: 'light' | 'dark', toggle }`
- Produces: Applies `data-theme` attribute to `<html>`

- [ ] **Step 1: Create `useTheme` hook**

```tsx
/* ─── IMPHNEN Theme Hook ──────────────────────────────────────────
 * Light / Dark / System theme management with smooth transitions.
 * Persists choice to localStorage. Falls back to prefers-color-scheme.
 * ─────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "imphnen-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  const transitioning = root.classList.contains("theme-transitioning");
  if (!transitioning) {
    root.classList.add("theme-transitioning");
  }
  root.dataset.theme = resolved;
  // Remove transitioning class after the CSS transition completes
  if (!transitioning) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove("theme-transitioning");
      });
    });
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system")
      return stored;
    return "system";
  });

  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Listen for system theme changes (only when set to "system")
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme, resolvedTheme, toggle };
}
```

- [ ] **Step 2: Commit**

```bash
git add services/frontend/src/shared/hooks/useTheme.ts
git commit -m "feat(theme): create useTheme hook with light/dark/system support"
```

---

### Task 5: Badge — Fix Success/Warning Colors

**Files:**
- Modify: `services/frontend/src/shared/ui/badge.tsx`

**Interfaces:**
- Consumes: Task 1 (--success, --warning, --destructive CSS vars)
- Produces: Badge variants that all use CSS vars, no hardcoded Tailwind colors

- [ ] **Step 1: Read current badge.tsx**

- [ ] **Step 2: Replace hardcoded color variants**

Find:
```tsx
success: "bg-emerald-100 text-emerald-700",
warning: "bg-amber-100 text-amber-700",
```

Replace with:
```tsx
success: "bg-success-soft text-success",
warning: "bg-warning-soft text-warning",
```

Also verify all other variants (default, secondary, destructive, outline) already use CSS vars. The existing `variantStyles` in badge.tsx likely has these patterns already or similar. If `outline` uses raw `border-border`, that's fine since `--border` is a CSS var.

Also check: the `Badge` component currently maps `success` and `warning` to classes. We need to make sure `bg-success-soft` and `text-success` exist as Tailwind utilities (they should via `@theme` in `styles.css`).

Verify `styles.css` has:
```css
@theme {
  --color-success: #22c55e;
  --color-success-soft: #dcfce7;
  --color-warning: #f59e0b;
  --color-warning-soft: #fef3c7;
}
```

If not, add them to the `@theme` block. The dark-mode overrides in `[data-theme="dark"]` should also have the dark versions of these. (Already defined in Task 1.)

- [ ] **Step 3: Commit**

```bash
git add services/frontend/src/shared/ui/badge.tsx services/frontend/src/styles.css
git commit -m "fix(badge): replace hardcoded emerald/amber colors with CSS vars"
```

---

### Task 6: Toast — Rewrite with CSS Vars & Z-Index Fix

**Files:**
- Modify: `services/frontend/src/shared/ui/toast.tsx`

**Interfaces:**
- Consumes: Task 1 (CSS vars), Task 5 (Badge pattern)
- Produces: Toast with all semantic colors from CSS vars, z-index 40, positioned top-right

- [ ] **Step 1: Read current toast.tsx**

- [ ] **Step 2: Replace hardcoded color values**

Find patterns like:
```tsx
case "success": return "border-l-emerald-500";
case "warning": return "border-l-amber-500";
// and
case "success": return "text-emerald-500";
case "warning": return "text-amber-500";
```

Replace with:
```tsx
case "success": return "border-l-success text-success";
case "warning": return "border-l-warning text-warning";
```

- [ ] **Step 3: Fix z-index from z-50 to z-40**

Find:
```
className="fixed bottom-4 right-4 z-50"
```

Replace with:
```
className="fixed top-4 right-4 z-40"
```

(Change position from bottom to top to avoid MobileTabBar collision.)

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/shared/ui/toast.tsx
git commit -m "fix(toast): replace hardcoded colors with CSS vars, fix z-index, reposition top-right"
```

---

### Task 7: Skeleton — Fix Shimmer Duration & Add Variants

**Files:**
- Modify: `services/frontend/src/shared/ui/skeleton.tsx`

**Interfaces:**
- Consumes: Task 2 (canonical shimmer keyframe at 1.5s)
- Produces: Skeleton component with consistent animation + shape variants

- [ ] **Step 1: Read current skeleton.tsx**

- [ ] **Step 2: Add variant prop**

Current `Skeleton` is probably just a div with `rounded-lg bg-muted animate-shimmer`. Add a `variant` prop:

```tsx
type SkeletonVariant = "rounded" | "circular" | "rectangular";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
}

const variantClasses: Record<SkeletonVariant, string> = {
  rounded: "rounded-lg",
  circular: "rounded-full",
  rectangular: "rounded-none",
};

export function Skeleton({
  variant = "rounded",
  className,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "bg-muted animate-shimmer",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add services/frontend/src/shared/ui/skeleton.tsx
git commit -m "feat(skeleton): add variant prop (rounded/circular/rectangular), consistent shimmer"
```

---

### Task 8: EmptyState Component

**Files:**
- Create: `services/frontend/src/shared/ui/empty-state.tsx`
- Modify: `services/frontend/src/shared/ui/index.ts` — add export

**Interfaces:**
- Produces: `<EmptyState icon={...} title="..." description="..." action={...} />` component

- [ ] **Step 1: Create empty-state.tsx**

```tsx
/* ─── IMPHNEN EmptyState Component ──────────────────────────────
 * Standard empty/error/loading state with optional mascot icon
 * and CTA action. Used across all feature panels.
 * ─────────────────────────────────────────────────────────────────── */

import { motion } from "framer-motion";
import { type LucideIcon, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { fadeSlideUp } from "../hooks/useFramerStagger";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <motion.div
      variants={fadeSlideUp}
      initial="initial"
      animate="animate"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 gap-3" : "py-16 gap-4",
        className,
      )}
    >
      <div className={cn(
        "rounded-full bg-primary-soft p-3",
        compact ? "p-2" : "p-4",
      )}>
        <Icon className={cn(
          "text-primary",
          compact ? "h-5 w-5" : "h-8 w-8",
        )} />
      </div>
      {title && (
        <h3 className="typo-title-lg text-on-surface">{title}</h3>
      )}
      {description && (
        <p className="typo-body-md text-on-surface-variant max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-2">{action}</div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: Add export to shared/ui/index.ts**

Find the exports file and add:
```ts
export { EmptyState } from "./empty-state.js";
```

- [ ] **Step 3: Commit**

```bash
git add services/frontend/src/shared/ui/empty-state.tsx services/frontend/src/shared/ui/index.ts
git commit -m "feat(ui): add EmptyState component with icon, title, description, and action slot"
```

---

### Task 9: Button/Card/Input Minor Variants

**Files:**
- Modify: `services/frontend/src/shared/ui/button.tsx`
- Modify: `services/frontend/src/shared/ui/card.tsx`
- Modify: `services/frontend/src/shared/ui/input.tsx`

- [ ] **Step 1: Add tertiary variant to button.tsx**

Find the `variantStyles` object and add:
```tsx
tertiary: "bg-tertiary text-tertiary-foreground shadow-sm hover:bg-tertiary/90",
```

And ensure `icon-sm` size exists:
```tsx
const sizeClasses = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
  "icon-sm": "h-8 w-8",  // NEW
};
```

- [ ] **Step 2: Add elevated variant to card.tsx**

Find the Card component and add a `variant` prop:

```tsx
type CardVariant = "default" | "elevated" | "bordered";

const variantClasses: Record<CardVariant, string> = {
  default: "shadow-sm hover:shadow-md",
  elevated: "shadow-md hover:shadow-lg",
  bordered: "shadow-none border-2",
};

// Apply to the outer Card div:
className={cn(
  "rounded-xl border bg-card text-card-foreground transition-all duration-300",
  variantClasses[variant],
  className,
)}
```

- [ ] **Step 3: Add soft variant to input.tsx**

Add a `variant` prop:

```tsx
type InputVariant = "default" | "soft";

const variantClasses: Record<InputVariant, string> = {
  default: "border border-input bg-background",
  soft: "border-transparent bg-muted focus-visible:border-primary",
};
```

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/shared/ui/button.tsx services/frontend/src/shared/ui/card.tsx services/frontend/src/shared/ui/input.tsx
git commit -m "feat(ui): add button tertiary variant, card elevated variant, input soft variant"
```

---

### Task 10: TabStrip Component

**Files:**
- Create: `services/frontend/src/widgets/TabStrip.tsx`
- Modify: `services/frontend/src/shared/ui/index.ts` — maybe

**Interfaces:**
- Consumes: `DashboardTab` type from `entities/ui/types.ts`
- Produces: Horizontal tab strip with underline indicators, horizontal scroll on mobile

- [ ] **Step 1: Create TabStrip.tsx**

```tsx
/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN TabStrip — Horizontal navigation tabs
 * Underline indicator, horizontal scroll on mobile, sticky with z-30.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { motion } from "framer-motion";
import {
  LayoutDashboard,
  MessageSquare,
  Radio,
  type LucideIcon,
} from "lucide-react";
import type { DashboardTab } from "../entities/ui/types.js";
import { cn } from "../shared/lib/utils";

interface Tab {
  id: DashboardTab;
  label: string;
  icon: LucideIcon;
}

const tabs: Tab[] = [
  { id: "messages", label: "Pesan & Moderasi", icon: MessageSquare },
  { id: "live", label: "Voice & Media", icon: Radio },
  { id: "dashboard", label: "Dashboard Guild", icon: LayoutDashboard },
];

interface TabStripProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  className?: string;
}

export function TabStrip({ activeTab, onTabChange, className }: TabStripProps) {
  return (
    <nav
      className={cn(
        "sticky top-14 z-30 border-b border-border bg-surface/80 backdrop-blur-sm",
        "overflow-x-auto scrollbar-none",
        className,
      )}
    >
      <div className="mx-auto flex max-w-container gap-1 px-4 md:px-6 lg:px-8">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-3",
                "whitespace-nowrap typo-label-md",
                "transition-colors duration-150",
                isActive
                  ? "text-primary"
                  : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add services/frontend/src/widgets/TabStrip.tsx
git commit -m "feat(layout): add TabStrip component with spring underline indicator"
```

---

### Task 11: Sidebar — Expanded Default

**Files:**
- Modify: `services/frontend/src/widgets/Sidebar.tsx`

**Interfaces:**
- Consumes: Design spec Layer 2 layout
- Produces: Sidebar w-64 expanded by default, with collapsible toggle, proper brand section

- [ ] **Step 1: Read current Sidebar.tsx**

- [ ] **Step 2: Change default collapsed to false**

Current: `collapsed = true` → Change to `collapsed = false`

- [ ] **Step 3: Update collapsed check from `w-16` to include toggle button**

The current component has `collapsed ? "w-16" : "w-64"`. Since we want expanded by default, we should:
- Keep the `collapsed` prop but default to `false`
- Add a toggle button (hamburger icon) at the top of the sidebar
- Ensure the brand section always shows

If the component is used in `DashboardLayout`, update the usage there if `collapsed` is hardcoded. Check `DashboardLayout.tsx` for `<Sidebar collapsed={...}>`.

In `Sidebar.tsx`:
- Change default: `collapsed = false`
- Keep all existing structure but ensure the brand section (logo, gradient text, subtitle) is always visible since we're expanded by default
- Mascot image stays visible
- Add a collapse toggle button (optional, could add later)

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/widgets/Sidebar.tsx
git commit -m "feat(sidebar): expanded by default (w-64), brand section always visible"
```

---

### Task 12: Header — Simplified Brand Bar + Theme Toggle UI

**Files:**
- Modify: `services/frontend/src/widgets/Header.tsx`

**Interfaces:**
- Consumes: Task 4 (useTheme hook)
- Produces: Compact header with logo + status badges + theme toggle

- [ ] **Step 1: Read current Header.tsx**

- [ ] **Step 2: Simplify the header layout**

Current header has:
- Left: logo + brand gradient + page title + subtitle + moderation badge
- Right: guild badge + WS status + voice status

New header should be:
- Left: Logo + "IMPHNEN" + "· Guild Watcher"
- Right: Status badges (WS, Voice) + Theme toggle (sun/moon) + Notification bell

Move page title + subtitle to the content area (they're already handled by the panel components themselves in most cases — DashboardPanel has its own heading).

```tsx
// Simplified Header
<header className="sticky top-0 z-10 border-b border-border bg-surface/70 backdrop-blur-md px-4 py-3 md:px-8">
  <div className="mx-auto flex max-w-container items-center justify-between">
    {/* Left: Brand */}
    <div className="flex items-center gap-3">
      <img
        src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/docs/logo.svg"
        alt="IMPHNEN"
        className="h-7 w-7"
      />
      <div>
        <h1 className="typo-label-md text-on-surface">
          <span className="im-gradient-text">IMPHNEN</span>
          <span className="mx-1.5 text-on-surface-variant">·</span>
          <span className="font-normal">Guild Watcher</span>
        </h1>
      </div>
    </div>

    {/* Right: Status + Actions */}
    <div className="flex items-center gap-2">
      <WsIndicator status={wsStatus} />
      <VoiceIndicator voiceStatus={voiceStatus} />
      
      {/* Theme Toggle */}
      <ThemeToggle />
    </div>
  </div>
</header>
```

Where `ThemeToggle` is:

```tsx
function ThemeToggle() {
  const { resolvedTheme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-lg p-2 text-on-surface-variant hover:bg-accent hover:text-on-surface transition-colors duration-150"
      title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add services/frontend/src/widgets/Header.tsx
git commit -m "feat(header): simplify brand bar, add theme toggle button"
```

---

### Task 13: MobileTabBar Overhaul

**Files:**
- Modify: `services/frontend/src/shared/ui/MobileTabBar.tsx`

**Interfaces:**
- Consumes: DashboardTab type
- Produces: Bottom nav with 3 tabs + mascot icon, safe area padding, active dot indicator

- [ ] **Step 1: Read current MobileTabBar.tsx**

- [ ] **Step 2: Update to match design spec**

Current MobileTabBar probably has simple icon + label layout. Enhance with:
- Active tab dot indicator (small dot above active icon)
- Brand logo subtle watermark background
- Safe area padding: `pb-4 md:pb-0` (or `pb-safe`)
- Glass background: `bg-surface/80 backdrop-blur-lg`
- Z-index: `z-50` (stays at mobile nav level)

```tsx
// Enhanced MobileTabBar
<div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/80 backdrop-blur-lg pb-safe md:hidden">
  <div className="flex items-center justify-around py-2">
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const isActive = activeTab === tab.id;
      return (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className="relative flex flex-col items-center gap-1 px-4 py-1"
        >
          {isActive && (
            <motion.div
              layoutId="mobile-tab-dot"
              className="absolute -top-2 h-1 w-6 rounded-full bg-primary"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <Icon className={cn(
            "h-5 w-5 transition-colors",
            isActive ? "text-primary" : "text-on-surface-variant",
          )} />
          <span className={cn(
            "text-[10px] font-medium",
            isActive ? "text-primary" : "text-on-surface-variant",
          )}>
            {tab.label}
          </span>
        </button>
      );
    })}
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add services/frontend/src/shared/ui/MobileTabBar.tsx
git commit -m "feat(mobile): enhance MobileTabBar with dot indicator, safe area, glass bg"
```

---

### Task 14: DashboardLayout — Integrate All Layout Changes

**Files:**
- Modify: `services/frontend/src/widgets/DashboardLayout.tsx`
- Modify: `services/frontend/src/App.tsx`

**Interfaces:**
- Consumes: Tasks 10-13 (TabStrip, Sidebar, Header, MobileTabBar)
- Produces: Full integrated layout with all new components

- [ ] **Step 1: Read current DashboardLayout.tsx**

- [ ] **Step 2: Integrate TabStrip**

Add `<TabStrip activeTab={activeTab} onTabChange={onTabChange} />` between Header and content area.

The current layout is:
```
Sidebar | Header + Content
```

New layout:
```
Sidebar | Header (brand bar)
        | TabStrip (tabs)
        | Content (page)
```

- [ ] **Step 3: Read App.tsx and check layout integration**

In `App.tsx`, the layout is constructed. Verify that:
1. The `collapsed` prop for Sidebar is not hardcoded (should default to false now)
2. TabStrip gets the correct `activeTab` and `onTabChange`
3. Theme toggle hook is integrated at the App level (the `useTheme` hook sets `data-theme` on `<html>`, so it just needs to be called somewhere in the component tree)

Add the theme hook call at the App level:
```tsx
import { useTheme } from "./shared/hooks/useTheme";
// In App component:
useTheme(); // This sets data-theme attribute and listens for system changes
```

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/widgets/DashboardLayout.tsx services/frontend/src/App.tsx
git commit -m "feat(layout): integrate TabStrip, Sidebar expanded default, theme hook in App"
```

---

### Task 15: ParticleBackground — Lazy + Mobile Skip

**Files:**
- Modify: `services/frontend/src/widgets/particles/ParticleBackground.tsx`

**Interfaces:**
- Produces: RequestAnimationFrame-based lazy render, skip on mobile/reduced-motion

- [ ] **Step 1: Read current ParticleBackground.tsx**

- [ ] **Step 2: Add conditional rendering**

Add at the top of the component:

```tsx
const [reducedMotion, setReducedMotion] = useState(true); // Default safe
const [isMobile, setIsMobile] = useState(true);
const [shouldRender, setShouldRender] = useState(false);

useEffect(() => {
  const mqReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  setReducedMotion(mqReduced.matches);
  const mqMobile = window.matchMedia("(max-width: 768px)");
  setIsMobile(mqMobile.matches);

  const handleReducedChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
  const handleMobileChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);

  mqReduced.addEventListener("change", handleReducedChange);
  mqMobile.addEventListener("change", handleMobileChange);

  // Defer actual render by one frame to not block initial paint
  requestAnimationFrame(() => setShouldRender(true));

  return () => {
    mqReduced.removeEventListener("change", handleReducedChange);
    mqMobile.removeEventListener("change", handleMobileChange);
  };
}, []);
```

If `reducedMotion || isMobile || !shouldRender`, return `null`.

- [ ] **Step 3: Update CSS variable references**

Find any hardcoded hex colors in the Three.js code and replace with CSS variable reads. For example, if there's:

```tsx
const color = new THREE.Color("#23a1eb");
```

Replace with:
```tsx
const root = getComputedStyle(document.documentElement);
const primaryColor = root.getPropertyValue("--primary").trim();
const color = new THREE.Color(primaryColor || "#23a1eb");
```

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/widgets/particles/ParticleBackground.tsx
git commit -m "perf(particles): lazy render, skip on mobile/reduced-motion, CSS var colors"
```

---

### Task 16: MessageCard + MessagesPanel Color Cleanup

**Files:**
- Modify: `services/frontend/src/features/messages/components/MessageCard.tsx`
- Modify: `services/frontend/src/features/messages/index.tsx` (MessagesPanel)
- Modify: `services/frontend/src/features/messages/components/ImageGrid.tsx`

- [ ] **Step 1: Read MessageCard.tsx and identify all hardcoded colors**

Search for: `emerald`, `amber`, `red`, `orange`, `yellow`, `blue`, `pink`, `purple`, `sky`, `cyan`, `violet` — these are all hardcoded utility colors.

- [ ] **Step 2: Replace MessageCard.tsx hardcoded colors**

Map each instance to its CSS var equivalent:

| Hardcoded | CSS Var Replacement |
|-----------|-------------------|
| `bg-red-100 text-red-700 border-red-200` | `bg-destructive-soft text-destructive border-destructive/20` |
| `bg-orange-100 text-orange-700 border-orange-200` | `bg-warning-soft text-warning border-warning/20` |
| `bg-yellow-100 text-yellow-700 border-yellow-200` | `bg-warning-soft text-warning border-warning/20` |
| `bg-blue-100 text-blue-700 border-blue-200` | `bg-info-soft text-info border-info/20` |
| `bg-emerald-50/40` → any | `bg-success/5` |
| `border-l-emerald-400` | `border-l-success` |
| `bg-pink-50/40` → any | `bg-tertiary/5` |
| `border-l-pink-400` | `border-l-tertiary` |
| `text-pink-600` | `text-tertiary` |
| `text-pink-600/70` | `text-tertiary/70` |
| `text-emerald-600` | `text-success` |

- [ ] **Step 3: Replace MessagesPanel hardcoded stats badges**

Replace:
```tsx
// Stat badges showing counts
"bg-emerald-100 text-emerald-700 border-emerald-200" → "bg-success-soft text-success border-success/20"
"bg-orange-100 text-orange-700 border-orange-200" → "bg-warning-soft text-warning border-warning/20"
"bg-red-100 text-red-700 border-red-200" → "bg-destructive-soft text-destructive border-destructive/20"
"text-emerald-600" → "text-success"
```

- [ ] **Step 4: Replace ImageGrid.tsx hardcoded colors**

Replace:
```tsx
"bg-purple-100 text-purple-700 border-purple-200" → "bg-tertiary-soft text-tertiary border-tertiary/20"
```

- [ ] **Step 5: Commit**

```bash
git add services/frontend/src/features/messages/
git commit -m "fix(messages): replace all hardcoded colors with CSS vars in MessageCard, MessagesPanel, ImageGrid"
```

---

### Task 17: Dashboard + User/Channel Components Color Cleanup

**Files:**
- Modify: `services/frontend/src/features/dashboard/components/DashboardStats.tsx`
- Modify: `services/frontend/src/features/dashboard/components/UserSummaryList.tsx`
- Modify: `services/frontend/src/features/dashboard/components/UserProfileDetail.tsx`
- Modify: `services/frontend/src/features/dashboard/components/ChannelProfileDetail.tsx`

- [ ] **Step 1: Read each file and identify hardcoded colors**

Search for: `emerald`, `amber`, `red`, `blue`, `violet`, `cyan`, `sky`, `orange`, `yellow`, `purple`, `pink`, `green`

- [ ] **Step 2: Replace DashboardStats.tsx**

The stat cards show counts for clean/flagged/error/total. Replace:
- `text-emerald-500` → `text-success`
- `bg-emerald-100` → `bg-success-soft`
- `text-blue-500` → `text-primary` or `text-info`
- `bg-blue-100` → `bg-primary-soft` or `bg-info-soft`
- `text-violet-500` → `text-tertiary`
- `bg-violet-100` → `bg-tertiary-soft`
- `text-emerald-600` → `text-success`
- `bg-cyan-100` → `bg-info-soft`
- `text-cyan-500` → `text-info`
- `text-amber-500` → `text-warning`
- `bg-amber-100` → `bg-warning-soft`

Better approach: Create a `StatCard` sub-component that takes a `variant` prop (`primary`, `success`, `warning`, `destructive`) and renders the appropriate semantic colors.

```tsx
type StatVariant = "primary" | "success" | "warning" | "destructive";

const statStyles: Record<StatVariant, { bg: string; text: string; iconBg: string }> = {
  primary: { bg: "bg-primary-soft", text: "text-primary", iconBg: "bg-primary" },
  success: { bg: "bg-success-soft", text: "text-success", iconBg: "bg-success" },
  warning: { bg: "bg-warning-soft", text: "text-warning", iconBg: "bg-warning" },
  destructive: { bg: "bg-destructive-soft", text: "text-destructive", iconBg: "bg-destructive" },
};
```

Then use:
```tsx
<StatCard variant="success" icon={CheckCircle2} value="1,234" label="Clean" />
<StatCard variant="destructive" icon={AlertTriangle} value="56" label="Flagged" />
```

- [ ] **Step 3: Replace UserSummaryList.tsx**

Replace:
- `bg-emerald-100 text-emerald-700` → `bg-success-soft text-success`
- `bg-amber-100 text-amber-700` → `bg-warning-soft text-warning`
- `bg-red-100 text-red-700` → `bg-destructive-soft text-destructive`

These are likely used for AI status badges (clean/flagged/error) on user cards. Use the `Badge` component with appropriate variant instead of inline spans.

- [ ] **Step 4: Replace UserProfileDetail.tsx**

Replace same patterns as above. Also:
- `text-emerald-600` → `text-success`

- [ ] **Step 5: Replace ChannelProfileDetail.tsx**

Same patterns.

- [ ] **Step 6: Commit**

```bash
git add services/frontend/src/features/dashboard/
git commit -m "fix(dashboard): replace all hardcoded colors with CSS vars, use semantic variant system"
```

---

### Task 18: Live Panel Components Color Cleanup

**Files:**
- Modify: `services/frontend/src/features/live/components/AudioVisualizer.tsx`
- Modify: `services/frontend/src/features/live/components/ActiveSpeakers.tsx`
- Modify: `services/frontend/src/features/live/components/RecordingsSubPanel.tsx`

- [ ] **Step 1: Read AudioVisualizer.tsx**

Find hardcoded gradient colors:
```tsx
gradient.addColorStop(0, "#23a1eb");
gradient.addColorStop(1, "#3eb0f2");
```

Replace with CSS variable reads:
```tsx
const root = getComputedStyle(document.documentElement);
const primary = root.getPropertyValue("--primary").trim() || "#23a1eb";
const lighter = primary + "88"; // semi-transparent

gradient.addColorStop(0, primary);
gradient.addColorStop(1, lighter);
```

- [ ] **Step 2: Read ActiveSpeakers.tsx**

Replace:
- `text-emerald-700` → `text-success` (for speaking/active indicator)

- [ ] **Step 3: Read RecordingsSubPanel.tsx**

Replace:
- `bg-white` → `bg-surface` (CSS var)
- `border-sky-200` → `border-outline-variant`

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/features/live/
git commit -m "fix(live): replace hardcoded colors with CSS vars in AudioVisualizer, ActiveSpeakers, Recordings"
```

---

### Task 19: Empty States Integration

**Files:**
- Modify: `services/frontend/src/features/messages/index.tsx` — use EmptyState for no-search-results
- Modify: `services/frontend/src/features/dashboard/index.tsx` — use EmptyState for user/channel empty
- Modify: `services/frontend/src/features/live/components/ActiveSpeakers.tsx` — use EmptyState
- Modify: `services/frontend/src/features/live/components/RecordingsSubPanel.tsx` — use EmptyState

- [ ] **Step 1: Replace ad-hoc empty states with EmptyState component**

For each panel, find patterns like:
```tsx
<div className="flex flex-col items-center gap-4 py-12">
  <MascotImage size="md" className="opacity-60" />
  <p className="text-sm text-muted-foreground">No data to display</p>
</div>
```

Replace with:
```tsx
<EmptyState
  icon={MessageSquare}
  title="Belum Ada Pesan"
  description="Tunggu aktivitas di server. Pesan akan muncul secara real-time."
/>
```

- [ ] **Step 2: Commit**

```bash
git add services/frontend/src/features/messages/ services/frontend/src/features/dashboard/ services/frontend/src/features/live/
git commit -m "feat(ui): integrate EmptyState component across all panels"
```

---

### Task 20: Theme Toggle Final Integration

**Files:**
- Modify: `services/frontend/src/widgets/Header.tsx` — ensure theme toggle is wired
- Modify: `services/frontend/src/App.tsx` — ensure `useTheme()` is called at root level

- [ ] **Step 1: Verify theme toggle is connected**

In `App.tsx`, add:
```tsx
import { useTheme } from "./shared/hooks/useTheme";
// ...
export default function App() {
  const uiState = useUIState(); // existing
  useTheme(); // NEW — activates theme system
  // ...
}
```

In `Header.tsx`, verify the toggle button exists and calls `toggle()` from `useTheme`.

- [ ] **Step 2: Add transition to html element during theme switch**

The `applyTheme` function in `useTheme.ts` already adds `theme-transitioning` class. Verify CSS transitions are effective.

- [ ] **Step 3: Commit**

```bash
git add services/frontend/src/App.tsx services/frontend/src/widgets/Header.tsx
git commit -m "fix(theme): integrate theme toggle at App root level, verify transitions"
```

---

### Task 21: Hover State Consistency + Entry Animation Audit

**Files:**
- Review and audit all feature panels and widgets

- [ ] **Step 1: Audit hover states**

Check:
- Sidebar nav items: `hover:bg-primary-soft/50`
- Cards: shadow increase on hover (already done via `hover:shadow-md`)
- List items: `hover:bg-surface-container-high` (or `hover:bg-accent`)
- Icon buttons: `hover:bg-accent`
- All should use `transition-colors duration-150` or `transition-all duration-200`

- [ ] **Step 2: Audit entry animations**

Verify all panels use `cardStagger` / `cardItem` from `useFramerStagger`:
- MessagesPanel — already uses it ✅
- LivePanel — already uses it ✅
- DashboardPanel — verify DashboardStatsContent uses it ✅

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(a11y): audit hover states and entry animations for consistency"
```

---

## Execution Order Summary

```
T01 ── styles.css dark mode + theme vars
T02 ── Fix animation keyframes (shimmer, glowPulse)
T03 ── Update DESIGN_TOKENS.md
T04 ── useTheme hook
T05 ── Badge fix
T06 ── Toast rewrite
T07 ── Skeleton variants
T08 ── EmptyState component
T09 ── Button/Card/Input variants
T10 ── TabStrip component
T11 ── Sidebar expanded default
T12 ── Header simplified + theme toggle
T13 ── MobileTabBar overhaul
T14 ── DashboardLayout + App.tsx integration
T15 ── ParticleBackground lazy
T16 ── MessageCard + MessagesPanel
T17 ── Dashboard components cleanup
T18 ── Live panel components cleanup
T19 ── Empty states integration
T20 ── Theme toggle final integration
T21 ── Hover + entry animation audit
```

Dependencies: Tasks 1-4 must complete before 5-9 (CSS vars needed). Tasks 5-10 must complete before 10-15 (components needed). Tasks 16-18 depend on 1 (CSS vars) and 8 (EmptyState). Tasks 19-21 are final polish after everything else.
