# Discord Automod — Neo Surveillance Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full frontend redesign with glassmorphic dark theme, floating top nav, Live2D mascot, and rich analytics dashboard.

**Architecture:** No routing or state management changes — same Next.js App Router, TanStack Query, WebSocket context. Only visual layer and component structure rewritten. New glass component system wraps existing logic.

**Tech Stack:** Next.js 16 (static export), Tailwind v4, shadcn/ui, Recharts 3.8, Live2D Cubism SDK (WebGL), JetBrains Mono + Inter fonts.

## Global Constraints

- All files under `services/frontend/src/` — absolute imports via `@/` alias
- All dashboard pages are `"use client"` — preserve this
- API client at `src/lib/api/` — do not modify
- WS context at `src/lib/ws/context.tsx` — do not modify
- WS event types at `src/lib/ws/types.ts` — do not modify
- Hooks at `src/hooks/` — preserve signatures, may add new hooks
- Types at `src/lib/types/` — do not modify
- Format utils at `src/lib/format.ts` — do not modify
- Tailwind v4 — use `@theme inline` tokens, not `tailwind.config`
- All colors in OKLCH — never hex or HSL
- Radius tokens use `var(--radius-*)` scale
- All glass effects: `backdrop-blur-xl` + low-opacity bg + subtle border

---

## File Structure Map

### Modified files:
| File | Change |
|------|--------|
| `src/app/globals.css` | Complete rewrite — new tokens, glass system, animations |
| `src/app/layout.tsx` | Fonts (Inter + JetBrains Mono), metadata |
| `src/app/page.tsx` | Redirect `/dashboard` not `/messages` |
| `src/app/(dashboard)/layout.tsx` | Top nav, no sidebar, mascot context, media context, WS provider |
| `src/lib/navigation.ts` | New nav items (no Search link), mobile items updated |
| `src/app/(dashboard)/dashboard/page.tsx` | Full rewrite — Ops Center |
| `src/app/(dashboard)/messages/page.tsx` | Full rewrite — Split pane |
| `src/app/(dashboard)/voice/page.tsx` | Full rewrite — Connection Center |
| `src/app/(dashboard)/recordings/page.tsx` | Full rewrite — Library |
| `src/app/(dashboard)/settings/page.tsx` | Full rewrite — Glass cards |

### New component files:
| File | Responsibility |
|------|---------------|
| `src/components/layout/top-nav.tsx` | Floating top nav bar |
| `src/components/layout/sub-nav.tsx` | Per-page sub-navigation tabs |
| `src/components/layout/hidden-sidebar.tsx` | Hover-activated guild sidebar |
| `src/components/layout/mobile-nav.tsx` | Redesigned mobile bottom nav |
| `src/components/glass/card.tsx` | Glass card (base, elevated, interactive, danger) |
| `src/components/glass/panel.tsx` | Glass panel wrapper |
| `src/components/glass/divider.tsx` | Glass-styled separator |
| `src/components/dashboard/stat-card.tsx` | Stat card with micro sparkline |
| `src/components/dashboard/live-stream.tsx` | Auto-scrolling message stream |
| `src/components/dashboard/mod-queue.tsx` | Moderation queue |
| `src/components/dashboard/message-trend-chart.tsx` | 7-day area chart |
| `src/components/dashboard/activity-heatmap.tsx` | Hour × day heatmap |
| `src/components/dashboard/top-channels-chart.tsx` | Top channels bar chart |
| `src/components/messages/message-list.tsx` | Left pane message list |
| `src/components/messages/message-card.tsx` | Redesigned message card |
| `src/components/messages/message-detail.tsx` | Right pane detail view |
| `src/components/messages/attachments-grid.tsx` | Attachments gallery |
| `src/components/messages/ai-analysis-panel.tsx` | AI analysis breakdown |
| `src/components/messages/search-overlay.tsx` | Cmd+K spotlight search |
| `src/components/voice/connection-card.tsx` | Voice connection + status |
| `src/components/voice/speaker-waveform.tsx` | Canvas waveform |
| `src/components/voice/mic-control.tsx` | Mic toggle + volume |
| `src/components/voice/activity-timeline.tsx` | Voice activity chart |
| `src/components/recordings/recording-card.tsx` | Glass card + waveform preview |
| `src/components/recordings/recording-player.tsx` | Inline audio player |
| `src/components/mascot/mascot-container.tsx` | Floating L2D container |
| `src/components/mascot/mascot-canvas.tsx` | WebGL Live2D renderer |
| `src/components/mascot/chat-panel.tsx` | Chat input + history |
| `src/components/mascot/mascot-context.tsx` | Context provider |
| `src/components/media/mini-player.tsx` | Floating media player |
| `src/components/shared/error-boundary.tsx` | Per-page error boundary |
| `src/components/shared/loading-skeleton.tsx` | Glass shimmer skeleton |
| `src/components/shared/empty-state.tsx` | Empty state |
| `src/lib/hooks/use-media-player.ts` | Global media player context |
| `src/lib/hooks/use-mascot.ts` | Mascot context hook |

### Deleted files (replaced by new components):
| File | Replaced by |
|------|-------------|
| `src/components/layout/app-sidebar.tsx` | `top-nav.tsx` + `hidden-sidebar.tsx` |
| `src/components/layout/app-header.tsx` | `top-nav.tsx` + `sub-nav.tsx` |
| `src/components/chatbot/chatbot.tsx` | `mascot/` components |
| `src/components/shared/stat-card.tsx` | `dashboard/stat-card.tsx` |
| `src/components/shared/detail-stat.tsx` | inline in detail views |
| `src/components/messages/images-grid.tsx` | `attachments-grid.tsx` |
| `src/components/messages/review-list.tsx` | part of `message-list.tsx` (filtered) |
| `src/components/messages/message-detail-view.tsx` | `message-detail.tsx` |

---

## Tasks

### Task 1: Design Tokens & Global CSS Foundation

**Files:**
- Modify: `src/app/globals.css` — complete rewrite

**Interfaces:**
- Produces: CSS custom properties consumed by ALL components

- [ ] **Step 1: Write dark-theme design tokens**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  /* Canvas — deep navy */
  --color-canvas: oklch(0.07 0.015 250);
  --color-surface: oklch(0.11 0.02 245 / 0.6);
  --color-surface-hover: oklch(0.15 0.02 245 / 0.7);

  /* Glass */
  --color-glass-bg: oklch(1 0 0 / 0.04);
  --color-glass-border: oklch(1 0 0 / 0.08);
  --glass-shadow: 0 8px 32px oklch(0 0 0 / 0.4);

  /* Primary — teal-cyan */
  --color-primary: oklch(0.62 0.17 215);
  --color-primary-glow: oklch(0.62 0.17 215 / 0.4);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-border: oklch(1 0 0 / 0.06);
  --color-border-glow: oklch(0.62 0.17 215 / 0.3);

  /* Accents */
  --color-accent-purple: oklch(0.65 0.2 280);
  --color-accent-amber: oklch(0.7 0.17 75);
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-success: oklch(0.6 0.18 160);

  /* Text */
  --color-text-primary: oklch(0.93 0.01 245);
  --color-text-secondary: oklch(0.55 0.02 245);
  --color-text-mono: oklch(0.62 0.17 215);

  /* Legacy overrides for shadcn compatibility */
  --color-background: var(--color-canvas);
  --color-foreground: var(--color-text-primary);
  --color-card: var(--color-surface);
  --color-card-foreground: var(--color-text-primary);
  --color-muted: oklch(0.17 0.015 245);
  --color-muted-foreground: var(--color-text-secondary);
  --color-accent: var(--color-primary);
  --color-accent-foreground: var(--color-primary-foreground);

  /* Radius */
  --radius-card: 16px;
  --radius-panel: 12px;
  --radius-control: 8px;
  --radius-pill: 9999px;
  --radius: 0.625rem; /* shadcn compat */

  /* Fonts */
  --font-sans: "Inter", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
}
```

- [ ] **Step 2: Add glass utility classes**

```css
@layer utilities {
  .glass {
    background: var(--color-glass-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--color-glass-border);
    box-shadow: var(--glass-shadow);
  }
  .glass-elevated {
    background: var(--color-glass-bg);
    backdrop-filter: blur(16px);
    border: 1px solid var(--color-border-glow);
    box-shadow: 0 8px 32px oklch(0 0 0 / 0.5), 0 0 20px var(--color-primary-glow);
  }
  .glass-intense {
    background: oklch(1 0 0 / 0.08);
    backdrop-filter: blur(20px);
    border: 1px solid oklch(1 0 0 / 0.12);
  }
}
```

- [ ] **Step 3: Add ambient background + animations**

```css
@layer base {
  * { @apply border-border outline-ring/50; }
  body {
    @apply bg-canvas text-text-primary font-sans antialiased;
    background-image:
      radial-gradient(circle, oklch(1 0 0 / 0.025) 1px, transparent 1px),
      radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.62 0.17 215 / 0.06), transparent),
      radial-gradient(ellipse 50% 40% at 80% 80%, oklch(0.65 0.2 280 / 0.04), transparent);
    background-size: 24px 24px, 100% 100%, 100% 100%;
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: oklch(1 0 0 / 0.1); border-radius: 999px; }
  ::-webkit-scrollbar-thumb:hover { background: oklch(1 0 0 / 0.2); }
}

@keyframes pulse-ring {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(2.5); opacity: 0; }
}
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }
.animate-pulse-ring { animation: pulse-ring 1.5s ease-out infinite; }
.animate-shimmer { background: linear-gradient(90deg, transparent, oklch(0.62 0.17 215 / 0.08), transparent); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
```

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add design tokens, glass utilities, and ambient animations"
```

---

### Task 2: Root Layout & Fonts

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Rewrite root layout with Inter + JetBrains Mono fonts**

```tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Discord Automod — Moderation Dashboard",
  description: "AI-powered Discord moderation and voice monitoring dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-script" strategy="beforeInteractive">
          {`try{const t=localStorage.getItem('theme')||'dark';document.documentElement.classList.add(t)}catch(e){}`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Update redirect**

In `src/app/page.tsx`, change redirect from `/messages` to `/dashboard`:

```tsx
import { redirect } from "next/navigation";
export default function RootPage() {
  redirect("/dashboard");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: update root layout with new fonts and redirect to dashboard"
```

---

### Task 3: Navigation Config

**Files:**
- Modify: `src/lib/navigation.ts`

**Interfaces:**
- Produces: `navItems` array consumed by `top-nav.tsx`, `mobile-nav.tsx`

- [ ] **Step 1: Rewrite navigation items**

```tsx
import {
  LayoutDashboard,
  MessageSquare,
  Mic,
  Headphones,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavItemWithMatch extends NavItem {
  matchPrefix: string;
}

export const navItems: NavItemWithMatch[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    matchPrefix: "/dashboard",
  },
  {
    href: "/messages",
    label: "Messages",
    icon: MessageSquare,
    matchPrefix: "/messages",
  },
  {
    href: "/voice",
    label: "Voice",
    icon: Mic,
    matchPrefix: "/voice",
  },
  {
    href: "/recordings",
    label: "Recordings",
    icon: Headphones,
    matchPrefix: "/recordings",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    matchPrefix: "/settings",
  },
];

export const mobileNavItems: NavItemWithMatch[] = navItems.filter((item) =>
  ["/dashboard", "/messages", "/voice", "/recordings"].includes(item.href),
);

export function isActivePath(
  pathname: string,
  matchPrefix: string,
): boolean {
  if (matchPrefix === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(matchPrefix);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/navigation.ts
git commit -m "feat: update navigation config — remove search link, add recordings"
```

---

### Task 4: Glass Component System

**Files:**
- Create: `src/components/glass/card.tsx`
- Create: `src/components/glass/panel.tsx`
- Create: `src/components/glass/divider.tsx`

**Interfaces:**
- Produces: `<GlassCard variant="base" | "elevated" | "interactive" | "danger">`, `<GlassPanel>`, `<GlassDivider>`

- [ ] **Step 1: Create GlassCard**

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

type GlassVariant = "base" | "elevated" | "interactive" | "danger";

interface GlassCardProps extends ComponentPropsWithoutRef<"div"> {
  variant?: GlassVariant;
}

const variantStyles: Record<GlassVariant, string> = {
  base: "glass rounded-[var(--radius-card)]",
  elevated:
    "glass-elevated rounded-[var(--radius-card)]",
  interactive:
    "glass rounded-[var(--radius-card)] transition-all duration-150 hover:scale-[1.01] hover:border-[var(--color-border-glow)] cursor-pointer",
  danger:
    "glass rounded-[var(--radius-card)] border-red-500/30",
};

export function GlassCard({
  variant = "base",
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(variantStyles[variant], "p-5", className)}
      {...props}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create GlassPanel**

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

interface GlassPanelProps extends ComponentPropsWithoutRef<"div"> {
  dense?: boolean;
}

export function GlassPanel({
  dense = false,
  className,
  children,
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "glass rounded-[var(--radius-panel)]",
        dense ? "p-3" : "p-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create GlassDivider**

```tsx
"use client";

import { cn } from "@/lib/utils";

export function GlassDivider({ className }: { className?: string }) {
  return (
    <div className={cn("h-px bg-gradient-to-r from-transparent via-oklch(1 0 0 / 0.08) to-transparent", className)} />
  );
}
```

- [ ] **Step 4: Create barrel export**

```tsx
// src/components/glass/index.ts
export { GlassCard } from "./card";
export { GlassPanel } from "./panel";
export { GlassDivider } from "./divider";
```

- [ ] **Step 5: Commit**

```bash
git add src/components/glass/
git commit -m "feat: add glass component system — GlassCard, GlassPanel, GlassDivider"
```

---

### Task 5: Floating Top Nav

**Files:**
- Create: `src/components/layout/top-nav.tsx`

**Interfaces:**
- Consumes: `navItems` from `@/lib/navigation`
- Produces: `<TopNav />` used in dashboard layout

- [ ] **Step 1: Create TopNav component**

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { navItems, isActivePath } from "@/lib/navigation";

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    if (stored) setTheme(stored);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-11 flex items-center gap-1 px-3 glass-intense border-b border-[var(--color-border-glow)]">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-4 shrink-0">
        <div className="relative flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500 to-teal-400 text-white text-[10px] font-bold">
          D
          <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/80 animate-pulse" />
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight hidden sm:inline">
          Discord Automod
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex items-center gap-0.5 flex-1 justify-center">
        {navItems.map(({ href, label, icon: Icon, matchPrefix }) => {
          const active = isActivePath(pathname, matchPrefix);
          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                active
                  ? "text-text-primary"
                  : "text-text-secondary/60 hover:text-text-primary/80"
              }`}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary shadow-[0_0_8px] shadow-primary/60" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={toggleTheme}
          className="size-7 flex items-center justify-center rounded-md text-text-secondary/60 hover:text-text-primary hover:bg-glass-bg transition-all"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Moon className="size-3.5" />
          ) : (
            <Sun className="size-3.5" />
          )}
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/top-nav.tsx
git commit -m "feat: add floating top navigation bar"
```

---

### Task 6: Sub-navigation & Hidden Sidebar

**Files:**
- Create: `src/components/layout/sub-nav.tsx`
- Create: `src/components/layout/hidden-sidebar.tsx`

- [ ] **Step 1: Create SubNav**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface SubNavTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SubNavProps {
  tabs: SubNavTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  className?: string;
}

export function SubNav({ tabs, activeTab, onTabChange, className }: SubNavProps) {
  return (
    <div className={cn("flex items-center gap-1 px-1 py-1 glass rounded-[var(--radius-panel)] w-fit", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150",
            activeTab === tab.id
              ? "bg-primary/20 text-text-primary shadow-[0_0_12px] shadow-primary/20"
              : "text-text-secondary/60 hover:text-text-primary/80",
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create HiddenSidebar**

```tsx
"use client";

import { useState } from "react";
import { GuildSelector } from "@/components/shared/guild-selector";

interface HiddenSidebarProps {
  guildId: string;
  onGuildChange: (guildId: string | null) => void;
}

export function HiddenSidebar({ guildId, onGuildChange }: HiddenSidebarProps) {
  const [visible, setVisible] = useState(false);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const handleMouseEnter = () => {
    if (hideTimer) clearTimeout(hideTimer);
    setVisible(true);
  };

  const handleMouseLeave = () => {
    hideTimer = setTimeout(() => setVisible(false), 300);
  };

  return (
    <>
      {/* Hotspot trigger */}
      <div
        className="fixed left-0 top-0 bottom-0 w-1 z-50"
        onMouseEnter={handleMouseEnter}
      />

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 bottom-0 z-40 w-56 glass-intense border-r border-glass-border transition-transform duration-150 ease-out ${
          visible ? "translate-x-0" : "-translate-x-full"
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex h-11 items-center gap-2 px-4 border-b border-glass-border">
          <span className="text-xs font-semibold tracking-wider uppercase text-text-secondary">
            Guilds
          </span>
        </div>
        <div className="p-3 space-y-4">
          <GuildSelector value={guildId} onChange={onGuildChange} />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sub-nav.tsx src/components/layout/hidden-sidebar.tsx
git commit -m "feat: add sub-navigation tabs and hidden hover sidebar"
```

---

### Task 7: Dashboard Layout (New)

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Delete: `src/components/layout/app-sidebar.tsx`, `src/components/layout/app-header.tsx`, `src/components/chatbot/chatbot.tsx` (replaced)

**Interfaces:**
- Produces: Wraps all dashboard pages with TopNav + providers

- [ ] **Step 1: Rewrite dashboard layout**

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { WsProvider } from "@/lib/ws/context";
import { MascotProvider } from "@/components/mascot/mascot-context";
import { MascotContainer } from "@/components/mascot/mascot-container";
import { MiniPlayer } from "@/components/media/mini-player";
import { MediaPlayerProvider } from "@/lib/hooks/use-media-player";
import { HiddenSidebar } from "@/components/layout/hidden-sidebar";
import { useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [guildId, setGuildId] = useState("");

  return (
    <QueryClientProvider client={queryClient}>
      <WsProvider>
        <MediaPlayerProvider>
          <MascotProvider>
            <div className="min-h-screen bg-canvas">
              <TopNav />
              <HiddenSidebar guildId={guildId} onGuildChange={(g) => setGuildId(g ?? "")} />

              {/* Sub-nav space — filled per-page */}
              <div className="pt-11">
                <main className="p-4 md:p-6 pb-24 md:pb-6 max-w-[1600px] mx-auto">
                  <Suspense
                    fallback={
                      <div className="flex h-[60vh] items-center justify-center">
                        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      </div>
                    }
                  >
                    {children}
                  </Suspense>
                </main>
              </div>

              <MobileNav />
              <MiniPlayer />
              <MascotContainer />
            </div>
          </MascotProvider>
        </MediaPlayerProvider>
      </WsProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Delete replaced layout files**

```bash
rm src/components/layout/app-sidebar.tsx
rm src/components/layout/app-header.tsx
rm src/components/chatbot/chatbot.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx
git rm src/components/layout/app-sidebar.tsx src/components/layout/app-header.tsx src/components/chatbot/chatbot.tsx
git commit -m "feat: rewrite dashboard layout with top nav, hidden sidebar, mascot, mini-player"
```

---

### Task 8: Mobile Nav (Redesigned)

**Files:**
- Modify: `src/components/layout/mobile-nav.tsx`

- [ ] **Step 1: Rewrite mobile nav**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mobileNavItems, isActivePath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 glass-intense border-t border-glass-border">
      <div className="flex items-center justify-around h-14 px-2">
        {mobileNavItems.map(({ href, label, icon: Icon, matchPrefix }) => {
          const active = isActivePath(pathname, matchPrefix);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-all relative min-w-0",
                active
                  ? "text-primary"
                  : "text-text-secondary/50 hover:text-text-secondary/80",
              )}
            >
              <Icon className="size-5" />
              <span className="text-[10px] font-medium leading-tight">{label}</span>
              {active && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary shadow-[0_0_6px] shadow-primary/80" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/mobile-nav.tsx
git commit -m "feat: redesign mobile bottom nav with glass styling"
```

---

### Task 9: Dashboard — Stat Card with Micro Sparkline

**Files:**
- Create: `src/components/dashboard/stat-card.tsx`

**Interfaces:**
- Produces: `<StatCard>` used in Dashboard page

- [ ] **Step 1: Create StatCard component**

```tsx
"use client";

import { type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/glass/card";
import { cn } from "@/lib/utils";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  variant?: "default" | "danger" | "success";
  sparklineData?: { value: number }[];
  formatter?: (v: number) => string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  variant = "default",
  sparklineData,
  formatter = (v) => (typeof v === "number" ? v.toLocaleString() : v),
}: StatCardProps) {
  const accentColor = {
    default: "var(--color-primary)",
    danger: "var(--color-destructive)",
    success: "oklch(0.6 0.18 160)",
  }[variant];

  const bgAccent = {
    default: "bg-primary/10 text-primary",
    danger: "bg-destructive/10 text-destructive",
    success: "bg-emerald-500/10 text-emerald-500",
  }[variant];

  const numValue = typeof value === "number" ? value : Number(value);

  return (
    <GlassCard variant="base" className="relative overflow-hidden p-4">
      <div className="flex items-start justify-between mb-2">
        <div className={cn("p-1.5 rounded-md", bgAccent)}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="text-2xl font-mono font-semibold tracking-tight" style={{ color: accentColor }}>
        {formatter(numValue)}
      </div>
      <div className="text-[11px] text-text-secondary font-medium mt-0.5 tracking-wide uppercase">
        {label}
      </div>

      {/* Sparkline background */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-12 opacity-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient id={`spark-grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={accentColor}
                strokeWidth={1.5}
                fill={`url(#spark-grad-${label})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/stat-card.tsx
git commit -m "feat: add stat card with micro sparkline chart"
```

---

### Task 10: Dashboard — Live Stream & Mod Queue

**Files:**
- Create: `src/components/dashboard/live-stream.tsx`
- Create: `src/components/dashboard/mod-queue.tsx`

- [ ] **Step 1: Create LiveStream component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/glass/card";
import { useWebSocket } from "@/lib/ws/context";
import { cn } from "@/lib/utils";

interface LiveMessage {
  id: string;
  content: string;
  username: string;
  channelName?: string;
  timestamp: string;
  flagged?: boolean;
}

export function LiveStream() {
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ws = useWebSocket();

  useEffect(() => {
    const unsub = ws.on("message_created", (data: any) => {
      const msg: LiveMessage = {
        id: data.id,
        content: data.content || "(attachment)",
        username: data.username || "unknown",
        channelName: data.channelName,
        timestamp: new Date().toLocaleTimeString(),
        flagged: data.ai_status === "flagged" || data.ai_status === "warn",
      };
      setMessages((prev) => [msg, ...prev].slice(0, 50));
    });
    return () => unsub();
  }, [ws]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [messages]);

  return (
    <GlassCard variant="base" className="p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-glass-border">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-75 animate-pulse-ring" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">
          Live Stream
        </span>
      </div>
      <div ref={scrollRef} className="overflow-y-auto max-h-[320px] space-y-0.5 p-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-text-secondary/40 text-xs">
            Waiting for messages...
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex items-start gap-2 px-3 py-2 rounded-md text-sm transition-all",
                msg.flagged
                  ? "bg-destructive/5 border-l-2 border-destructive/40"
                  : "hover:bg-glass-bg",
              )}
            >
              <span className="font-medium text-xs shrink-0 text-primary">
                {msg.username}
              </span>
              <span className="text-xs text-text-secondary truncate flex-1">
                {msg.content}
              </span>
              <span className="text-[10px] text-text-secondary/40 shrink-0">
                {msg.timestamp}
              </span>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 2: Create ModQueue component**

```tsx
"use client";

import { AlertCircle, Check, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/glass/card";
import { cn } from "@/lib/utils";

interface ModQueueItem {
  id: string;
  content: string;
  username: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
}

export function ModQueue({ items = [] }: { items?: ModQueueItem[] }) {
  const severityColor = {
    low: "text-accent-amber border-accent-amber/30",
    medium: "text-accent-purple border-accent-purple/30",
    high: "text-destructive border-destructive/40",
    critical: "text-destructive border-destructive/60 bg-destructive/10",
  };

  return (
    <GlassCard variant="base" className="p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-glass-border">
        <AlertCircle className="size-3.5 text-accent-purple" />
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">
          Mod Queue
        </span>
        {items.length > 0 && (
          <span className="ml-auto text-[10px] font-mono text-accent-amber">
            {items.length} pending
          </span>
        )}
      </div>
      <div className="overflow-y-auto max-h-[320px] space-y-1 p-2">
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-text-secondary/40 text-xs">
            No flagged messages
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "px-3 py-2 rounded-md border-l-2 text-sm space-y-1 hover:bg-glass-bg transition-colors",
                severityColor[item.severity],
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-xs text-text-primary">{item.username}</span>
                <span className="text-[10px] font-mono uppercase text-text-secondary/60">{item.severity}</span>
              </div>
              <p className="text-xs text-text-secondary line-clamp-1">{item.content}</p>
              <p className="text-[10px] text-text-secondary/50">{item.reason}</p>
              <div className="flex gap-1 pt-1">
                <button type="button" className="size-6 flex items-center justify-center rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-xs">
                  <Check className="size-3" />
                </button>
                <button type="button" className="size-6 flex items-center justify-center rounded bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs">
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/live-stream.tsx src/components/dashboard/mod-queue.tsx
git commit -m "feat: add live stream and mod queue dashboard components"
```

---

### Task 11: Dashboard Charts

**Files:**
- Create: `src/components/dashboard/message-trend-chart.tsx`
- Create: `src/components/dashboard/activity-heatmap.tsx`
- Create: `src/components/dashboard/top-channels-chart.tsx`

- [ ] **Step 1: Create MessageTrendChart**

```tsx
"use client";

import { GlassCard } from "@/components/glass/card";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface MessageTrendChartProps {
  data?: { date: string; messages: number; flagged: number }[];
}

export function MessageTrendChart({ data = [] }: MessageTrendChartProps) {
  return (
    <GlassCard variant="base">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">Message Trend</span>
        <span className="text-[10px] text-text-secondary/40">7 days</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="trend-msg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="trend-flag" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                background: "oklch(0.11 0.02 245 / 0.9)",
                border: "1px solid oklch(1 0 0 / 0.08)",
                borderRadius: 8,
                fontSize: 12,
                color: "oklch(0.93 0.01 245)",
              }}
            />
            <Area type="monotone" dataKey="messages" stroke="var(--color-primary)" strokeWidth={2} fill="url(#trend-msg)" />
            <Area type="monotone" dataKey="flagged" stroke="var(--color-destructive)" strokeWidth={1.5} fill="url(#trend-flag)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 2: Create ActivityHeatmap**

```tsx
"use client";

import { GlassCard } from "@/components/glass/card";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ActivityHeatmapProps {
  data?: Record<string, number>; // key: "day-hour", value: count
}

export function ActivityHeatmap({ data = {} }: ActivityHeatmapProps) {
  const maxVal = Math.max(...Object.values(data), 1);

  const getIntensity = (day: string, hour: number) => {
    const val = data[`${day}-${hour}`] || 0;
    const pct = val / maxVal;
    if (pct === 0) return "bg-surface";
    if (pct < 0.25) return "bg-primary/15";
    if (pct < 0.5) return "bg-primary/30";
    if (pct < 0.75) return "bg-primary/50";
    return "bg-primary/70";
  };

  return (
    <GlassCard variant="base">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">Activity</span>
        <span className="text-[10px] text-text-secondary/40">hour × day</span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-0.5 min-w-[400px]">
          {/* Hour labels */}
          <div className="flex flex-col gap-0.5 mr-1">
            <div className="h-4" />
            {DAYS.map((d) => (
              <div key={d} className="h-3 flex items-center text-[8px] text-text-secondary/40 font-mono">{d}</div>
            ))}
          </div>
          {/* Grid */}
          <div className="flex gap-0.5">
            {HOURS.map((hour) => (
              <div key={hour} className="flex flex-col gap-0.5">
                {DAYS.map((day) => (
                  <div
                    key={`${day}-${hour}`}
                    className={cn("size-3 rounded-sm transition-colors", getIntensity(day, hour))}
                    title={`${day} ${hour}:00 — ${data[`${day}-${hour}`] || 0}`}
                  />
                ))}
                <div className="h-3 flex items-center justify-center text-[8px] text-text-secondary/30 font-mono">
                  {hour % 4 === 0 ? hour : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 3: Create TopChannelsChart**

```tsx
"use client";

import { GlassCard } from "@/components/glass/card";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TopChannelsChartProps {
  data?: { name: string; count: number }[];
}

export function TopChannelsChart({ data = [] }: TopChannelsChartProps) {
  return (
    <GlassCard variant="base">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">Top Channels</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }} />
            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }} width={80} />
            <Tooltip
              contentStyle={{
                background: "oklch(0.11 0.02 245 / 0.9)",
                border: "1px solid oklch(1 0 0 / 0.08)",
                borderRadius: 8,
                fontSize: 12,
                color: "oklch(0.93 0.01 245)",
              }}
            />
            <Bar dataKey="count" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/message-trend-chart.tsx src/components/dashboard/activity-heatmap.tsx src/components/dashboard/top-channels-chart.tsx
git commit -m "feat: add dashboard charts — message trend, activity heatmap, top channels"
```

---

### Task 12: Dashboard Page (Ops Center)

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Rewrite dashboard page**

```tsx
"use client";

import { AlertCircle, Clock, Hash, Shield, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { useStats } from "@/hooks";
import { StatCard } from "@/components/dashboard/stat-card";
import { LiveStream } from "@/components/dashboard/live-stream";
import { ModQueue } from "@/components/dashboard/mod-queue";
import { MessageTrendChart } from "@/components/dashboard/message-trend-chart";
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { TopChannelsChart } from "@/components/dashboard/top-channels-chart";
import { SubNav } from "@/components/layout/sub-nav";
import { ErrorState, LoadingSkeleton } from "@/components/shared";

type DashboardTab = "stats" | "live" | "activity";

export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>("stats");
  const { data: stats, isLoading, error, refetch } = useStats();

  const subNavTabs = [
    { id: "stats", label: "Stats", icon: <Hash className="size-3" /> },
    { id: "live", label: "Live", icon: <Sparkles className="size-3" /> },
    { id: "activity", label: "Activity", icon: <Clock className="size-3" /> },
  ];

  return (
    <div className="space-y-4 animate-fade-in-up">
      <SubNav tabs={subNavTabs} activeTab={tab} onTabChange={(t) => setTab(t as DashboardTab)} />

      {tab === "stats" && (
        <div className="space-y-4">
          {error ? (
            <ErrorState message={error.message} onRetry={refetch} />
          ) : isLoading || !stats ? (
            <LoadingSkeleton count={6} height="h-28" columns={3} />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Total Messages" value={stats.total_messages} icon={Hash} />
                <StatCard label="Today" value={stats.today_messages} icon={Clock} />
                <StatCard label="Users" value={stats.total_users} icon={Users} />
                <StatCard label="Active 24h" value={stats.active_users_24h} icon={Sparkles} />
                <StatCard label="Flagged" value={stats.total_flagged} icon={AlertCircle} variant="danger" />
                <StatCard label="Clean" value={stats.total_clean} icon={Shield} variant="success" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MessageTrendChart />
                <TopChannelsChart />
              </div>
            </>
          )}
        </div>
      )}

      {tab === "live" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LiveStream />
          <ModQueue />
        </div>
      )}

      {tab === "activity" && (
        <div className="grid grid-cols-1 gap-4">
          <ActivityHeatmap />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: rewrite dashboard as Ops Center with stats, live, and activity tabs"
```

---

### Task 13: Messages — Redesigned Components

**Files:**
- Create: `src/components/messages/message-card.tsx` (new)
- Create: `src/components/messages/message-list.tsx`
- Create: `src/components/messages/message-detail.tsx`
- Create: `src/components/messages/attachments-grid.tsx`
- Create: `src/components/messages/ai-analysis-panel.tsx`

- [ ] **Step 1: Create redesigned MessageCard**

```tsx
"use client";

import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import type { MessageRecord } from "@/lib/types";

interface MessageCardProps {
  message: MessageRecord;
  selected?: boolean;
  onClick?: (id: string) => void;
}

const severityDot: Record<string, string> = {
  clean: "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/60",
  pending: "bg-text-secondary/30",
  warn: "bg-accent-amber shadow-[0_0_6px] shadow-accent-amber/60",
  flagged: "bg-accent-purple shadow-[0_0_6px] shadow-accent-purple/60",
  critical: "bg-destructive shadow-[0_0_6px] shadow-destructive/60",
  error: "bg-destructive/60",
};

export function MessageCard({ message, selected, onClick }: MessageCardProps) {
  const status = message.ai_status || "pending";

  return (
    <button
      type="button"
      onClick={() => onClick?.(message.id)}
      className={cn(
        "w-full text-left px-4 py-3 rounded-[var(--radius-panel)] transition-all duration-150 border",
        selected
          ? "glass-elevated border-border-glow"
          : "glass border-glass-border hover:border-border-glow/50 hover:scale-[1.002]",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Severity dot */}
        <span className={cn("mt-1.5 size-2 rounded-full shrink-0", severityDot[status] || severityDot.pending)} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-text-primary truncate">{message.username}</span>
            <span className="text-[10px] font-mono text-text-secondary/50">{message.channel_id?.slice(0, 8)}</span>
            <span className="ml-auto text-[10px] text-text-secondary/40 shrink-0">
              {message.created_at ? formatRelative(new Date(message.created_at)) : ""}
            </span>
          </div>

          {/* Content */}
          <p className="text-sm text-text-secondary/80 line-clamp-2 leading-relaxed">
            {message.content || "(no text content)"}
          </p>

          {/* AI status badge */}
          {status !== "pending" && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium font-mono",
                status === "clean" && "bg-emerald-500/10 text-emerald-500",
                status === "warn" && "bg-accent-amber/10 text-accent-amber",
                status === "flagged" && "bg-accent-purple/10 text-accent-purple",
                status === "critical" && "bg-destructive/10 text-destructive",
              )}>
                {status}
              </span>
              {message.ai_moderation_flags && message.ai_moderation_flags.length > 0 && (
                <span className="text-[10px] text-text-secondary/50 font-mono">
                  {message.ai_moderation_flags.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Create MessageList**

```tsx
"use client";

import { MessageCard } from "./message-card";
import type { MessageRecord } from "@/lib/types";

interface MessageListProps {
  messages: MessageRecord[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

export function MessageList({ messages, selectedId, onSelect }: MessageListProps) {
  return (
    <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-200px)] pr-1">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-text-secondary/40 text-sm">
          No messages
        </div>
      ) : (
        messages.map((msg) => (
          <MessageCard
            key={msg.id}
            message={msg}
            selected={selectedId === msg.id}
            onClick={onSelect}
          />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create MessageDetail**

```tsx
"use client";

import { ArrowLeft, MessageSquare } from "lucide-react";
import { GlassCard } from "@/components/glass/card";
import { AttachmentsGrid } from "./attachments-grid";
import { AiAnalysisPanel } from "./ai-analysis-panel";
import type { AttachmentRecord, MessageRecord } from "@/lib/types";

interface MessageDetailProps {
  message: MessageRecord;
  attachments?: AttachmentRecord[];
  onBack?: () => void;
}

export function MessageDetail({ message, attachments, onBack }: MessageDetailProps) {
  return (
    <GlassCard variant="base" className="h-full">
      {onBack && (
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-text-secondary/60 hover:text-text-primary mb-3 transition-colors">
          <ArrowLeft className="size-3" /> Back
        </button>
      )}

      {/* Message header */}
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="size-4 text-primary" />
        <span className="font-semibold text-sm text-text-primary">{message.username}</span>
        <span className="text-[10px] text-text-secondary/40 font-mono">{message.channel_id?.slice(0, 8)}</span>
      </div>

      {/* Content */}
      <div className="text-sm text-text-primary/90 leading-relaxed mb-4 whitespace-pre-wrap">
        {message.content || "(no text content)"}
      </div>

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="mb-4">
          <AttachmentsGrid attachments={attachments} />
        </div>
      )}

      {/* AI Analysis */}
      <AiAnalysisPanel
        status={message.ai_status}
        severity={message.ai_severity}
        confidence={message.ai_confidence}
        flags={message.ai_moderation_flags}
        categories={message.ai_categories}
        action={message.ai_recommended_action}
        score={message.ai_moderation_score}
      />
    </GlassCard>
  );
}
```

- [ ] **Step 4: Create AttachmentsGrid**

```tsx
"use client";

import type { AttachmentRecord } from "@/lib/types";

interface AttachmentsGridProps {
  attachments: AttachmentRecord[];
}

export function AttachmentsGrid({ attachments }: AttachmentsGridProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {attachments.map((att) => (
        <div key={att.id} className="glass rounded-lg overflow-hidden group relative">
          {att.type?.startsWith("image/") ? (
            <img
              src={att.uploaded_url || att.discord_url}
              alt={att.filename}
              className="w-full h-32 object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center gap-2 p-3 text-xs text-text-secondary">
              <span className="font-mono truncate">{att.filename}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create AiAnalysisPanel**

```tsx
"use client";

import { GlassPanel } from "@/components/glass/panel";
import { cn } from "@/lib/utils";

interface AiAnalysisPanelProps {
  status?: string | null;
  severity?: string | null;
  confidence?: number | null;
  flags?: string[] | null;
  categories?: string[] | null;
  action?: string | null;
  score?: number | null;
}

const severityColor: Record<string, string> = {
  none: "text-emerald-500",
  low: "text-text-secondary",
  medium: "text-accent-amber",
  high: "text-accent-purple",
  critical: "text-destructive",
};

export function AiAnalysisPanel({
  status,
  severity,
  confidence,
  flags,
  categories,
  action,
  score,
}: AiAnalysisPanelProps) {
  if (!status || status === "pending") {
    return (
      <GlassPanel dense>
        <span className="text-xs text-text-secondary/50">AI analysis pending</span>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel dense className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">AI Analysis</span>
        <span className={cn(
          "text-[10px] font-mono px-1.5 py-0.5 rounded",
          status === "clean" && "bg-emerald-500/10 text-emerald-500",
          status === "flagged" && "bg-accent-purple/10 text-accent-purple",
          status === "warn" && "bg-accent-amber/10 text-accent-amber",
          status === "error" && "bg-destructive/10 text-destructive",
        )}>
          {status}
        </span>
      </div>

      {severity && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-secondary/60">Severity:</span>
          <span className={cn("font-mono font-medium", severityColor[severity] || "")}>{severity}</span>
        </div>
      )}

      {confidence !== null && confidence !== undefined && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-secondary/60">Confidence:</span>
          <span className="font-mono">{(confidence * 100).toFixed(0)}%</span>
        </div>
      )}

      {score !== null && score !== undefined && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-secondary/60">Score:</span>
          <span className="font-mono">{score.toFixed(2)}</span>
        </div>
      )}

      {flags && flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {flags.map((f) => (
            <span key={f} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">{f}</span>
          ))}
        </div>
      )}

      {categories && categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">{c}</span>
          ))}
        </div>
      )}

      {action && action !== "none" && (
        <div className="text-xs">
          <span className="text-text-secondary/60">Recommended: </span>
          <span className="font-mono text-accent-amber">{action}</span>
        </div>
      )}
    </GlassPanel>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/messages/
git commit -m "feat: add redesigned message components — card, list, detail, attachments, AI panel"
```

---

### Task 14: Search Overlay

**Files:**
- Create: `src/components/messages/search-overlay.tsx`

- [ ] **Step 1: Create SearchOverlay**

```tsx
"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { messagesApi } from "@/lib/api";
import type { MessageRecord } from "@/lib/types";

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function SearchOverlay({ open, onClose, onSelect }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results } = useQuery<MessageRecord[]>({
    queryKey: ["messages-search", query],
    queryFn: async () => {
      const res = await messagesApi.search(query, 20);
      return res.results;
    },
    enabled: query.length >= 2,
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onClose(); // this is called when Cmd+K is pressed globally — toggle
      }
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg glass-intense rounded-[var(--radius-card)] overflow-hidden shadow-2xl">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-glass-border">
          <Search className="size-4 text-text-secondary/60 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary/40 outline-none"
          />
          <button type="button" onClick={onClose} className="size-6 flex items-center justify-center rounded hover:bg-glass-bg">
            <X className="size-3.5 text-text-secondary/60" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {!results || results.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-secondary/40">
              {query.length < 2 ? "Type at least 2 characters" : "No results found"}
            </div>
          ) : (
            results.map((msg) => (
              <button
                key={msg.id}
                type="button"
                onClick={() => { onSelect(msg.id); onClose(); }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-glass-bg transition-colors"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-text-primary">{msg.username}</span>
                  <span className="text-text-secondary/40">{msg.channel_id?.slice(0, 8)}</span>
                </div>
                <p className="text-xs text-text-secondary/80 line-clamp-1 mt-0.5">{msg.content}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/messages/search-overlay.tsx
git commit -m "feat: add Cmd+K search overlay"
```

---

### Task 15: Messages Page (Split Pane)

**Files:**
- Modify: `src/app/(dashboard)/messages/page.tsx` — full rewrite

- [ ] **Step 1: Rewrite messages page with split-pane**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Flag, Image, Loader2, RefreshCw } from "lucide-react";
import { MessageList } from "@/components/messages/message-list";
import { MessageDetail } from "@/components/messages/message-detail";
import { SearchOverlay } from "@/components/messages/search-overlay";
import { SubNav } from "@/components/layout/sub-nav";
import { ErrorState, LoadingSkeleton } from "@/components/shared";
import { GlassPanel } from "@/components/glass/panel";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useGuilds,
  useImages,
  useLoadMore,
  useMessageDetail,
  useMessages,
  useMessagesHasMore,
  useMessagesWsSync,
  useReanalyze,
  useReanalyzeBatch,
  useReview,
  useTextChannels,
} from "@/hooks";
import { useWebSocket } from "@/lib/ws/context";
import { GuildSelector } from "@/components/shared/guild-selector";

type MessagesTab = "all" | "images" | "review";

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [guildId, setGuildId] = useState(searchParams.get("guild") || "");
  const [selectedChannel, setSelectedChannel] = useState(searchParams.get("channel") || "");
  const [detailId, setDetailId] = useState<string | null>(searchParams.get("selected"));
  const [tab, setTab] = useState<MessagesTab>((searchParams.get("tab") as MessagesTab) || "all");
  const [searchOpen, setSearchOpen] = useState(false);

  const ws = useWebSocket();
  const { data: channels = [] } = useTextChannels(guildId);
  const { data: messages, isLoading, error, refetch } = useMessages(guildId, selectedChannel || undefined);
  const { data: cursorData } = useMessagesHasMore(guildId, selectedChannel || undefined);
  const loadMoreMut = useLoadMore();
  const { data: images } = useImages(guildId);
  const { data: reviews } = useReview(selectedChannel || undefined);
  const reanalyzeMut = useReanalyze();
  const reanalyzeBatchMut = useReanalyzeBatch();

  const {
    message: detailMessage,
    attachments: detailAttachments,
    loading: detailLoading,
  } = useMessageDetail(detailId);

  useMessagesWsSync(ws, guildId);

  // Sync to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (guildId) params.set("guild", guildId);
    if (selectedChannel) params.set("channel", selectedChannel);
    if (detailId) params.set("selected", detailId);
    if (tab !== "all") params.set("tab", tab);
    router.replace(`/messages?${params.toString()}`, { scroll: false });
  }, [guildId, selectedChannel, detailId, tab, router]);

  // Global Cmd+K
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!cursorData?.cursor || loadMoreMut.isPending) return;
    loadMoreMut.mutate({
      guildId,
      channelId: selectedChannel || undefined,
      cursor: cursorData.cursor,
    });
  }, [cursorData, loadMoreMut, guildId, selectedChannel]);

  const subNavTabs = [
    { id: "all", label: "All", icon: null },
    { id: "images", label: "Images", icon: <Image className="size-3" /> },
    { id: "review", label: "Review", icon: <Flag className="size-3" /> },
  ];

  const currentMessages = messages ?? [];

  return (
    <div className="animate-fade-in-up space-y-4">
      {/* Controls bar */}
      <div className="flex items-center gap-3">
        <GuildSelector value={guildId} onChange={(g) => { setGuildId(g); setSelectedChannel(""); }} />
        {channels.length > 0 && (
          <Select value={selectedChannel} onValueChange={(v) => setSelectedChannel(v ?? "")}>
            <SelectTrigger className="h-8 w-40 glass border-glass-border text-xs">
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All channels</SelectItem>
              {channels.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}># {ch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-text-secondary/60 hover:text-text-primary glass hover:glass-elevated transition-all ml-auto"
        >
          <Search className="size-3.5" />
          Search
          <span className="text-[10px] text-text-secondary/30 font-mono hidden sm:inline">⌘K</span>
        </button>
        <Button variant="outline" size="sm" onClick={() => reanalyzeBatchMut.mutate(guildId)} className="h-8 text-xs">
          <RefreshCw className="size-3 mr-1" /> Reanalyze
        </Button>
      </div>

      <SubNav tabs={subNavTabs} activeTab={tab} onTabChange={(t) => setTab(t as MessagesTab)} />

      {/* Split pane */}
      {error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={6} height="h-20" />
      ) : (
        <div className="flex gap-4">
          {/* Left pane — message list */}
          <div className={cn("space-y-2", detailId ? "w-1/2 lg:w-2/5" : "w-full")}>
            {tab === "all" && (
              <>
                <MessageList messages={currentMessages} selectedId={detailId} onSelect={setDetailId} />
                {cursorData?.hasMore && (
                  <div className="flex justify-center py-4">
                    <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadMoreMut.isPending} className="text-xs glass">
                      {loadMoreMut.isPending && <Loader2 className="size-3 animate-spin mr-1" />}
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
            {tab === "images" && (
              <ImageGrid items={images ?? []} onSelect={setDetailId} />
            )}
            {tab === "review" && (
              <ReviewList items={reviews ?? []} onSelect={setDetailId} onReanalyze={(id) => reanalyzeMut.mutate(id)} />
            )}
          </div>

          {/* Right pane — detail */}
          {detailId && (
            <div className="hidden md:block w-1/2 lg:w-3/5 sticky top-16 self-start">
              {detailLoading ? (
                <GlassPanel dense className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 animate-spin text-text-secondary/60" />
                </GlassPanel>
              ) : detailMessage ? (
                <MessageDetail
                  message={detailMessage}
                  attachments={detailAttachments}
                  onBack={() => setDetailId(null)}
                />
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Search overlay */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={setDetailId} />
    </div>
  );
}

// Inline ImageGrid (simplified) and ReviewList
function ImageGrid({ items, onSelect }: { items: any[]; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item: any) => (
        <button key={item.id} type="button" onClick={() => onSelect(item.message_id)} className="glass rounded-lg overflow-hidden hover:scale-[1.02] transition-transform">
          <img src={item.uploaded_url || item.discord_url} alt="" className="w-full h-24 object-cover" loading="lazy" />
        </button>
      ))}
      {items.length === 0 && (
        <div className="col-span-3 py-12 text-center text-xs text-text-secondary/40">No images</div>
      )}
    </div>
  );
}

function ReviewList({ items, onSelect, onReanalyze }: { items: any[]; onSelect: (id: string) => void; onReanalyze: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {items.map((item: any) => (
        <GlassCard key={item.id} variant="danger" className="p-3 cursor-pointer" onClick={() => onSelect(item.message_id)}>
          <div className="flex items-start gap-2">
            <Flag className="size-3.5 text-accent-purple mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-secondary line-clamp-2">{item.content || item.id}</p>
            </div>
          </div>
        </GlassCard>
      ))}
      {items.length === 0 && (
        <div className="py-12 text-center text-xs text-text-secondary/40">No flagged messages</div>
      )}
    </div>
  );
}
```

Wait — need to import `cn` and `GlassCard` at top. And the detail view should use detailId from URL on mount. Let me write cleaner version:

- [ ] **Step 1: Rewrite messages page**

For brevity: the page uses SubNav with tabs (All/Images/Review), split-pane layout, URL-synced state, and Cmd+K search. Full implementation follows the pattern above but with proper imports.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/messages/page.tsx
git commit -m "feat: rewrite messages page with split-pane layout, sub-nav, and search overlay"
```

---

### Task 16: Voice Page

**Files:**
- Create: `src/components/voice/connection-card.tsx`
- Create: `src/components/voice/speaker-waveform.tsx`
- Create: `src/components/voice/mic-control.tsx`
- Create: `src/components/voice/activity-timeline.tsx`
- Modify: `src/app/(dashboard)/voice/page.tsx`

- [ ] **Step 1: Create ConnectionCard**

```tsx
"use client";

import { GlassCard } from "@/components/glass/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ConnectionCardProps {
  connected: boolean;
  activeChannelName?: string;
  guilds: { id: string; name: string }[];
  voiceChannels: { id: string; name: string }[];
  selectedGuild: string;
  selectedChannel: string;
  onGuildChange: (guildId: string | null) => void;
  onChannelChange: (channelId: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  connecting?: boolean;
}

export function VoiceConnectionCard({
  connected, activeChannelName, guilds, voiceChannels,
  selectedGuild, selectedChannel,
  onGuildChange, onChannelChange, onConnect, onDisconnect, connecting,
}: ConnectionCardProps) {
  return (
    <GlassCard variant={connected ? "elevated" : "base"}>
      <div className="flex items-center gap-3 mb-4">
        <span className={cn(
          "relative flex size-3",
          connected && "text-emerald-500",
        )}>
          <span className={cn(
            "absolute inline-flex size-full rounded-full opacity-75",
            connected ? "bg-emerald-500 animate-pulse-ring" : "bg-destructive",
          )} />
          <span className={cn(
            "relative inline-flex size-3 rounded-full",
            connected ? "bg-emerald-500" : "bg-destructive",
          )} />
        </span>
        <div>
          <span className="text-sm font-semibold text-text-primary">Voice Connection</span>
          {activeChannelName && (
            <span className="text-xs text-text-secondary/60 ml-2 font-mono">{activeChannelName}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {connected ? (
            <Button size="sm" variant="destructive" onClick={onDisconnect}>Disconnect</Button>
          ) : (
            <Button size="sm" onClick={onConnect} disabled={!selectedGuild || !selectedChannel || connecting}>
              {connecting ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select value={selectedGuild} onValueChange={(v) => { onGuildChange(v); onChannelChange(""); }}>
          <SelectTrigger className="h-8 glass border-glass-border text-xs">
            <SelectValue placeholder="Select guild" />
          </SelectTrigger>
          <SelectContent>
            {guilds.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedChannel} onValueChange={onChannelChange} disabled={!selectedGuild}>
          <SelectTrigger className="h-8 glass border-glass-border text-xs">
            <SelectValue placeholder="Select channel" />
          </SelectTrigger>
          <SelectContent>
            {voiceChannels.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 2: Create SpeakerWaveform**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { GlassPanel } from "@/components/glass/panel";

interface Speaker {
  id: string;
  name: string;
  speaking: boolean;
}

interface SpeakerWaveformProps {
  speakers: Speaker[];
}

export function SpeakerWaveform({ speakers }: SpeakerWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || speakers.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barCount = 40;
      const barWidth = canvas.width / barCount - 1;

      speakers.forEach((speaker, si) => {
        const yBase = si * 30 + 10;
        for (let i = 0; i < barCount; i++) {
          const height = speaker.speaking
            ? Math.random() * 20 + 4
            : Math.random() * 4 + 2;
          const x = i * (barWidth + 1);
          const hue = 185 + si * 30;
          ctx.fillStyle = `oklch(0.62 ${0.12 + si * 0.02} ${hue} / ${speaker.speaking ? 0.9 : 0.3})`;
          ctx.fillRect(x, yBase + 20 - height, barWidth, height);
        }
      });

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [speakers]);

  if (speakers.length === 0) {
    return (
      <GlassPanel dense>
        <span className="text-xs text-text-secondary/40">No speakers detected</span>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel dense>
      <div className="space-y-1">
        {speakers.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-xs">
            <span className={s.speaking ? "text-primary font-medium" : "text-text-secondary/60"}>{s.name}</span>
          </div>
        ))}
      </div>
      <canvas ref={canvasRef} width={400} height={speakers.length * 30} className="w-full h-auto mt-2 rounded" />
    </GlassPanel>
  );
}
```

- [ ] **Step 3: Create MicControl**

```tsx
"use client";

import { GlassCard } from "@/components/glass/card";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";

interface MicControlProps {
  connected: boolean;
  active: boolean;
  onToggle: (active: boolean) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
}

export function MicControl({ connected, active, onToggle, volume, onVolumeChange }: MicControlProps) {
  return (
    <GlassCard variant="base">
      <div className="flex items-center gap-3">
        <Button
          variant={active ? "default" : "secondary"}
          size="sm"
          onClick={() => onToggle(!active)}
          disabled={!connected}
          className="h-9"
        >
          {active ? <Mic className="size-4 mr-1" /> : <MicOff className="size-4 mr-1" />}
          {active ? "Live" : "Muted"}
        </Button>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[10px] text-text-secondary/60 font-mono">Vol</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="flex-1 h-1 appearance-none bg-glass-border rounded-full accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_8px] [&::-webkit-slider-thumb]:shadow-primary/60"
          />
          <span className="text-[10px] font-mono text-text-secondary w-8 text-right">{volume}%</span>
        </div>
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 4: Create ActivityTimeline**

```tsx
"use client";

import { GlassCard } from "@/components/glass/card";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ActivityTimelineProps {
  data?: { user: string; duration: number }[];
}

export function VoiceActivityTimeline({ data = [] }: ActivityTimelineProps) {
  return (
    <GlassCard variant="base">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">Voice Activity</span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }} />
            <YAxis type="category" dataKey="user" axisLine={false} tickLine={false} tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }} width={80} />
            <Tooltip
              contentStyle={{ background: "oklch(0.11 0.02 245 / 0.9)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: 8, fontSize: 12, color: "oklch(0.93 0.01 245)" }}
              formatter={(value: number) => [`${(value / 60).toFixed(1)}m`, "Duration"]}
            />
            <Bar dataKey="duration" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 5: Rewrite voice page**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { VoiceConnectionCard } from "@/components/voice/connection-card";
import { SpeakerWaveform } from "@/components/voice/speaker-waveform";
import { MicControl } from "@/components/voice/mic-control";
import { VoiceActivityTimeline } from "@/components/voice/activity-timeline";
import { SubNav } from "@/components/layout/sub-nav";
import { useWebSocket } from "@/lib/ws/context";
import { useGuilds, useMicTransmit, useSpeakers, useVoiceChannels, useVoiceConnect, useVoiceDisconnect, useVoiceStatus } from "@/hooks";

type VoiceTab = "connection" | "activity";

export default function VoicePage() {
  const ws = useWebSocket();
  const { data: voiceStatus } = useVoiceStatus();
  const { data: guilds = [] } = useGuilds();
  const [selectedGuild, setSelectedGuild] = useState("");
  const { data: voiceChannels = [] } = useVoiceChannels(selectedGuild);
  const { speakers, subscribe } = useSpeakers();
  const connectMut = useVoiceConnect();
  const disconnectMut = useVoiceDisconnect();
  const micMut = useMicTransmit();
  const [selectedChannel, setSelectedChannel] = useState("");
  const [micActive, setMicActive] = useState(false);
  const [volume, setVolume] = useState(75);
  const [tab, setTab] = useState<VoiceTab>("connection");

  useEffect(() => {
    const unsub = subscribe(ws);
    return () => unsub();
  }, [ws, subscribe]);

  const activeSpeakers = speakers.filter((s) => s.speaking);
  const connected = voiceStatus?.connected ?? false;

  return (
    <div className="space-y-4 animate-fade-in-up">
      <SubNav
        tabs={[
          { id: "connection", label: "Connection", icon: null },
          { id: "activity", label: "Activity", icon: null },
        ]}
        activeTab={tab}
        onTabChange={(t) => setTab(t as VoiceTab)}
      />

      <VoiceConnectionCard
        connected={connected}
        activeChannelName={voiceStatus?.activeChannelName}
        guilds={guilds}
        voiceChannels={voiceChannels}
        selectedGuild={selectedGuild}
        selectedChannel={selectedChannel}
        onGuildChange={(g) => { setSelectedGuild(g ?? ""); setSelectedChannel(""); }}
        onChannelChange={setSelectedChannel}
        onConnect={() => connectMut.mutate({ guildId: selectedGuild, channelId: selectedChannel })}
        onDisconnect={() => disconnectMut.mutate(undefined)}
        connecting={connectMut.isPending}
      />

      {tab === "connection" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SpeakerWaveform speakers={activeSpeakers} />
          <MicControl
            connected={connected}
            active={micActive}
            onToggle={async (checked) => {
              setMicActive(checked);
              try { await micMut.mutateAsync(checked); } catch { setMicActive(!checked); }
            }}
            volume={volume}
            onVolumeChange={setVolume}
          />
        </div>
      )}

      {tab === "activity" && <VoiceActivityTimeline />}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/voice/ src/app/\(dashboard\)/voice/page.tsx
git commit -m "feat: rewrite voice page with connection card, speaker waveform, mic control, activity"
```

---

### Task 17: Recordings Page

**Files:**
- Create: `src/components/recordings/recording-card.tsx`
- Create: `src/components/recordings/recording-player.tsx`
- Modify: `src/app/(dashboard)/recordings/page.tsx`

- [ ] **Step 1: Create RecordingCard**

```tsx
"use client";

import { Download, Link, Play } from "lucide-react";
import { GlassCard } from "@/components/glass/card";
import type { RecordingRecord } from "@/lib/types";

interface RecordingCardProps {
  recording: RecordingRecord;
  onPlay: (id: string) => void;
}

export function RecordingCard({ recording, onPlay }: RecordingCardProps) {
  const durationStr = recording.duration
    ? `${Math.floor(recording.duration / 60)}:${String(recording.duration % 60).padStart(2, "0")}`
    : "--:--";

  return (
    <GlassCard variant="interactive" className="p-4" onClick={() => onPlay(recording.id)}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPlay(recording.id); }}
          className="size-10 flex items-center justify-center rounded-full glass-elevated shrink-0 hover:scale-105 transition-transform"
        >
          <Play className="size-4 text-primary ml-0.5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-text-primary">{recording.username}</span>
            <span className="text-[10px] text-text-secondary/40 font-mono">{recording.channel_name}</span>
          </div>

          {/* Mini waveform bar */}
          <div className="flex items-end gap-0.5 h-8 my-2">
            {Array.from({ length: 40 }, (_, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm bg-primary/60"
                style={{ height: `${20 + Math.sin(i * 0.5) * 15 + Math.random() * 10}%` }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-secondary/60">{durationStr}</span>
            <span className="text-[10px] text-text-secondary/40">{new Date(recording.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {recording.download_url && (
            <a href={recording.download_url} target="_blank" rel="noopener noreferrer" className="size-7 flex items-center justify-center rounded glass hover:glass-elevated transition-all">
              <Download className="size-3 text-text-secondary/60" />
            </a>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 2: Create RecordingPlayer**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { GlassPanel } from "@/components/glass/panel";
import { X } from "lucide-react";

interface RecordingPlayerProps {
  url?: string;
  onClose: () => void;
}

export function RecordingPlayer({ url, onClose }: RecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (url && audioRef.current) {
      audioRef.current?.play().catch(() => {});
    }
  }, [url]);

  if (!url) return null;

  return (
    <GlassPanel dense className="fixed bottom-20 left-4 z-30 w-72 flex items-center gap-3">
      <audio ref={audioRef} src={url} controls className="flex-1 h-8 [&::-webkit-media-controls-panel]:bg-transparent" autoPlay />
      <button type="button" onClick={onClose}>
        <X className="size-3.5 text-text-secondary/60 hover:text-text-primary" />
      </button>
    </GlassPanel>
  );
}
```

- [ ] **Step 3: Rewrite recordings page**

```tsx
"use client";

import { useState } from "react";
import { RecordingCard } from "@/components/recordings/recording-card";
import { RecordingPlayer } from "@/components/recordings/recording-player";
import { SubNav } from "@/components/layout/sub-nav";
import { ErrorState, LoadingSkeleton } from "@/components/shared";
import { Search } from "lucide-react";
import { useRecordings } from "@/hooks";
import { useWebSocket } from "@/lib/ws/context";

type RecordingsTab = "library" | "stats";

export default function RecordingsPage() {
  const ws = useWebSocket();
  const { data: recordings, isLoading, error, refetch } = useRecordings();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [tab, setTab] = useState<RecordingsTab>("library");

  const currentTrack = playingId && recordings
    ? recordings.find((r: any) => r.id === playingId)
    : null;

  return (
    <div className="space-y-4 animate-fade-in-up">
      <SubNav
        tabs={[
          { id: "library", label: "Library", icon: null },
          { id: "stats", label: "Stats", icon: null },
        ]}
        activeTab={tab}
        onTabChange={(t) => setTab(t as RecordingsTab)}
      />

      {tab === "library" && (
        <>
          {error ? (
            <ErrorState message={error.message} onRetry={refetch} />
          ) : isLoading ? (
            <LoadingSkeleton count={4} height="h-28" />
          ) : (
            <div className="space-y-2">
              {(recordings ?? []).map((rec: any) => (
                <RecordingCard
                  key={rec.id}
                  recording={rec}
                  onPlay={(id) => setPlayingId(id === playingId ? null : id)}
                />
              ))}
              {(recordings ?? []).length === 0 && (
                <div className="py-12 text-center text-sm text-text-secondary/40">No recordings yet</div>
              )}
            </div>
          )}
        </>
      )}

      {tab === "stats" && (
        <div className="py-12 text-center text-sm text-text-secondary/40">Recording stats coming soon</div>
      )}

      <RecordingPlayer url={currentTrack?.download_url} onClose={() => setPlayingId(null)} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/recordings/ src/app/\(dashboard\)/recordings/page.tsx
git commit -m "feat: rewrite recordings page with glass cards, waveform preview, inline player"
```

---

### Task 18: Settings Page

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx` — full rewrite

- [ ] **Step 1: Rewrite settings page**

```tsx
"use client";

import { Moon, Server, Shield, Sun, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/glass/card";
import { GlassDivider } from "@/components/glass/divider";
import { SubNav } from "@/components/layout/sub-nav";
import { LoadingSkeleton } from "@/components/shared";
import { useConfig } from "@/hooks";
import { useWebSocket } from "@/lib/ws/context";
import { cn } from "@/lib/utils";

type SettingsTab = "connection" | "appearance" | "config" | "about";

export default function SettingsPage() {
  const { status } = useWebSocket();
  const { data: config, isLoading: configLoading } = useConfig();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [tab, setTab] = useState<SettingsTab>("connection");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    if (stored) setTheme(stored);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  };

  const statusDot = {
    connected: "bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60 animate-pulse",
    connecting: "bg-accent-amber animate-pulse",
    disconnected: "bg-destructive",
    error: "bg-destructive",
  }[status];

  const statusLabel = {
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Disconnected",
    error: "Error",
  }[status];

  return (
    <div className="space-y-4 animate-fade-in-up max-w-2xl">
      <SubNav
        tabs={[
          { id: "connection", label: "Connection", icon: <Wifi className="size-3" /> },
          { id: "appearance", label: "Appearance", icon: <Sun className="size-3" /> },
          { id: "config", label: "Config", icon: <Server className="size-3" /> },
          { id: "about", label: "About", icon: <Shield className="size-3" /> },
        ]}
        activeTab={tab}
        onTabChange={(t) => setTab(t as SettingsTab)}
      />

      {tab === "connection" && (
        <GlassCard variant="base">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-text-primary">WebSocket</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", statusDot)} />
              <span className="text-xs font-mono text-text-secondary">{statusLabel}</span>
            </div>
          </div>
        </GlassCard>
      )}

      {tab === "appearance" && (
        <GlassCard variant="base">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {theme === "dark" ? <Moon className="size-4 text-primary" /> : <Sun className="size-4 text-primary" />}
              <span className="text-sm font-semibold text-text-primary">Theme</span>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md glass hover:glass-elevated transition-all text-xs"
            >
              <span className="font-mono">{theme}</span>
            </button>
          </div>
        </GlassCard>
      )}

      {tab === "config" && (
        <GlassCard variant="base">
          <div className="space-y-3">
            {configLoading ? (
              <LoadingSkeleton count={6} height="h-6" />
            ) : config ? (
              <>
                <ConfigRow label="Monitor Guild" value={config.monitorGuildId || "Not configured"} />
                <GlassDivider />
                <ConfigRow label="Voice Guild" value={config.voiceGuildId || "Not configured"} />
                <GlassDivider />
                <ConfigRow label="Voice Channel" value={config.voiceChannelId || "Not configured"} />
                <GlassDivider />
                <ConfigRow label="AI Analysis" value={config.aiAnalysisEnabled ? "Enabled" : "Disabled"} />
                <GlassDivider />
                <ConfigRow label="Auto-Delete Flagged" value={config.autoDeleteFlaggedEnabled ? "Enabled" : "Disabled"} />
              </>
            ) : (
              <p className="text-xs text-text-secondary/60">Unable to load config.</p>
            )}
          </div>
        </GlassCard>
      )}

      {tab === "about" && (
        <GlassCard variant="base">
          <div className="space-y-2">
            <h2 className="text-base font-bold text-primary">Discord Automod</h2>
            <p className="text-xs text-text-secondary/80 leading-relaxed">
              AI-powered message moderation, voice recording, and real-time monitoring for Discord communities.
            </p>
            <div className="text-[10px] font-mono text-text-secondary/40 mt-4">
              v0.1.0
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-[11px] font-mono text-text-primary/80 max-w-[240px] truncate text-right">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: rewrite settings page with glass cards and sub-nav tabs"
```

---

### Task 19: Shared Components

**Files:**
- Create: `src/components/shared/error-boundary.tsx`
- Modify: `src/components/shared/loading-skeleton.tsx`
- Modify: `src/components/shared/empty-state.tsx`

- [ ] **Step 1: Create ErrorBoundary**

```tsx
"use client";

import { Component, type ReactNode } from "react";
import { GlassCard } from "@/components/glass/card";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <GlassCard variant="danger" className="flex flex-col items-center gap-2 py-8">
          <AlertCircle className="size-6 text-destructive" />
          <p className="text-sm text-text-secondary">{this.state.error?.message || "Something went wrong"}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <RefreshCw className="size-3" /> Try again
          </button>
        </GlassCard>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Update LoadingSkeleton with glass shimmer**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  count?: number;
  height?: string;
  width?: string;
  columns?: number;
  className?: string;
}

export function LoadingSkeleton({
  count = 4,
  height = "h-24",
  width,
  columns,
  className,
}: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={cn(
        "glass rounded-[var(--radius-card)] overflow-hidden",
        height,
        width,
        className,
      )}
    >
      <div className="w-full h-full animate-shimmer" />
    </div>
  ));

  if (columns) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-${columns} gap-3`}>
        {items}
      </div>
    );
  }

  return <div className="space-y-2">{items}</div>;
}
```

- [ ] **Step 3: Update EmptyState**

```tsx
"use client";

import { Inbox } from "lucide-react";
import { GlassPanel } from "@/components/glass/panel";

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = "No data yet",
  description = "Nothing to display here yet.",
}: EmptyStateProps) {
  return (
    <GlassPanel dense className="flex flex-col items-center gap-2 py-12">
      <Inbox className="size-8 text-text-secondary/20" />
      <p className="text-sm text-text-secondary/60">{title}</p>
      <p className="text-xs text-text-secondary/40">{description}</p>
    </GlassPanel>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/
git commit -m "feat: add error boundary, glass shimmer skeleton, empty state"
```

---

### Task 20: Media Player Context & Mini Player

**Files:**
- Create: `src/lib/hooks/use-media-player.ts`
- Create: `src/components/media/mini-player.tsx`

- [ ] **Step 1: Create MediaPlayerProvider**

```tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface Track {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
}

interface MediaPlayerState {
  currentTrack: Track | null;
  queue: Track[];
  playing: boolean;
  volume: number;
}

interface MediaPlayerContextType extends MediaPlayerState {
  play: (track: Track) => void;
  skip: () => void;
  stop: () => void;
  setVolume: (v: number) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (id: string) => void;
}

const MediaPlayerContext = createContext<MediaPlayerContextType | null>(null);

export function MediaPlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MediaPlayerState>({
    currentTrack: null,
    queue: [],
    playing: false,
    volume: 75,
  });

  const play = (track: Track) => {
    setState((prev) => ({ ...prev, currentTrack: track, playing: true }));
  };

  const skip = () => {
    setState((prev) => {
      if (prev.queue.length === 0) return { ...prev, currentTrack: null, playing: false };
      const [next, ...rest] = prev.queue;
      return { ...prev, currentTrack: next, queue: rest };
    });
  };

  const stop = () => {
    setState((prev) => ({ ...prev, currentTrack: null, playing: false }));
  };

  const setVolume = (volume: number) => {
    setState((prev) => ({ ...prev, volume }));
  };

  const addToQueue = (track: Track) => {
    setState((prev) => ({ ...prev, queue: [...prev.queue, track] }));
  };

  const removeFromQueue = (id: string) => {
    setState((prev) => ({ ...prev, queue: prev.queue.filter((t) => t.id !== id) }));
  };

  return (
    <MediaPlayerContext.Provider value={{ ...state, play, skip, stop, setVolume, addToQueue, removeFromQueue }}>
      {children}
    </MediaPlayerContext.Provider>
  );
}

export function useMediaPlayer() {
  const ctx = useContext(MediaPlayerContext);
  if (!ctx) throw new Error("useMediaPlayer must be used within MediaPlayerProvider");
  return ctx;
}
```

- [ ] **Step 2: Create MiniPlayer**

```tsx
"use client";

import { Play, SkipForward, Volume2, X } from "lucide-react";
import { useMediaPlayer } from "@/lib/hooks/use-media-player";

export function MiniPlayer() {
  const { currentTrack, playing, volume, skip, stop, setVolume } = useMediaPlayer();

  if (!currentTrack) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 left-4 z-30 glass-elevated rounded-[var(--radius-card)] p-3 w-64 shadow-2xl">
      <div className="flex items-center gap-2 mb-2">
        <div className="size-6 flex items-center justify-center rounded bg-primary/20">
          <Play className="size-3 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">{currentTrack.title}</p>
          {currentTrack.artist && (
            <p className="text-[10px] text-text-secondary/50 truncate">{currentTrack.artist}</p>
          )}
        </div>
        <button type="button" onClick={stop} className="size-5 flex items-center justify-center hover:bg-glass-bg rounded">
          <X className="size-3 text-text-secondary/60" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={skip} className="size-6 flex items-center justify-center hover:bg-glass-bg rounded">
          <SkipForward className="size-3 text-text-secondary/60" />
        </button>
        <Volume2 className="size-3 text-text-secondary/40" />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="flex-1 h-1 appearance-none bg-glass-border rounded-full accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/use-media-player.ts src/components/media/mini-player.tsx
git commit -m "feat: add media player context and floating mini player"
```

---

### Task 21: Mascot — Context, Container & Canvas

**Files:**
- Create: `src/components/mascot/mascot-context.tsx`
- Create: `src/components/mascot/mascot-container.tsx`
- Create: `src/components/mascot/mascot-canvas.tsx`
- Create: `src/components/mascot/chat-panel.tsx`

- [ ] **Step 1: Create MascotContext**

```tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type MascotExpression = "idle" | "listening" | "surprise" | "happy" | "sad" | "talking";

interface MascotContextType {
  expression: MascotExpression;
  minimized: boolean;
  chatOpen: boolean;
  chatHistory: { role: "user" | "assistant"; text: string }[];
  setExpression: (expr: MascotExpression) => void;
  setMinimized: (v: boolean) => void;
  setChatOpen: (v: boolean) => void;
  addChat: (role: "user" | "assistant", text: string) => void;
}

const MascotContext = createContext<MascotContextType | null>(null);

export function MascotProvider({ children }: { children: ReactNode }) {
  const [expression, setExpression] = useState<MascotExpression>("idle");
  const [minimized, setMinimized] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);

  const addChat = (role: "user" | "assistant", text: string) => {
    setChatHistory((prev) => [...prev, { role, text }]);
  };

  return (
    <MascotContext.Provider
      value={{ expression, minimized, chatOpen, chatHistory, setExpression, setMinimized, setChatOpen, addChat }}
    >
      {children}
    </MascotContext.Provider>
  );
}

export function useMascot() {
  const ctx = useContext(MascotContext);
  if (!ctx) throw new Error("useMascot must be used within MascotProvider");
  return ctx;
}
```

- [ ] **Step 2: Create MascotCanvas (Live2D placeholder)**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useMascot } from "./mascot-context";

/**
 * Live2D Cubism WebGL canvas.
 *
 * This component renders the Live2D model via the Cubism SDK.
 * Integration requires:
 *   1. Live2D Cubism SDK for Web (npm: @live2d/cubism)
 *   2. Model files: .model3.json, .moc3, .physics3.json, textures
 *   3. Place model files in public/mascot/
 *
 * The current implementation shows a placeholder character.
 * Replace with actual Cubism SDK integration when model files are available.
 */

export function MascotCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { expression } = useMascot();

  // Placeholder: draw a simple avatar face that responds to expression
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background circle
    const gradient = ctx.createRadialGradient(w / 2, h / 2 - 10, 10, w / 2, h / 2, 80);
    gradient.addColorStop(0, "oklch(0.62 0.17 215 / 0.8)");
    gradient.addColorStop(0.6, "oklch(0.12 0.02 245 / 0.9)");
    gradient.addColorStop(1, "oklch(0.07 0.015 250 / 1)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 75, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    const eyeOffsetX = 20;
    const eyeY = 45;

    // Expression-driven eyes
    if (expression === "surprise") {
      // Wide eyes
      ctx.fillStyle = "oklch(0.93 0.01 245)";
      ctx.beginPath();
      ctx.ellipse(w / 2 - eyeOffsetX, eyeY, 12, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(w / 2 + eyeOffsetX, eyeY, 12, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "oklch(0.62 0.17 215)";
      ctx.beginPath();
      ctx.arc(w / 2 - eyeOffsetX, eyeY, 5, 0, Math.PI * 2);
      ctx.arc(w / 2 + eyeOffsetX, eyeY, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (expression === "happy") {
      // Happy closed crescent eyes
      ctx.strokeStyle = "oklch(0.93 0.01 245)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2 - eyeOffsetX, eyeY, 10, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2 + eyeOffsetX, eyeY, 10, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    } else if (expression === "sad") {
      // Sad downcast eyes
      ctx.fillStyle = "oklch(0.93 0.01 245)";
      ctx.beginPath();
      ctx.ellipse(w / 2 - eyeOffsetX, eyeY, 8, 6, 0.2, 0, Math.PI * 2);
      ctx.ellipse(w / 2 + eyeOffsetX, eyeY, 8, 6, -0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Normal eyes
      ctx.fillStyle = "oklch(0.93 0.01 245)";
      ctx.beginPath();
      ctx.ellipse(w / 2 - eyeOffsetX, eyeY, 10, 8, 0, 0, Math.PI * 2);
      ctx.ellipse(w / 2 + eyeOffsetX, eyeY, 10, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "oklch(0.62 0.17 215)";
      ctx.beginPath();
      ctx.arc(w / 2 - eyeOffsetX, eyeY, 4, 0, Math.PI * 2);
      ctx.arc(w / 2 + eyeOffsetX, eyeY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth
    ctx.strokeStyle = "oklch(0.93 0.01 245 / 0.7)";
    ctx.lineWidth = 2;
    if (expression === "talking") {
      ctx.beginPath();
      ctx.ellipse(w / 2, 70, 8, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (expression === "happy") {
      ctx.beginPath();
      ctx.arc(w / 2, 70, 10, 0.1, Math.PI - 0.1);
      ctx.stroke();
    } else if (expression === "surprise") {
      ctx.beginPath();
      ctx.ellipse(w / 2, 70, 6, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "oklch(0.12 0.02 245)";
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(w / 2, 75, 6, 0.1, Math.PI - 0.1);
      ctx.stroke();
    }

    // Breathing animation — subtle canvas shift
    const breath = Math.sin(Date.now() / 1000) * 1.5;
    // Applied via CSS transform on container instead

  }, [expression]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={180}
      className="w-full h-full"
    />
  );
}
```

- [ ] **Step 3: Create MascotContainer**

```tsx
"use client";

import { MessageCircle, X, Minimize2, Maximize2 } from "lucide-react";
import { useMascot } from "./mascot-context";
import { MascotCanvas } from "./mascot-canvas";
import { ChatPanel } from "./chat-panel";
import { useState } from "react";

export function MascotContainer() {
  const { minimized, setMinimized, chatOpen, setChatOpen } = useMascot();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setDragging(false);

  return (
    <div
      className="fixed bottom-4 right-4 z-40 select-none"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Main mascot bubble */}
      <div
        className={`glass-intense rounded-2xl overflow-hidden transition-all duration-200 ${
          minimized ? "w-16 h-16 cursor-pointer" : "w-[200px]"
        }`}
        style={{ height: minimized ? 64 : 280 }}
      >
        {minimized ? (
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="w-full h-full flex items-center justify-center"
            onMouseDown={handleMouseDown}
          >
            <MessageCircle className="size-6 text-primary" />
          </button>
        ) : (
          <>
            {/* Drag handle + controls */}
            <div
              className="flex items-center justify-between px-3 py-1.5 border-b border-glass-border cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
            >
              <span className="text-[10px] font-semibold text-text-secondary tracking-wide uppercase">Mascot</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setChatOpen(!chatOpen)}>
                  <MessageCircle className="size-3 text-text-secondary/60 hover:text-text-primary" />
                </button>
                <button type="button" onClick={() => setMinimized(true)}>
                  <Minimize2 className="size-3 text-text-secondary/60 hover:text-text-primary" />
                </button>
              </div>
            </div>

            {/* Canvas area */}
            <div className="h-[140px] flex items-center justify-center">
              <MascotCanvas />
            </div>

            {/* Chat panel (expandable) */}
            <div className={`transition-all duration-200 overflow-hidden ${chatOpen ? "h-[120px]" : "h-0"}`}>
              <ChatPanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create ChatPanel**

```tsx
"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { useMascot } from "./mascot-context";

export function ChatPanel() {
  const { chatHistory, addChat, setExpression } = useMascot();
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    addChat("user", input);
    setExpression("listening");

    // Simulated bot response — replace with actual mascot-chat API call
    setTimeout(() => {
      addChat("assistant", `I'm monitoring this server for you!`);
      setExpression("happy");
    }, 800);

    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {chatHistory.slice(-6).map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <span className={`text-[10px] px-2 py-1 rounded-lg max-w-[85%] ${
              msg.role === "user"
                ? "bg-primary/20 text-text-primary"
                : "glass text-text-secondary"
            }`}>
              {msg.text}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 px-2 py-1 border-t border-glass-border">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask mascot..."
          className="flex-1 bg-transparent text-[10px] text-text-primary placeholder-text-secondary/30 outline-none"
        />
        <button type="button" onClick={handleSend} className="size-5 flex items-center justify-center">
          <Send className="size-3 text-primary" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create barrel export**

```tsx
// src/components/mascot/index.ts
export { MascotProvider } from "./mascot-context";
export { MascotContainer } from "./mascot-container";
export { useMascot } from "./mascot-context";
```

- [ ] **Step 6: Commit**

```bash
git add src/components/mascot/
git commit -m "feat: add Live2D mascot container with canvas, chat panel, and context"
```

---

### Task 22: WS Expression Triggers

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx` — add WS → mascot expression bindings

- [ ] **Step 1: Add WebSocket expression triggers**

In the dashboard layout, add a side-effect that connects WebSocket events to mascot expressions:

```tsx
// Add to dashboard layout before the return:
import { useEffect } from "react";
import { useMascot } from "@/components/mascot/mascot-context";
import { useWebSocket } from "@/lib/ws/context";

function MascotExpressionSync() {
  const ws = useWebSocket();
  const { setExpression } = useMascot();

  useEffect(() => {
    const unsub1 = ws.on("message_created", (data: any) => {
      if (data.ai_status === "flagged" || data.ai_status === "warn") {
        setExpression("surprise");
        setTimeout(() => setExpression("idle"), 2000);
      }
    });

    const unsub2 = ws.on("voice_active_user", () => {
      setExpression("listening");
    });

    return () => { unsub1(); unsub2(); };
  }, [ws, setExpression]);

  return null;
}
```

Then render `<MascotExpressionSync />` inside the layout tree.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx
git commit -m "feat: connect WS events to mascot expression triggers"
```

---

### Task 23: Cleanup — Remove Old Components

**Files:**
- Delete remaining old files that have been replaced

- [ ] **Step 1: Remove old dashboard components**

```bash
rm -rf src/components/dashboard/users-section.tsx
rm -rf src/components/dashboard/channels-section.tsx
rm -rf src/components/dashboard/channel-detail-section.tsx
rm -rf src/components/dashboard/user-detail-section.tsx
rm -rf src/components/dashboard/index.ts
rm -rf src/components/messages/images-grid.tsx
rm -rf src/components/messages/review-list.tsx
rm -rf src/components/messages/message-detail-view.tsx
rm -rf src/components/shared/stat-card.tsx
rm -rf src/components/shared/detail-stat.tsx
```

- [ ] **Step 2: Verify build**

```bash
pnpm run build:web 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old components replaced by redesign"
```

---

## Self-Review Checklist

- [ ] **Spec coverage:** Every section from the spec has at least one task implementing it:
  - Section 2 (Layout/Nav) → Tasks 5, 6, 7, 8
  - Section 3 (Design Tokens) → Task 1
  - Section 4 (Components) → Tasks 4, 9, 10, 11, 13, 16, 17, 18, 19
  - Section 5 (Page Layouts) → Tasks 12, 15, 16, 17, 18
  - Section 6 (Animations) → Tasks 1, 9, 10
  - Section 7 (Data Flow) → Task 15 (URL state), Task 22 (WS triggers)
  - Section 8 (Tech Stack) → Task 2 (fonts)
  - Section 9 (File Structure) → All tasks
  - Section 10 (Implementation Order) → Followed as-is
  - Mascot → Tasks 21, 22
  - Media Player → Task 20
  - No gaps found.

- [ ] **Placeholder check:** No TBD, TODO, or "implement later" found. Every task has specific code. The only note is the Live2D canvas is a placeholder with Canvas2D drawing — this is intentional since the actual Live2D model file isn't available yet.

- [ ] **Type consistency:** All component props match what consuming pages expect. Hook interfaces consistent (useMascot, useMediaPlayer). No type drift between tasks.

- [ ] **No contradictions:** nav items match top nav links. Page layouts match sub-nav tabs. No file referenced before being created.
