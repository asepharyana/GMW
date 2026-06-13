# Design Tokens — Bete Frontend

## Table of Contents

1. [CSS Custom Properties (OKLCH)](#1-css-custom-properties-oklch)
2. [Z-Index Registry](#2-z-index-registry)
3. [Spacing & Layout Patterns](#3-spacing--layout-patterns)
4. [Typography](#4-typography)
5. [Animation Keyframes](#5-animation-keyframes)
6. [Animation Utility Classes](#6-animation-utility-classes)
7. [Framer Motion Presets](#7-framer-motion-presets)
8. [GSAP Page Transitions](#8-gsap-page-transitions)
9. [Card Pattern](#9-card-pattern)
10. [Stagger Animation Pattern](#10-stagger-animation-pattern)
11. [Component Patterns & Variants](#11-component-patterns--variants)
12. [Reduced-Motion Handling](#12-reduced-motion-handling)
13. [Known Issues & Technical Debt](#13-known-issues--technical-debt)

---

## 1. CSS Custom Properties (OKLCH)

Defined in `styles.css` on `:root`. All use the OKLCH color space (`lightness chroma hue`). Consumed via `oklch(var(--name))` in CSS and `oklch(var(--name))` in the Tailwind config (`tailwind.config.js`).

### Surface Colors

| Variable               | OKLCH Value              | Description                        |
|------------------------|--------------------------|------------------------------------|
| `--background`         | `1 0 0`                  | Page background (white)            |
| `--foreground`         | `0.141 0.005 285.823`    | Body text (near-black)             |
| `--card`               | `1 0 0`                  | Card surface (white)               |
| `--card-foreground`    | `0.141 0.005 285.823`    | Card text (near-black)             |
| `--border`             | `0.92 0.004 286.32`      | Default border                     |
| `--input`              | `0.92 0.004 286.32`      | Input border (same as `--border`)  |

### Interaction Colors

| Variable               | OKLCH Value              | Description                        |
|------------------------|--------------------------|------------------------------------|
| `--primary`            | `0.623 0.214 259.815`    | Primary accent (blue)              |
| `--primary-soft`       | `0.92 0.04 259.815`      | Soft primary background            |
| `--primary-foreground` | `0.97 0.014 254.604`     | Text on primary (near-white)       |
| `--secondary`          | `0.967 0.001 286.375`    | Secondary surface (light gray)     |
| `--secondary-foreground`| `0.21 0.006 285.885`    | Text on secondary                  |
| `--muted`              | `0.967 0.001 286.375`    | Muted surface (same as secondary)  |
| `--muted-foreground`   | `0.552 0.016 285.938`    | Muted text (medium gray)           |
| `--accent`             | `0.967 0.001 286.375`    | Accent surface                     |
| `--accent-foreground`  | `0.21 0.006 285.885`     | Text on accent                     |
| `--destructive`        | `0.577 0.245 27.325`     | Destructive action (reddish)       |
| `--destructive-foreground`| `0.97 0.014 254.604`  | Text on destructive                |

### Semantic / Effect Colors

| Variable                 | OKLCH Value                   | Description                          |
|--------------------------|-------------------------------|--------------------------------------|
| `--ring`                 | `0.623 0.214 259.815`         | Focus ring (same as primary)         |
| `--radius`               | `1rem`                        | Border radius base                   |
| `--primary-glow`         | `0.623 0.214 259.815 / 0.15`  | Primary glow backdrop-filter orb      |
| `--accent-glow`          | `0.552 0.016 285.938 / 0.15`  | Accent glow                          |
| `--card-shadow`          | `0.92 0.004 286.32 / 0.3`     | Card box-shadow color                |

### Tailwind Config Mapping

All custom properties are wired into the Tailwind theme under `theme.extend.colors`:

```js
colors: {
  border:        "oklch(var(--border))",
  input:         "oklch(var(--input))",
  ring:          "oklch(var(--ring))",
  background:    "oklch(var(--background))",
  foreground:    "oklch(var(--foreground))",
  "primary-soft":"oklch(var(--primary-soft))",
  "primary-glow":"oklch(var(--primary-glow))",
  "accent-glow": "oklch(var(--accent-glow))",
  primary:       { DEFAULT: "oklch(var(--primary))", foreground: "oklch(var(--primary-foreground))" },
  secondary:     { DEFAULT: "oklch(var(--secondary))", foreground: "oklch(var(--secondary-foreground))" },
  muted:         { DEFAULT: "oklch(var(--muted))", foreground: "oklch(var(--muted-foreground))" },
  accent:        { DEFAULT: "oklch(var(--accent))", foreground: "oklch(var(--accent-foreground))" },
  destructive:   { DEFAULT: "oklch(var(--destructive))", foreground: "oklch(var(--destructive-foreground))" },
  card:          { DEFAULT: "oklch(var(--card))", foreground: "oklch(var(--card-foreground))" },
},
borderRadius: {
  lg: "var(--radius)",           // 1rem
  md: "calc(var(--radius) - 2px)", // 0.875rem
  sm: "calc(var(--radius) - 4px)", // 0.75rem
},
```

### Color vs. Variable Hardcoding

**Prefer CSS variables**. The following are supposed to use CSS vars but are **hardcoded to Tailwind utility colors** — see [Known Issues §13.1](#131-hardcoded-utility-colors--no-css-var).

---

## 2. Z-Index Registry

All stacking contexts in the application, inventoried from `*.tsx` and `*.css` files.

| Value     | Owner                    | Context / Location                              |
|-----------|--------------------------|-------------------------------------------------|
| `-1`      | `ParticleBackground.tsx`  | Inline `style={{ zIndex: -1 }}` — decorative orbs sit behind all content |
| `10`      | `Header.tsx`             | Class `sticky top-0 z-10` — sticky page header  |
| `50`      | `Sidebar.tsx` line 110   | Class `relative z-50` — mascot chatbot toggle button |
| `50`      | `MobileTabBar.tsx`       | Class `fixed bottom-0 left-0 right-0 z-50` — mobile bottom nav |
| `50`      | `toast.tsx`              | Class `fixed bottom-4 right-4 z-50` — toast notification container |
| `[9999]`   | `Sidebar.tsx` line 122   | Class `fixed bottom-[170px] left-[80px] z-[9999]` — MascotChatbot floating panel |

### Stacking Order (bottom to top)

1. **Layer -1**: Particle background orbs (`ParticleBackground`)
2. **Layer 0**: Main page content, sidebar, cards
3. **Layer 10**: Sticky header (`Header`)
4. **Layer 50**: Toast container, mobile tab bar, mascot toggle button
5. **Layer 9999**: Mascot chatbot floating panel

**Note**: There is no established z-index scale. Values 20, 30, 40 are unused. The arbitrary `z-[9999]` for the chatbot is an outlier — future additions should use a defined scale (e.g., 10/20/30/40/50/100) rather than arbitrary large numbers.

---

## 3. Spacing & Layout Patterns

### Page Layout

```
DashboardLayout
  ├── ParticleBackground        (fixed inset-0)
  ├── grid-pattern overlay      (fixed inset-0, pointer-events-none)
  │
  └── flex container            (relative flex min-h-screen)
       ├── Sidebar              (shrink-0, w-16 collapsed / w-64 expanded, hidden on <md)
       │
       └── main                 (flex-1, min-w-0)
            ├── Header          (sticky top-0 z-10, px-4 md:px-8)
            │   └── flex items-center justify-between
            │        ├── h1 + subtitle (left)
            │        └── WS/Voice badges (right)
            │
            │   (under md) MobileTabBar (fixed bottom-0 z-50)
            │
            └── main content    (flex-1 overflow-auto, p-4 md:p-6 lg:p-8)
```

### Common Padding Values

| Context          | Class Pattern               | Notes                        |
|------------------|-----------------------------|------------------------------|
| Card container   | `p-6`                       | CardContent / CardHeader     |
| Card content     | `p-6 pt-0` (or `p-4`)      | `pt-0` when following header |
| Card footer      | `p-6 pt-0` + `flex`        |                              |
| Page content     | `p-4 md:p-6 lg:p-8`        | Responsive scaling           |
| Header           | `px-4 py-4 md:px-8`        |                              |
| Sidebar          | `px-2` (nav items)          |                              |
| Sub-panels       | `p-4`                       | Music, Screen, etc.          |
| Mascot chat      | `p-4` (messages), `p-3` (input) |                         |

### Common Gap Values

| Pattern         | Usage                                      |
|----------------|--------------------------------------------|
| `gap-3`        | Sidebar nav items, message card avatar+text, recording items, feed groups |
| `gap-4`        | Stat card grid (>sm), user card 2-col, user detail layout |
| `gap-6`        | Top-level panel sections (dashboard, live)  |
| `gap-2`        | Filter badges, button groups, message row indicators, toast container |
| `space-y-1`    | Compact text+value pairs                   |
| `space-y-2`    | Active speakers list, recording list, message metadata blocks |
| `space-y-3`    | Message feed items, skeleton groups        |
| `space-y-4`    | Auth form, music panel                     |
| `space-y-6`    | User profile detail sections               |

### Responsive Grid Breakpoints

- `sm:grid-cols-2` — stat cards, user cards, recordings cards
- `lg:grid-cols-4` — stat summary cards
- `xl:grid-cols-3`, `2xl:grid-cols-4` — image grid
- `xl:grid-cols-[1fr_320px]` — live audio + sidebar layout
- `md:grid-cols-2` — voice connection guild/channel selects
- `md:grid-cols-3` — moderation queue stat cards

---

## 4. Typography

### Font Family

```css
font-family: Poppins, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Defined in `styles.css` and `tailwind.config.js` under `theme.extend.fontFamily.sans`.

### Type Scale

| Class           | Used For                                   |
|----------------|--------------------------------------------|
| `text-[10px]`  | Badge text, filter labels, status chips    |
| `text-[11px]`  | Message timestamps, edited/deleted indicators, action hints |
| `text-[12px]`  | AI analysis body text                      |
| `text-xs`      | Captions, descriptions, metadata, secondary info, badge text |
| `text-sm`      | Body text, card descriptions, message content, form labels |
| `text-base`    | Card titles (sometimes), live audio heading |
| `text-lg`      | Section headings, stat values              |
| `text-xl`      | Page title (`h1`)                          |
| `text-2xl`     | Stat card values, moderation queue numbers |

### Font Weights

| Weight          | Usage                                      |
|-----------------|--------------------------------------------|
| `font-medium`   | Sidebar items, timestamps, badge text, section labels, queue items |
| `font-semibold` | CardTitle, user names, tracking-tight headings |
| `font-bold`     | Page titles, stat values, key numbers      |

### Tracking

- `tracking-tight`: CardTitle, page `h1`
- `tracking-wider`: Image grid kind badges

### Font Mono

- `font-mono`: Channel IDs, user IDs

---

## 5. Animation Keyframes

### Defined in `styles.css`

```css
@keyframes bar-pulse {
  0%, 100% { transform: scaleY(0.8); }
  50%      { transform: scaleY(1.2); }
}

@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

### Defined in `tailwind.config.js` only (`glowPulse`)

```js
keyframes: {
  glowPulse: {
    "0%, 100%": { opacity: "0.4" },
    "50%":      { opacity: "0.8" },
  },
},
```

**Note**: `glowPulse` is NOT defined in `styles.css`. It only exists in `tailwind.config.js` and is used by `ParticleBackground.tsx` via the class `animate-glow-pulse`. This works because Tailwind 4 uses the JS config for keyframes, but the CSS file is the canonical keyframe source. This is a **latent inconsistency** — see Known Issues §13.3.

### Animation Timings Summary

| Keyframe       | Duration | Timing Function        | Used In                        |
|----------------|----------|------------------------|--------------------------------|
| bar-pulse      | 0.4s     | ease-in-out            | AudioVisualizer (via CSS class)|
| shimmer        | 1.5s (CSS) / 2s (TW config) | ease-in-out | Skeleton loading components    |
| fadeInUp       | 0.5s     | ease-out               | Utility class `.animate-fade-in-up` |
| fadeIn         | 0.3s     | ease-out               | Utility class `.animate-fade-in` |
| glowPulse      | 3s       | ease-in-out            | ParticleBackground glow orbs   |

**Mismatch**: `shimmer` duration is `1.5s` in `styles.css` but `2s` in `tailwind.config.js`. The CSS class `.animate-shimmer` is used by `Skeleton.tsx`, so the CSS definition wins.

---

## 6. Animation Utility Classes

Defined in `styles.css` under `@layer utilities`:

| Class                | Animation                    | Purpose                        |
|----------------------|------------------------------|--------------------------------|
| `.animate-fade-in-up`| `fadeInUp 0.5s ease-out`     | Entry animation for elements   |
| `.animate-fade-in`   | `fadeIn 0.3s ease-out`       | Simple fade-in                 |
| `.animate-bar-pulse` | `bar-pulse 0.4s ease-in-out infinite` | Audio visualizer bars (transform-origin: bottom) |
| `.animate-shimmer`   | `shimmer 1.5s ease-in-out infinite` | Skeleton loading placeholder (gradient sweep) |

Tailwind config also registers `animate-glow-pulse` (`glowPulse 3s ease-in-out infinite`).

**Usage**: `Skeleton` component uses `animate-shimmer`. Inline `animate-spin` (Tailwind built-in) is used for loading spinners on re-analyze buttons.

---

## 7. Framer Motion Presets

All defined in `shared/hooks/useFramerStagger.ts`.

### `cardStagger` — Parent container variant
```ts
{
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}
```

### `cardItem` — Child item (fade + slide up)
```ts
{
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1, y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
}
```

### `fadeSlideUp` — Single element (cubic-bezier)
```ts
{
  initial: { opacity: 0, y: 24 },
  animate: {
    opacity: 1, y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
}
```
Used by `Header.tsx` (key=activeTab) and `DashboardLayout.tsx` (main content area, key=activeTab).

### `fadeIn` — Simple opacity
```ts
{
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
}
```

### `scaleIn` — Badge/pill entrance
```ts
{
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "backOut" } },
}
```

### `springUp` — Emphasized entrance
```ts
{
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } },
}
```

### Usage Pattern

```tsx
<motion.div variants={cardStagger} initial="initial" animate="animate">
  <motion.div variants={cardItem}>...</motion.div>
  <motion.div variants={cardItem}>...</motion.div>
</motion.div>
```

---

## 8. GSAP Page Transitions

### `useGsapTransition` (`shared/hooks/useGsapTransition.ts`)

A custom hook for tab-level page transitions, used by `AuthOverlay.tsx`.

**Page enter animation**:
- Container: opacity 0→1, y 20→0, `duration: 0.4`, `ease: "power2.out"`
- Stagger children: querySelectorAll `[data-stagger]`, `duration: 0.3`, `stagger: 0.05`
- Reduced motion: all durations set to 0

**Page exit animation** (returns Promise):
- Container: opacity→0, y→20, `duration: 0.3`, `ease: "power2.in"`

**Card hover helper** (`gsapCardHover`):
```ts
onMouseEnter: gsap.to(target, { y: -4, boxShadow: "0 8px 25px rgba(0,0,0,0.15)", duration: 0.2 })
onMouseLeave: gsap.to(target, { y: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", duration: 0.2 })
```
(Exported but unused in current components — kept as utility.)

---

## 9. Card Pattern

### Base `Card` component (`shared/ui/card.tsx`)

```
rounded-xl border border-border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow
```

### Composition

| Sub-component  | Classes                      | Notes                          |
|----------------|------------------------------|--------------------------------|
| `Card`         | See above                    | `transition-shadow` for hover  |
| `CardHeader`   | `flex flex-col space-y-1.5 p-6` |                          |
| `CardTitle`    | `font-semibold leading-none tracking-tight` | `h3` element     |
| `CardDescription` | `text-sm text-muted-foreground` | `p` element              |
| `CardContent`  | `p-6 pt-0`                   | `pt-0` to collapse with header |
| `CardFooter`   | `flex items-center p-6 pt-0` |                               |

### Common Card Variants

| Context          | Additional Classes                                  |
|------------------|-----------------------------------------------------|
| Stat card        | `CardContent p-4` (compact)                         |
| Dashboard stat   | `overflow-hidden`                                   |
| Message card     | `group hover:border-primary/30 hover:shadow-md`     |
| Auth card        | `w-full max-w-md border-primary/30 shadow-lg shadow-primary/10` |
| Error/empty card | `border-dashed border-destructive` (error state)    |
| User card        | `hover:ring-1 hover:ring-primary/30 cursor-pointer` |
| Media queue item | `rounded-lg border-l-2 border-l-primary border-border` |

### Empty State Pattern

```tsx
<div className="flex flex-col items-center gap-4 py-12">
  <MascotImage size="md" className="opacity-60" />
  <p className="text-sm text-muted-foreground">No data to display</p>
</div>
```
Wrapped in `EmptyStateMascot` component. Also used via standalone icon pattern:
```tsx
<div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
  <BarChart3 className="h-10 w-10" />
  <p className="text-sm">No data available yet.</p>
</div>
```

### Skeleton Loading Pattern

```tsx
<Skeleton className="rounded-lg bg-muted animate-shimmer" />
```
Used in `.animate-shimmer` containers matching real card layout. See `MessageCardSkeleton`, `StatsSkeleton`, `UserListSkeleton`, `DetailSkeleton`, `ActiveSpeakersSkeleton`.

---

## 10. Stagger Animation Pattern

### Framer Motion (primary, used in panels)

Applied as `cardStagger` / `cardItem` pair on every major panel:

| Panel                | File                             |
|----------------------|----------------------------------|
| LivePanel            | `features/live/index.tsx`        |
| MessagesPanel        | `features/messages/index.tsx`    |
| DashboardStatsContent| `features/dashboard/components/DashboardStats.tsx` |
| UserSummaryList      | `features/dashboard/components/UserSummaryList.tsx` |
| UserProfileDetail    | `features/dashboard/components/UserProfileDetail.tsx` |
| MessageFeed          | `features/messages/components/MessageFeed.tsx` |

**Timing**: stagger 80ms, delayChildren 100ms, item duration 400ms.

### GSAP (used in auth flow)

`useGsapTransition` with `[data-stagger]` attributes. Stagger 50ms, duration 300ms.

---

## 11. Component Patterns & Variants

### Button (`shared/ui/button.tsx`)

**Variants**: `default`, `secondary`, `destructive`, `outline`, `ghost`
**Sizes**: `default` (h-10), `sm` (h-9), `lg` (h-11), `icon` (h-10 w-10)

Base classes:
```
inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium
transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50
```

| Variant      | Background                            |
|--------------|---------------------------------------|
| default      | `bg-primary text-primary-foreground shadow-sm hover:bg-primary/90` |
| secondary    | `bg-secondary text-secondary-foreground hover:bg-secondary/80`     |
| destructive  | `bg-destructive text-destructive-foreground hover:bg-destructive/90` |
| outline      | `border border-input bg-background hover:bg-accent hover:text-accent-foreground` |
| ghost        | `hover:bg-accent hover:text-accent-foreground` |

### Badge (`shared/ui/badge.tsx`)

**Variants**: `default`, `secondary`, `destructive`, `outline`, `success`, `warning`

Base classes:
```
inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors
```

| Variant    | Classes (uses CSS vars where possible)               |
|------------|------------------------------------------------------|
| default    | `bg-primary text-primary-foreground`                 |
| secondary  | `bg-muted text-muted-foreground`                     |
| destructive| `bg-destructive/15 text-destructive`                 |
| outline    | `border-border text-foreground`                      |
| success    | `bg-emerald-100 text-emerald-700` **[HARDCODED]**    |
| warning    | `bg-amber-100 text-amber-700` **[HARDCODED]**        |

### Input (`shared/ui/input.tsx`)

```
flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground
ring-offset-background placeholder:text-muted-foreground
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
disabled:cursor-not-allowed disabled:opacity-50
```

### Select (`shared/ui/select.tsx`)

Same visual treatment as Input (`flex h-10 w-full rounded-lg border border-input bg-background ...`).

### Skeleton (`shared/ui/skeleton.tsx`)

```
rounded-lg bg-muted animate-shimmer
```

### Tabs (`shared/ui/tabs.tsx`)

Wraps Radix `TabsPrimitive`:

| Component     | Key Classes                                               |
|---------------|-----------------------------------------------------------|
| `TabsList`    | `inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground` |
| `TabsTrigger` | `inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all ... data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm` |
| `TabsContent` | `mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` |

### Toast (`shared/ui/toast.tsx`)

Context-based system with `addToast` / `removeToast`. Auto-dismiss after 4s.

Container: `fixed bottom-4 right-4 z-50 flex flex-col gap-2`

Type styles:

| Type    | Border-left class               | Icon color         |
|---------|----------------------------------|--------------------|
| info    | `border-l-primary`               | `text-primary`     |
| success | `border-l-emerald-500`           | `text-emerald-500` |
| error   | `border-l-destructive`           | `text-destructive` |
| warning | `border-l-amber-500`             | `text-amber-500`   |

**Note**: `emerald-500` and `amber-500` are hardcoded Tailwind utilities — see Known Issues.

### Glass Card (utility, `styles.css`)

```css
.glass-card {
  @apply bg-white/70 backdrop-blur-sm border border-[oklch(0.92_0.004_286.32)] rounded-xl;
}
```

### Grid Pattern (utility, `styles.css`)

```css
.grid-pattern {
  background-image:
    linear-gradient(oklch(0.92 0.004 286.32 / 0.3) 1px, transparent 1px),
    linear-gradient(90deg, oklch(0.92 0.004 286.32 / 0.3) 1px, transparent 1px);
  background-size: 40px 40px;
}
```
Applied in `DashboardLayout.tsx` at `opacity-[0.03]`.

### Gradient Text

```css
.gradient-text {
  @apply bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-400;
}
```
Used in `Header.tsx` for the "IMPHNEN" brand text.

---

## 12. Reduced-Motion Handling

Three layers of protection:

### 1. CSS Level (`styles.css`)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 2. GSAP Hook (`useGsapTransition`)

```ts
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```
Passes `instant` flag → all durations set to 0, stagger set to 0.

### 3. Particle Background (`ParticleBackground.tsx`)

```tsx
const [reducedMotion, setReducedMotion] = useState(false);
useEffect(() => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  setReducedMotion(mq.matches);
  // listener for changes...
}, []);
if (reducedMotion) return null; // Entire particle layer removed
```

### Coverage Gap

Framer Motion `AnimatePresence` and `motion` components (used extensively in MessageFeed, LivePanel, DashboardStats, UserSummaryList, UserProfileDetail, MascotChatbot) do **not** check `prefers-reduced-motion`. They rely solely on the CSS override. While the CSS `!important` rules do suppress Framer Motion animations (since they run via inline styles that get overridden), this is a fragile approach — some Framer Motion `transition` properties (spring physics, stagger delays) may not be fully neutralized by the CSS blanket rule.

---

## 13. Known Issues & Technical Debt

### 13.1 Hardcoded Utility Colors — Not Using CSS Variables

Several components bypass the OKLCH custom property system and use Tailwind's built-in `emerald-*`, `amber-*`, `red-*`, `blue-*`, `orange-*`, `yellow-*`, `violet-*`, `cyan-*`, `purple-*`, `sky-*`, `pink-*` utility classes directly. These will not respond to theme changes.

**Locations**:

| File(s)                                   | Hardcoded Colors Used                      |
|-------------------------------------------|--------------------------------------------|
| `shared/ui/badge.tsx`                     | `bg-emerald-100 text-emerald-700` (success variant), `bg-amber-100 text-amber-700` (warning variant) |
| `shared/ui/toast.tsx`                     | `border-l-emerald-500`, `text-emerald-500`, `border-l-amber-500`, `text-amber-500` |
| `shared/ui/button.tsx`                    | None (uses CSS vars correctly)             |
| `features/dashboard/components/DashboardStats.tsx` | `text-emerald-500`, `bg-emerald-100`, `text-blue-500`, `bg-blue-100`, `text-violet-500`, `bg-violet-100`, `text-emerald-600`, `bg-cyan-100`, `text-cyan-500`, `text-amber-500`, `bg-amber-100` |
| `features/dashboard/components/UserSummaryList.tsx` | `bg-emerald-100 text-emerald-700`, `bg-amber-100 text-amber-700`, `bg-red-100 text-red-700` |
| `features/dashboard/components/UserProfileDetail.tsx` | `bg-red-100 text-red-700`, `bg-emerald-100 text-emerald-700`, `bg-amber-100 text-amber-700`, `text-emerald-600` |
| `features/messages/components/MessageCard.tsx` | `bg-red-100 text-red-700 border-red-200`, `bg-orange-100 text-orange-700 border-orange-200`, `bg-yellow-100 text-yellow-700 border-yellow-200`, `bg-blue-100 text-blue-700 border-blue-200`, `bg-emerald-50/40`, `border-l-emerald-400`, `bg-pink-50/40`, `border-l-pink-400`, `text-pink-600`, `text-pink-600/70` |
| `features/messages/components/MessagesPanel.tsx` | `bg-emerald-100 text-emerald-700 border-emerald-200`, `bg-orange-100 text-orange-700 border-orange-200`, `bg-red-100 text-red-700 border-red-200`, `text-emerald-600` |
| `features/messages/components/ImageGrid.tsx` | `bg-purple-100 text-purple-700 border-purple-200` |
| `features/live/components/ActiveSpeakers.tsx` | `text-emerald-700` |
| `features/live/components/RecordingsSubPanel.tsx` | `border-sky-200 bg-white` |
| `features/live/components/NowPlaying.tsx` | (uses Badge `success`/`warning` variants, which are hardcoded) |
| `widgets/Header.tsx`                      | `bg-emerald-400`, `bg-red-400`, `bg-gray-400`, `text-emerald-400`, `text-red-400` |

**Fix**: Replace with CSS variable-based tokens, e.g.:
- `emerald-100` → `oklch(var(--success-bg))` (would need new custom property)
- `text-emerald-700` → `oklch(var(--success-fg))`
- `border-emerald-200` → `oklch(var(--success-border))`

### 13.2 `formatTimeAgo` Forces Re-render on Every Tick

In `features/messages/components/MessageCard.tsx`:

```ts
function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  // ...
}
```

`Date.now()` is called on every render, not via a periodic timer. This means the "X s ago" / "X m ago" labels are only accurate at the moment of render and do not update reactively. No `useEffect` interval keeps them fresh. Once rendered, a "5s ago" label will stay stale until a parent re-render. This is acceptable for a message feed that re-renders on new data, but inaccurate for pinned/static views.

**Fix**: Either (a) accept staleness (current behavior, simplest), (b) add a `useEffect` interval that forces re-render every ~30s, or (c) use `useSyncExternalStore` with a global ticker.

### 13.3 `AudioVisualizer.tsx` — Hardcoded IMPHNEN Gradient

```ts
const gradient = ctx.createLinearGradient(0, 0, 0, height);
gradient.addColorStop(0, "#23a1eb");
gradient.addColorStop(1, "#3eb0f2");
```

These hex values (IMPHNEN blue `#23a1eb` → `#3eb0f2`) are hardcoded and do not reference the OKLCH `--primary` CSS variable. A theme change would not affect the visualizer.

**Fix**: Read CSS custom property at paint time:
```ts
const primaryColor = getComputedStyle(document.documentElement)
  .getPropertyValue("--primary").trim();
// Convert OKLCH to hex or use Canvas oklch() if available
```

### 13.4 `glow-pulse` Keyframe Fragmentation

The `glowPulse` keyframes are defined in `tailwind.config.js` but NOT in `styles.css`. The class `animate-glow-pulse` is referenced by `ParticleBackground.tsx`. Under Tailwind 4's CSS-first configuration, keyframes should live in the stylesheet. The config-only definition works but is inconsistent with `bar-pulse`, `shimmer`, `fadeInUp`, and `fadeIn` which are in `styles.css`.

**Fix**: Move `@keyframes glowPulse { ... }` into `styles.css`.

### 13.5 `shimmer` Duration Mismatch

`styles.css`: `animation: shimmer 1.5s ease-in-out infinite`
`tailwind.config.js`: `shimmer: "shimmer 2s linear infinite"` (also uses `linear` vs. `ease-in-out`)

The CSS class `.animate-shimmer` (used by `Skeleton.tsx`) references the CSS-based keyframe, so `1.5s ease-in-out` is the actual runtime value. The Tailwind config value is dead unless used via `animate-shimmer` as a Tailwind class name — which maps to `shimmer 2s linear infinite`.

**Fix**: Align both sources. Pick one canonical definition.

### 13.6 Z-Index Scale Not Formalized

No defined z-index scale or Sass/CSS variables. Values jump from 50 to 9999. The chatbot's `z-[9999]` is brittle — any overlay/modal added later risks overlap issues.

**Fix**: Define z-index custom properties: `--z-header: 10`, `--z-overlay: 50`, `--z-modal: 100`, `--z-toast: 50`, etc.

### 13.7 Toast Container z-index Collision

Toast container (`z-50`) and MobileTabBar (`z-50`) at same z-index. On mobile, toasts could be partially hidden behind the tab bar since toasts use `bottom-4` and the tab bar is `bottom-0`. In practice the toast gap prevents overlap, but this is fragile.

### 13.8 Retro `bg-white` Usage

`RecordingsSubPanel.tsx` uses `bg-white` (line 86) instead of `bg-card`. This will not respect a dark theme if one is added.

---

## Appendix: File Map

| Token / Concern            | Canonical Source                             |
|---------------------------|----------------------------------------------|
| CSS custom properties     | `styles.css`                                 |
| Tailwind theme extension  | `tailwind.config.js`                         |
| Framer Motion variants    | `shared/hooks/useFramerStagger.ts`           |
| GSAP transition hook      | `shared/hooks/useGsapTransition.ts`          |
| `cn()` utility            | `shared/lib/utils.ts`                        |
| Card component            | `shared/ui/card.tsx`                         |
| Button component          | `shared/ui/button.tsx`                       |
| Badge component           | `shared/ui/badge.tsx`                        |
| Input component           | `shared/ui/input.tsx`                        |
| Select component          | `shared/ui/select.tsx`                       |
| Skeleton component        | `shared/ui/skeleton.tsx`                     |
| Tabs component            | `shared/ui/tabs.tsx`                         |
| Toast component           | `shared/ui/toast.tsx`                        |
| ScrollArea component      | `shared/ui/scroll-area.tsx`                  |
| ParticleBackground        | `widgets/particles/ParticleBackground.tsx`   |
| DashboardLayout           | `widgets/DashboardLayout.tsx`                |
