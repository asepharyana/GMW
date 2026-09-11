# GMW Frontend — Greenfield Rebuild (Visual-System Overhaul + Custom UI + Motion/3D)

> **For Hermes:** Execute with `subagent-driven-development` (one fresh subagent per task, two-stage review). Each task is 1–3 min, atomic, independently verifiable, committed after each. Reuse `src/lib/api/*`, `src/lib/ws/*`, `src/lib/types/*`, hooks verbatim. Never invent endpoints.

**Goal:** Rebuild the GMW Discord-automod dashboard frontend from scratch — drop shadcn/ui + glass/teal/purple aesthetic entirely, replace with a custom, distinctive design system where every page has its own visual metaphor (no uniform bordered-card grid), and push the presentation layer with **Framer Motion (`motion`) choreography + signature Three.js scenes**. Re-integrate to the EXISTING backend API + WebSocket contract (do NOT touch the backend).

**Architecture:** Next.js 16 App Router (SSR) + React 19 + TS strict + Tailwind v4. Keep the *plumbing* (data contract), rebuild the *skin + primitives + motion*. Each route = one self-contained `page.tsx` (server fetch + client view in the same file via a `"use client"` sibling export). Custom SVG charts (no recharts). Custom micro-primitives (no shadcn/base-ui). New token system in `globals.css`. **Motion:** `motion/react` app-wide for page transitions, spring micro-interactions, layout animation. **3D:** raw `three` (no react-three-fiber — leaner) in exactly TWO signature scenes, lazy-loaded client-only with graceful fallback. Deployed unchanged via existing flake + `gmw-proxy` nginx (`:4009` → Next `:4017`).

**Tech Stack:** next@16, react@19, tailwindcss@4 (`@import "tailwindcss"`), `next/font/google` (Bricolage Grotesque + Inter + JetBrains Mono), `swr` (data revalidation), `lucide-react` (icons only), `motion` (Framer Motion successor — `motion/react`), `three` + `@types/three` (signature scenes only), `clsx` + `tailwind-merge`. **Removed:** `@shadcn/react`, `@base-ui/react`, `recharts`, `shadcn` CLI, `cmdk`, `sonner`, `react-day-picker`, `embla-carousel-react`, `react-resizable-panels`, `input-otp`, all 50 `components/ui/*`.

---

## 0. Design System (the creative core — read before coding)

**Persona:** Controlled UX Designer + a tactical "ops console" voice. Material honesty: hierarchy via **scale/weight/tonal blocks**, NOT borders/shadows. Per `frontend-design` skill principle — spend the boldness in ONE signature place per page, keep the rest disciplined. Motion is choreography, not confetti: **one orchestrated moment per page**, everything else quiet.

### Palette (warm, signal-driven — NO teal/cyan/purple/blue gradients)
Light mode (`:root`):
```
--canvas:      oklch(0.96 0.012 80)    /* warm off-white, not cream */
--surface:     oklch(0.92 0.014 80)    /* tonal block, replaces bordered card */
--surface-2:   oklch(0.88 0.016 80)
--ink:         oklch(0.22 0.02 70)     /* primary text */
--ink-soft:    oklch(0.46 0.02 70)     /* secondary text */
--hairline:    oklch(0.22 0.02 70 / 0.10)  /* structural rules ONLY, sparse */
--signal:      oklch(0.78 0.17 125)    /* lime — OK / live / primary accent */
--signal-ink:  oklch(0.20 0.03 70)     /* text ON signal */
--amber:       oklch(0.80 0.15 70)     /* WARN */
--vermilion:   oklch(0.62 0.21 25)     /* FLAGGED / destructive */
--ring:        var(--signal)
```
Dark mode (`.dark`, default theme per `next-themes`):
```
--canvas:      oklch(0.13 0.015 70)    /* warm charcoal, not blue-black */
--surface:     oklch(0.18 0.02 70)
--surface-2:   oklch(0.23 0.022 70)
--ink:         oklch(0.93 0.01 75)
--ink-soft:    oklch(0.62 0.02 75)
--hairline:    oklch(1 0 0 / 0.09)
--signal:      oklch(0.88 0.18 125)
--signal-ink:  oklch(0.18 0.03 70)
--amber:       oklch(0.85 0.15 70)
--vermilion:   oklch(0.68 0.21 25)
```
Three semantic signals reused everywhere: **lime = OK/live, amber = warn, vermilion = flag/danger**. This kills the purple-accent + teal-primary monotony.

### Typography (3 roles, deliberate pairing — not "Inter everywhere")
- **Display:** `Bricolage Grotesque` (700–800) — characterful grotesque for headers/big numbers.
- **Body/UI:** `Inter` (400–600).
- **Data/label:** `JetBrains Mono` (500/700) — all stats, timestamps, channel IDs, metrics.
Load all three via `next/font/google` with CSS variables (keep current `--font-inter`/`--font-jetbrains-mono` names + add `--font-display`).

### Layout & signature
- **No `card` with border.** Use tonal `--surface` blocks with generous radius (`--r: 14px`) and internal padding; separate blocks with whitespace + sparse hairlines only where structurally meaningful.
- **Signature element = "scan-tick":** a 1px animated pulse line (CSS keyframe `scan`) that marks every live/section header — NOT a card outline. Global canvas carries a faint warm dot-grid texture (low opacity) instead of the current bluish dotted radial-gradient.
- **Nav = left "spine":** vertical rail of icon nodes joined by a hairline; active node gets a `--signal` dot + label reveal. Collapses to a bottom tab-bar < 768px (CSS only, no JS sidebar primitive).
- **Header = "status bar":** connection state (WS dot), guild selector, live clock — mono font, reads like an instrument readout.

## 0.1 Motion & 3D Layer (the "lebih kreatif" addition)

### Motion rules (from `motion/react`)
- **Page transitions:** one shared `RouteTransition` in `(dashboard)/layout.tsx` — `AnimatePresence mode="popLayout"` + `motion.div key={pathname}` (fade + 8px rise + slight blur-out, ~220ms, `easeOut`). Consistent everywhere, zero per-page boilerplate.
- **Enter choreography (per page, ONE signature moment):** staggered rise-in for the hero/ticker group using `staggerChildren` variants; afterwards, quiet springs for hover/tap (`scale: 1.03` on interactive blocks, `whileTap` on buttons).
- **Layout animation:** `layout` prop on list items (messages rows, recording rows, queue) so add/remove/filter reflows smoothly; `layoutId` for shared-element transitions (ticker → detail modal on dashboard).
- **Live pulse:** `motion` drives the severity ticks / speaker rings with springs, not CSS `transition` alone.
- **`useReducedMotion()`** (from `motion/react`) gates ALL heavy motion; CSS `@media (prefers-reduced-motion: reduce)` additionally kills `scan`/`spin-disc` keyframes. Accessibility floor, non-negotiable.
- **No scroll-jacking, no marquee loops, no per-element confetti.** One moment per page. (`frontend-design` skill: "Satu momen orkestrasi biasanya lebih mengena daripada efek tersebar.")

### 3D rules (raw `three`, no R3F — lean bundle)
- Exactly **two** scenes, chosen because they carry real data meaning: **Dashboard hero** (`SignalField` — a particle field whose pulse density reflects live activity) and **Voice page** (`OrbField` — speakers as glowing orbs whose height/ring radius reacts to who is speaking). Everything else stays 2D/motion.
- **Lazy + client-only:** `next/dynamic(() => import("./SignalField"), { ssr: false, loading: () => <StaticFallback/> })`. Three ships in its own chunk, loaded only on those two routes.
- **WebGL guard:** if `!window.WebGLRenderingContext` or context creation fails → render the static SVG/CSS fallback (a stylized 2D version of the same visual). Never blank.
- **Perf guardrails:** `dpr: [1, 1.75]`, `powerPreference: "high-performance"`, `antialias: true`; RAF loop paused on `document.hidden`; `dispose()` geometries/materials on unmount; particle count capped by `navigator.hardwareConcurrency` + viewport (`Math.min(900, w*h/2000)`).
- **Style:** warm palette ONLY — signal-lime particles, amber/vermilion for flag/warn states; fog + soft additive blending for glow (no harsh white lights, no metallic PBR).
- **Interactivity:** subtle pointer parallax (camera lerp toward cursor) + gentle idle rotation. No drag/drop, no raycasting menus.

### Per-page metaphor (kills monotony — each page feels different)
| Route | Metaphor | Signature visual | Motion / 3D |
|---|---|---|---|
| `/dashboard` | Live ops overview | **3D signal particle field** hero + asymmetric ticker blocks + radial moderation gauge | **3D SignalField** (reacts to activity), staggered ticker rise-in, gauge draws on mount |
| `/messages` | Transcript | Left channel **timeline spine**; right = flowing message entries with left **severity tick** (no bordered cards); search = command palette | `layout` on message rows, spring severity ticks, palette types in |
| `/voice` | Stage | **3D orb field** of speakers + equalizer rings; activity = horizontal **session ribbon** | **3D OrbField** (speaking → orb rises + ring pulses), session ribbon draws sequentially |
| `/media` | Turntable | Rotating **disc** now-playing; queue = borderless list | CSS 3D disc spin (spring on play/pause), queue `layout` reflow, progress bar springs |
| `/recordings` | Tape library | Rows with **waveform thumbnail** (custom SVG from duration) | Waveform bars spring on hover; new upload animates in (AnimatePresence) |
| `/moderation` | Security log | Vertical **event flow** with status nodes (dot + line), not a table of cards | Nodes pulse on live action; timeline draws in sequence |
| `/analysis` | Query console | Terminal-style search panel | Typing cursor + results stagger |

---

## 1. What to KEEP (reuse verbatim — correct + integrates to backend)
- `src/lib/api/server.ts` — 11 server fetchers (`getDashboardStats`, `getActivity`, `getMediaStatus`, `getConfig`, `getModerationStats/Actions`, `getGuilds`, `getVoiceStatus`, `getRecordings`, `getMessages`). **No change.**
- `src/lib/api/client.ts` — `apiRequest` + `ApiError`. **No change.**
- `src/lib/ws/*` — `connection.ts`, `context.tsx`, `types.ts` (17 typed events: `message_created/updated/deleted/analyzed`, `voice_*`, `media_state`, `voice_pcm_data` binary). **No change.**
- `src/lib/types/*` — all interfaces. **No change.**
- `src/lib/format.ts`, `src/lib/utils.ts` (`cn`). **No change.**
- `src/lib/navigation.ts` — `navItems`. Keep but extend icons/labels if needed.
- Hooks: `src/hooks/*` (use-dashboard, use-media, use-messages, use-voice, use-moderation, use-recordings, use-guilds, use-config, use-chatbot-user, use-action, use-mobile), `src/lib/hooks/use-mounted.ts`. **Reuse** (verify no bad imports into deleted barrels).
- Feature logic kept but **reskinned**: `src/components/media/music-player.tsx`, `src/components/voice/*`, `src/components/chatbot/*`, `src/components/messages/*`, `src/components/recordings/*`, `src/components/moderation/moderation-section.tsx`, `src/components/analysis/search-panel.tsx`, `src/components/dashboard/*` (charts → rewritten as custom SVG).

## 2. What to DELETE
- `src/components/ui/*` (all 50 shadcn primitives).
- `components.json`, `@shadcn/react` + `@base-ui/react` + `shadcn` deps.
- `recharts` (replace with custom SVG chart helpers in `src/components/charts/`).
- `src/app/globals.css` → rewrite (no `@import "shadcn/tailwind.css"`, no `--color-primary` teal, no `.glass*`, no `.text-gradient`/`.gradient-border` teal/purple, no bluish body texture).
- `src/components/layout/app-sidebar.tsx` (shadcn Sidebar) → replace with custom `Spine` nav.
- All `page.tsx`+`view.tsx` pairs → merge into single `page.tsx` per route.

## 3. What to BUILD (new)
- New `globals.css` (tokens above + utilities + keyframes `scan`, `eq`, `fade-up`, `spin-disc`).
- `src/components/primitives/` — minimal custom: `Button`, `Input`, `Select`, `Dialog`, `Tooltip`, `Badge`, `Progress`, `Avatar`, `Skeleton`, `Toast`, `Sheet`.
- `src/components/motion/` — `RouteTransition.tsx`, `Stagger.tsx`, `variants.ts`.
- `src/components/three/` — `SignalField.tsx`, `OrbField.tsx`, `WebGLGuard.tsx`, `StaticFallback.tsx`, `useThreeScene.ts`.
- `src/components/charts/` — `Sparkline`, `AreaActivity`, `RadialGauge`, `SessionRibbon`, `Waveform`.
- `src/components/layout/` — `Spine.tsx`, `StatusBar.tsx`, `ThemeToggle.tsx` (reskin).
- 7 merged `page.tsx` files (one per route) implementing the metaphors above.
- `src/app/layout.tsx` — root (fonts + ThemeProvider + Toaster), `src/app/(dashboard)/layout.tsx` — providers + Spine + StatusBar + RouteTransition + MiniPlayer + Chatbot, `src/app/page.tsx` → redirect `/dashboard`.

---

## 4. Target File & Folder Structure (authoritative)

Everything below `services/frontend/src/` is the new tree. `REWRITE` replaces existing; `NEW` creates; `DELETE` removes. The `app/` route tree collapses `page.tsx`+`view.tsx` into single `page.tsx` files containing BOTH server fetch (default export) and client view (`"use client"` named export in same file).

```
services/frontend/
├─ package.json                         REWRITE  (drop shadcn/base-ui/recharts; add motion, three, @types/three)
├─ pnpm-workspace.yaml                  REWRITE  (onlyBuiltDependencies: keep build list minimal)
├─ components.json                      DELETE   (shadcn registry config — no longer used)
├─ next.config.ts                       KEEP     (output: standalone, trailingSlash, images.unoptimized)
├─ tsconfig.json                        KEEP     (paths "@/*" → src/*, strict)
├─ postcss.config.mjs                   KEEP     (@tailwindcss/postcss)
├─ biome.json                           KEEP
└─ src/
   ├─ app/
   │  ├─ layout.tsx                     REWRITE  (3 fonts + ThemeProvider + custom Toaster; rm sonner)
   │  ├─ globals.css                    REWRITE  (new token system §0; rm glass/teal/purple)
   │  ├─ page.tsx                       KEEP     (redirect → /dashboard/)
   │  └─ (dashboard)/
   │     ├─ layout.tsx                  REWRITE  (providers + Spine + StatusBar + RouteTransition + MiniPlayer + Chatbot; rm shadcn Sidebar)
   │     ├─ dashboard/   page.tsx       REWRITE  (server fetch + <DashboardView/> client; 3D SignalField hero)
   │     ├─ messages/    page.tsx       REWRITE  (server seeds + <MessagesView/>; spine + severity ticks)
   │     ├─ voice/       page.tsx       REWRITE  (server seeds + <VoiceView/>; 3D OrbField hero)
   │     ├─ media/       page.tsx       REWRITE  (server seeds + <MediaView/>; turntable disc)
   │     ├─ recordings/  page.tsx       REWRITE  (server seeds + <RecordingsView/>; waveform rows)
   │     ├─ moderation/  page.tsx       REWRITE  (server seeds + <ModerationView/>; event-flow)
   │     └─ analysis/    page.tsx       REWRITE  (client <AnalysisView/>; query console)
   ├─ components/
   │  ├─ ui/                            DELETE   (all 50 shadcn primitives)
   │  ├─ primitives/   NEW             (Button, Input, Select, Dialog, Tooltip, Badge, Progress, Avatar, Skeleton, Toast, Sheet, index.ts)
   │  ├─ motion/       NEW             (variants.ts, Stagger.tsx, RouteTransition.tsx)
   │  ├─ three/        NEW             (WebGLGuard, SignalField, OrbField, StaticFallback, useThreeScene)
   │  ├─ charts/       NEW             (Sparkline, AreaActivity, RadialGauge, SessionRibbon, Waveform)
   │  ├─ layout/       REWRITE         (Spine NEW, StatusBar NEW, ThemeToggle REWRITE, app-sidebar DELETE)
   │  ├─ dashboard/    REWRITE         (stat-card DELETE; activity-chart/hourly/top-channels/moderation-donut/users/channels/reactions REWRITE)
   │  ├─ messages/     REWRITE         (message-card DELETE; message-list/detail/detail-view/ai-status-badge/ai-analysis-panel/attachments-grid/lightbox/search-overlay REWRITE)
   │  ├─ voice/        REWRITE         (voice-connection-card/connection-card/microphone-card DELETE; speaker-waveform/active-speakers-panel/activity-timeline/mic-control/listen-control REWRITE)
   │  ├─ media/        REWRITE         (music-player, mini-player REWRITE)
   │  ├─ recordings/   REWRITE         (recording-card DELETE; recording-player REWRITE)
   │  ├─ moderation/   REWRITE         (moderation-section REWRITE)
   │  ├─ analysis/     REWRITE         (search-panel REWRITE)
   │  ├─ chatbot/      REWRITE         (chatbot-container, chat-panel REWRITE; chatbot-context, index KEEP)
   │  └─ shared/       REWRITE         (empty-state, error-state, loading-skeleton, error-boundary, guild-selector REWRITE; index KEEP)
   ├─ hooks/                           KEEP     (verify no bad imports)
   ├─ lib/
   │  ├─ api/          KEEP     (server.ts, client.ts, index.ts)
   │  ├─ ws/           KEEP     (connection.ts, context.tsx, types.ts, ws-hook.ts)
   │  ├─ types/        KEEP     (all interfaces)
   │  ├─ hooks/        KEEP     (use-media-player.tsx, use-mounted.ts)
   │  ├─ audio/        KEEP     (voice PCM decode helpers if present)
   │  ├─ format.ts     KEEP
   │  ├─ utils.ts      KEEP     (cn)
   │  └─ navigation.ts KEEP
   └─ (public assets)  KEEP
```

### 4.1 Single-file page pattern (mandatory)
```tsx
// server component (default export) — runs on the server, fetches initial data
import { getX, getY } from "@/lib/api/server";
import { XView } from "./page"; // self-import of the named client export

export default async function Page() {
  const [a, b] = await Promise.allSettled([getX(), getY()]);
  return <XView initialA={a.status === "fulfilled" ? a.value : undefined}
                  initialB={b.status === "fulfilled" ? b.value : undefined} />;
}

// client component (named export) — hydrated, takes initialData as SWR fallback
"use client";
export function XView({ initialA, initialB }: Props) {
  const { data } = useX(initialA); // SWR fallbackData = initialA
}
```
Self-referencing the named export keeps the file single-artifact while satisfying Next's RSC boundary (default = server, named = client). Tabs live inside `XView`.

### 4.2 Import rules (lint gate)
- No `@/components/ui/*` (deleted) — all UI via `@/components/primitives`.
- `three` only imported inside `src/components/three/*`; pages import those via `next/dynamic({ ssr: false })`.
- `motion` imported from `motion/react` only.
- All data: `@/lib/api/server` (server) / `@/lib/api/client` (client) — never invented endpoints.

---

## TASKS (granular — every file is its own task)

### PHASE 0 — Dependency surgery
- **T0.1** Edit `package.json`: remove `dependencies["@base-ui/react"]`.
- **T0.2** Remove `dependencies["@shadcn/react"]`.
- **T0.3** Remove `dependencies["shadcn"]`.
- **T0.4** Remove `dependencies["recharts"]`.
- **T0.5** Remove `dependencies["cmdk"]`.
- **T0.6** Remove `dependencies["sonner"]`.
- **T0.7** Remove `dependencies["react-day-picker"]`.
- **T0.8** Remove `dependencies["embla-carousel-react"]`.
- **T0.9** Remove `dependencies["react-resizable-panels"]`.
- **T0.10** Remove `dependencies["input-otp"]`.
- **T0.11** Add `dependencies["motion"]: "^12.0.0"`, `dependencies["three"]: "^0.180.0"`, `devDependencies["@types/three"]: "^0.180.0"`.
- **T0.12** `rm -f pnpm-lock.yaml && pnpm install` (regenerate lockfile).
- **T0.13** Verify `pnpm ls recharts @shadcn/react @base-ui/react` → empty; `pnpm ls motion three @types/three` → present.
- **T0.14** `cat pnpm-workspace.yaml`: confirm `onlyBuiltDependencies` keeps needed native builds, no broken shadcn postinstall.

### PHASE 1 — Design tokens (globals.css)
- **T1.1** Rewrite `@theme { }` head: light `:root` palette from §0 (canvas/surface/ink/ink-soft/hairline/signal/signal-ink/amber/vermilion/ring).
- **T1.2** Add radius tokens `--r: 14px`, `--r-panel: 12px`, `--r-control: 8px`, `--r-pill: 9999px`.
- **T1.3** Add `--font-display` token; keep `--font-sans`/`--font-mono`.
- **T1.4** Add `.dark { }` override block with §0 dark values (warm charcoal).
- **T1.5** Replace `@layer base body` bg: warm dot-grid `radial-gradient(oklch(0.45 0.03 70 / 0.05) 1px, transparent 1px)` + faint warm glow; remove old bluish radial layers.
- **T1.6** Retint scrollbar thumb to warm `oklch(0.4 0.02 70 / 0.2)`; keep `::selection` signal-tinted.
- **T1.7** Delete `.glass`, `.glass-elevated`, `.glass-intense`, `.dark .glass-intense` utilities.
- **T1.8** Delete `.text-gradient` and `.gradient-border`.
- **T1.9** Add `.surface` utility (bg var(--surface), radius var(--r), padding).
- **T1.10** Add `.scan-tick` (1px animated pulse line, keyframe `scan`).
- **T1.11** Add `.ticker`, `.pill`, `.mono` utilities.
- **T1.12** Add keyframes `scan`, `eq`, `fade-up`, `spin-disc` (keep used existing ones if still referenced).
- **T1.13** Add `@media (prefers-reduced-motion: reduce)` kill switch for scan/eq/spin-disc/pulse-ring/shimmer.
- **T1.14** Remove `@import "shadcn/tailwind.css";` (line 3); verify nothing else depends on shadcn CSS vars.
- **T1.15** Verify `grep -c "0.52 0.17 215\|0.55 0.2 280" src/app/globals.css` → `0`.
- **T1.16** `pnpm biome check src/app/globals.css` → no errors.

### PHASE 2 — Root layout + fonts
- **T2.1** In `layout.tsx` add `Bricolage_Grotesque` (`variable: "--font-display"`, subsets `["latin"]`, `display: "swap"`).
- **T2.2** Apply `inter.variable`, `jetbrainsMono.variable`, `bricolage.variable` to `<html>`.
- **T2.3** Remove `import { Toaster } from "@/components/ui/sonner"`.
- **T2.4** Comment out `<Toaster />` temporarily (re-enabled after T3.10).
- **T2.5** Keep `suppressHydrationWarning`, `ThemeProvider` (defaultTheme dark, enableSystem false).
- **T2.6** `npx tsc --noEmit` (fonts only; rest may still error until primitives exist).

### PHASE 3 — Custom primitives (replace 50 shadcn ui)
- **T3.1** `primitives/Button.tsx`: `motion.button`, variants `primary`/`ghost`/`danger`, `cn()` merge, `cursor-pointer`, `focus-visible:ring-2 ring-signal`, `whileTap` scale 0.97 gated by `useReducedMotion()`.
- **T3.2** `primitives/Input.tsx`: native `<input>`, `bg-surface`, `rounded-[var(--r-control)]`, `mono` prop.
- **T3.3** `primitives/Select.tsx`: native `<select>` styled, `bg-surface`.
- **T3.4** `primitives/Dialog.tsx`: native `<dialog>` + `showModal()`, warm `::backdrop`, `AnimatePresence`, `onClose`.
- **T3.5** `primitives/Tooltip.tsx`: CSS group-hover popover.
- **T3.6** `primitives/Badge.tsx`: tonal pill, `variant` → `bg-{tone}/15 text-{tone}` (signal/amber/vermilion/neutral).
- **T3.7** `primitives/Progress.tsx`: SVG track + `motion` fill, `value`/`max`, signal color.
- **T3.8** `primitives/Avatar.tsx`: `<img>` + initials fallback, signal bg, size prop.
- **T3.9** `primitives/Skeleton.tsx`: shimmer block (signal-tinted), `aria-hidden`.
- **T3.10** `primitives/Toast.tsx`: `ToastProvider` context + portal, `useToast()`, motion slide-in, auto-dismiss.
- **T3.11** `primitives/Sheet.tsx`: mobile drawer (`translate-x` spring), overlay, `open`/`onClose`.
- **T3.12** `primitives/index.ts` re-export all 11.
- **T3.13** Re-enable `<Toaster />` in `layout.tsx` (T2.4).
- **T3.14** Verify `npx tsc --noEmit` on primitives; `grep -rl "@/components/ui/" src/components/primitives` → empty.

### PHASE 4 — Motion foundation
- **T4.1** `motion/variants.ts`: export `spring`, `ease`, `fadeUp`, `stagger` (per §0.1).
- **T4.2** `motion/Stagger.tsx`: `StaggerGroup` + `StaggerItem` (`"use client"`).
- **T4.3** `motion/RouteTransition.tsx`: `"use client"`, `usePathname`, `AnimatePresence mode="popLayout"`, reduced-motion fallback to plain `<div>`.
- **T4.4** Verify `npx tsc --noEmit` on motion; `motion/react` import resolves.

### PHASE 5 — Custom SVG charts (replace recharts)
- **T5.1** `charts/Sparkline.tsx`: `<svg>` polyline from `points:number[]`, signal stroke, no axes.
- **T5.2** `charts/AreaActivity.tsx`: filled `<path>` area, low-opacity signal gradient, `pathLength` draw gated by reduced-motion.
- **T5.3** `charts/RadialGauge.tsx`: `<circle>` arc `stroke-dasharray`, center mono label.
- **T5.4** `charts/SessionRibbon.tsx`: horizontal segments per speaker duration.
- **T5.5** `charts/Waveform.tsx`: bars from deterministic seed, spring scaleY on hover.
- **T5.6** Verify `npx tsc --noEmit` on charts; no `recharts` import.

### PHASE 6 — Three.js foundation (lazy, guarded)
- **T6.1** `three/WebGLGuard.tsx`: `"use client"`, detect webgl2/webgl, render `children` or `fallback`.
- **T6.2** `three/useThreeScene.ts`: shared hook — renderer init (`dpr:[1,1.75]`, `powerPreference`), RAF with `document.hidden` pause, `dispose()` on unmount, resize observer.
- **T6.3** `three/SignalField.tsx`: `Points` BufferGeometry (~min(900, w*h/2000)), additive blend, signal-lime, fog, idle rotation + sine drift, `activity` prop, pointer parallax. Uses `useThreeScene`.
- **T6.4** `three/OrbField.tsx`: per-speaker `Sphere`, y-scale + ring lerp to speaking, tones signal/idle/vermilion.
- **T6.5** `three/StaticFallback.tsx`: 2D SVG/CSS silhouette for both scenes.
- **T6.6** Verify `grep -rl "from \"three\"" src | grep -v "components/three"` → empty; `npx tsc --noEmit` on three.

### PHASE 7 — Layout shell
- **T7.1** `layout/Spine.tsx`: `"use client"`, vertical rail from `navItems`, icon node + hairline, active signal dot + label reveal (motion spring), `max-md:` bottom tab-bar.
- **T7.2** `layout/StatusBar.tsx`: `"use client"`, page title + WS status dot (motion pulse) + `GuildSelector` + live clock (mono) + `ThemeToggle`.
- **T7.3** `layout/ThemeToggle.tsx`: restyle, keep `next-themes` logic, motion icon swap.
- **T7.4** Rewrite `(dashboard)/layout.tsx`: keep SWRConfig/WsProvider/MediaPlayerProvider/ChatbotProvider + sync functions verbatim; swap `AppSidebar`→`Spine`, header→`StatusBar`, wrap children in `RouteTransition`; remove `SidebarInset`/`SidebarTrigger`/`Separator`; keep MiniPlayer+ChatbotContainer.
- **T7.5** Delete `layout/app-sidebar.tsx`.
- **T7.6** Verify `grep -rl "components/ui/sidebar\|app-sidebar" src` → empty; `npx tsc --noEmit`.

### PHASE 8 — Dashboard page + components
- **T8.1** Rewrite `dashboard/page.tsx`: default async `getDashboardStats`+`getActivity` → `<DashboardView>`; named `"use client"` view with useStats/useActivity, 3D hero + tickers + tabs.
- **T8.2** Add `WebGLGuard`+`SignalField` hero with `activity` ratio; overlay headline (Bricolage) + `<RadialGauge>`.
- **T8.3** Build asymmetric ticker row with `StaggerGroup` + 4 `.surface` blocks (mono number + label + `<Sparkline>`); inline (replaces stat-card).
- **T8.4** Delete `dashboard/stat-card.tsx`.
- **T8.5** Reskin `dashboard/activity-chart.tsx` → `charts/AreaActivity` (daily).
- **T8.6** Reskin `dashboard/hourly-activity-chart.tsx` → `charts/AreaActivity` (hourly).
- **T8.7** Reskin `dashboard/top-channels-chart.tsx` → `charts/` + `.surface`.
- **T8.8** Reskin `dashboard/moderation-donut.tsx` → `charts/RadialGauge`.
- **T8.9** Reskin `dashboard/users-section.tsx` → `.surface`.
- **T8.10** Reskin `dashboard/channels-section.tsx` → `.surface`.
- **T8.11** Reskin `dashboard/reactions-section.tsx` → `.surface`.
- **T8.12** Verify `grep -rl "components/ui/card" src/app/\(dashboard\)/dashboard src/components/dashboard` → empty; `npx tsc --noEmit`.

### PHASE 9 — Messages page + components
- **T9.1** Rewrite `messages/page.tsx`: default `getMessages(guildId)`(+channels) → `<MessagesView>`; client spine + entries.
- **T9.2** Delete `messages/message-card.tsx`.
- **T9.3** Rewrite `messages/message-list.tsx`: left timeline spine + right severity-tick entries (`surface` + `border-l-2` lime/amber/vermilion, motion spring tick), `layout` reflow.
- **T9.4** Rewrite `messages/message-detail.tsx` → `.surface`.
- **T9.5** Rewrite `messages/message-detail-view.tsx` → `.surface` pane.
- **T9.6** Rewrite `messages/ai-status-badge.tsx` → `primitives/Badge`.
- **T9.7** Rewrite `messages/ai-analysis-panel.tsx` → `.surface`.
- **T9.8** Rewrite `messages/attachments-grid.tsx` → `.surface` grid.
- **T9.9** Rewrite `messages/lightbox.tsx` → `primitives/Dialog`.
- **T9.10** Rewrite `messages/search-overlay.tsx` → console palette, type-in animation, `primitives/Dialog`.
- **T9.11** Verify no `components/ui/card` in messages tree; `npx tsc --noEmit`.

### PHASE 10 — Voice page + components
- **T10.1** Rewrite `voice/page.tsx`: default `getVoiceStatus()` → `<VoiceView>`; client `WebGLGuard`+`OrbField` hero + ribbon + tabs.
- **T10.2** Delete `voice/voice-connection-card.tsx`, `connection-card.tsx`, `microphone-card.tsx`.
- **T10.3** Rewrite `voice/speaker-waveform.tsx` → SVG ring / eq bars.
- **T10.4** Rewrite `voice/active-speakers-panel.tsx` → `.surface`.
- **T10.5** Rewrite `voice/activity-timeline.tsx` → `charts/SessionRibbon`.
- **T10.6** Rewrite `voice/mic-control.tsx` → `primitives/Button`.
- **T10.7** Rewrite `voice/listen-control.tsx` → `primitives/Button`.
- **T10.8** Verify `npx tsc --noEmit`; no `components/ui/card` in voice tree.

### PHASE 11 — Media page + components
- **T11.1** Rewrite `media/page.tsx`: default `getMediaStatus()` → `<MediaView>`; client turntable disc + transport + queue.
- **T11.2** Rewrite `media/music-player.tsx`: CSS-3D disc (spin-disc, pause when not playing, spring on play/pause), mono meta, `primitives/Button` transport, `.surface` queue rows with `layout`.
- **T11.3** Rewrite `media/mini-player.tsx` → compact `.surface`.
- **T11.4** Verify `npx tsc --noEmit`; no `components/ui/card` in media tree.

### PHASE 12 — Recordings page + components
- **T12.1** Rewrite `recordings/page.tsx`: default `getRecordings(50)` → `<RecordingsView>`; client rows `AnimatePresence`+`layout`, live `voice_recording_uploaded` prepend.
- **T12.2** Delete `recordings/recording-card.tsx`.
- **T12.3** Rewrite `recordings/recording-player.tsx` → `.surface` row + `charts/Waveform` + `primitives/Button`/`Dialog` play/delete.
- **T12.4** Verify `npx tsc --noEmit`.

### PHASE 13 — Moderation + Analysis pages
- **T13.1** Rewrite `moderation/page.tsx`: default `getModerationStats/Actions` → `<ModerationView>`; client vertical event-flow, live actions pulse-in.
- **T13.2** Rewrite `moderation/moderation-section.tsx` → event-flow, no Card/table.
- **T13.3** Rewrite `analysis/page.tsx`: client `<AnalysisView/>` terminal console (`primitives/Input` mono + blinking caret, `.surface` results staggered).
- **T13.4** Rewrite `analysis/search-panel.tsx` → terminal style.
- **T13.5** Verify `npx tsc --noEmit`.

### PHASE 14 — Chatbot + shared + final cleanup
- **T14.1** Rewrite `chatbot/chatbot-container.tsx` → `.surface`, keep drag/minimize.
- **T14.2** Rewrite `chatbot/chat-panel.tsx` → bubbles via `AnimatePresence`, `primitives/*`.
- **T14.3** Keep `chatbot/chatbot-context.tsx` + `index.ts`.
- **T14.4** Rewrite `shared/empty-state.tsx` → tonal.
- **T14.5** Rewrite `shared/error-state.tsx`.
- **T14.6** Rewrite `shared/loading-skeleton.tsx` → `primitives/Skeleton`.
- **T14.7** Rewrite `shared/error-boundary.tsx`.
- **T14.8** Rewrite `shared/guild-selector.tsx` → `primitives/Select`.
- **T14.9** `rm -rf src/components/ui && rm -f components.json`.
- **T14.10** `grep -rn "components/ui/\|@shadcn\|@base-ui\|recharts" src` → MUST be empty.
- **T14.11** `grep -rl "from \"recharts\"\|@base-ui\|@shadcn" src` → empty (double-check).
- **T14.12** Verify `npx tsc --noEmit` across whole `src`.

### PHASE 15 — Build + lint gate
- **T15.1** `cd services/frontend && npx tsc --noEmit` → 0 errors.
- **T15.2** `pnpm biome check` → fix all issues (no `any` in new files).
- **T15.3** `pnpm build` (standalone) → success, emits `.next/standalone/server.js`.
- **T15.4** Inspect `.next/static/chunks/` for three-heavy chunk loaded only on dashboard/voice; confirm NOT in `/dashboard/` initial SSR HTML.
- **T15.5** Confirm `pnpm-lock.yaml` present (reproducible flake install).
- **T15.6** `grep -c "0.52 0.17 215\|0.55 0.2 280" .next/static/css/*.css` → 0.

### PHASE 16 — Local runtime smoke test (no prod)
- **T16.1** Start local standalone: `GMW_BACKEND_URL=http://127.0.0.1:4001 PORT=4017 node .next/standalone/server.js &`.
- **T16.2** `curl -s -o /dev/null -w "%{http_code}"` for all 7 routes → 200.
- **T16.3** `curl /dashboard/ | grep -o "Bricolage\|signal\|surface"` → present.
- **T16.4** `curl /_next/static/css/*.css | grep "0.52 0.17 215\|0.55 0.2 280"` → empty.
- **T16.5** Headless browser `/dashboard/`+`/voice/` WebGL on: no console errors, `<canvas>` present, `<StaticFallback/>` NOT rendered.
- **T16.6** Same pages WebGL off: `<StaticFallback/>` renders, no crash.
- **T16.7** Kill local server. Do NOT touch prod unit.
- **T16.8** Confirm 7 routes 200 + no console errors in T16.5/16.6.

### PHASE 17 — Flake + staging deploy
- **T17.1** Inspect `flake.nix` frontend drv: `filterSource` ignores `out/.next/node_modules`; `pnpm-lock.yaml` included.
- **T17.2** `nix build .#gmw-frontend --impure --sandbox-off` → succeeds.
- **T17.3** `nix copy` frontend drv to VPS into staging profile (test port e.g. 4217).
- **T17.4** Create/adjust staging systemd unit with `PORT=4217` exported BEFORE `node server.js` (LIDM PORT bug).
- **T17.5** `sudo systemctl restart gmw-frontend-staging`; `curl` staging → 200.
- **T17.6** Browser-check staging `/dashboard/`+`/voice/` (3D visible, fallback test).
- **T17.7** Verify staging CSS has no old teal/purple; new design renders.

### PHASE 18 — Production swap (CONFIRM WITH USER FIRST)
- **T18.1** STOP — send staging screenshots/URL; await explicit approval before touching prod.
- **T18.2** On approval: `nix-env --profile /nix/var/nix/profiles/gmw-frontend --set <new-drv>`.
- **T18.3** Confirm `gmw-frontend.service` exports `PORT=4017` before exec.
- **T18.4** `sudo systemctl restart gmw-frontend`.
- **T18.5** `curl` all 7 routes on `https://imphnen.asepharyana.my.id` → 200.
- **T18.6** Browser verify prod: new design, old teal gone, 3D scenes render.
- **T18.7** `journalctl -u gmw-frontend -f` 5 min; confirm WS reconnect + live features.
- **T18.8** Notify user with before/after notes; keep rollback plan (`nix-env --set <previous>; systemctl restart`).

---

## Risks / Trade-offs
- **Scope:** 7 pages + charts + primitives + motion + 2 three scenes + layout. Big but mechanical; each task is isolated (~90 atomic tasks).
- **Bundle weight:** `three` adds ~150KB gz but ONLY on dashboard/voice routes (lazy chunk, `ssr:false`). `motion` ~35KB gz app-wide — acceptable.
- **WebGL compatibility:** covered by `WebGLGuard` + static fallback. Old devices / strict privacy browsers never blank.
- **Motion excess:** risk of "AI-generated" scattered animation. Guard: one signature moment per page, shared variants, reduced-motion gates.
- **Feature regressions:** Voice PCM playback, media transport, chatbot drag — logic preserved, only skin changes. Smoke test (T16) catches SSR breaks; live WS/3D needs real backend (staging T17).
- **Removed deps:** dropping `recharts`/`sonner`/`cmdk` means rewriting charts + toasts + search palette — accounted for in Phases 3/5/9.
- **Next standalone PORT bug:** `server.js` may not read `PORT` — ensure unit exports `PORT=4017` before exec (T17.4/T18.3).
- **three + React 19:** raw three avoids R3F compat surface; lifecycle (dispose + RAF) handled in T6.2.
- **next-themes:** keep (light/dark toggle); default dark.

## Open questions (answer before T18)
- Q1: Deploy to prod now or staging-only first? (Recommend staging + screenshot review.)
- Q2: Keep `react-day-picker`/`embla` if any page still needs them? (Plan assumes no — verify in T14.10 grep.)
- Q3: Any brand name/wordmark change from "Discord Automod"? (Keep "Bete" identity unless told.)
- Q4: 3D depth — full 3D scenes on dashboard+voice as specced, or also a 3D accent on media (disc)? (Default: dashboard+voice only; media disc stays CSS 3D.)
