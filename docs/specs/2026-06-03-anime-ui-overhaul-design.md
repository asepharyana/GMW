# Anime UI Overhaul — Frontend Redesign

**Date:** 2026-06-03
**Status:** Approved
**Author:** Claude Code / brainstorm session
**Related:** `docs/specs/2026-06-01-frontend-major-refactor-design.md`

## Overview

Complete visual overhaul of the GMW frontend (`/mnt/code/bete/services/frontend`) from dark cyberpunk to **light anime aesthetic** with white + sky blue (`#7EC8E3`) as primary colors. Full "kawaii cyber" approach with Three.js particles, GSAP animations, Framer Motion transitions, and anime-style mascot/illustrations.

## Mood Board

- **Vibe:** Fresh, cute, playful, clean — like an anime profile page meets monitoring dashboard
- **Primary colors:** White `#FFFFFF` + Sky Blue `#7EC8E3` + Soft Pink accent `#FF8FAB`
- **Typography:** Rounded, light, airy — Inter with loose letter-spacing
- **Shapes:** Extra rounded corners (16-20px), soft shadows with sky-blue tint
- **Animations:** Bouncy spring transitions, floating particles, page fade/slide

## Tech Stack Additions

| Library | Purpose |
|---------|---------|
| `three` | 3D particle background (sakura, sparkles) |
| `@react-three/fiber` | React wrapper for Three.js |
| `@react-three/drei` | Utility helpers for R3F |
| `gsap` | Page transitions, scroll-triggered effects, complex timelines |
| `framer-motion` | Component mount/unmount, card stagger, layout animations |

All existing dependencies preserved (React 19, Tailwind 4, TanStack Query, Lucide, Radix).

## Color System

```css
:root {
  --bg: 0 0% 98%;
  --bg-secondary: 210 40% 96%;
  --fg: 222 20% 12%;
  --fg-muted: 215 20% 45%;
  --primary: 199 80% 50%;          /* #7EC8E3 sky blue */
  --primary-soft: 199 80% 90%;
  --primary-glow: 199 80% 70% / 0.25;
  --card: 0 0% 100%;
  --card-shadow: 0 8px 32px hsl(199 50% 60% / 0.1);
  --border: 199 30% 85%;
  --accent: 340 80% 65%;           /* soft pink */
  --accent-glow: 340 80% 70% / 0.2;
  --radius: 1rem;                  /* 16px base */
}
```

## Layout

```
┌─────────┬─────────────────────────────────────────┐
│         │  Header (transparent, sticky)            │
│ Sidebar │  ┌─ tab title ──── [WS] [Voice] ──────┐ │
│ 64px    │  │ subtitle                            │ │
│ icon-   │  └─────────────────────────────────────┘ │
│ only    │                                           │
│         │  Main Content Area                        │
│ [🌟]    │  ┌───────────────────┬───────────────┐   │
│ [💬]    │  │ Card              │ Card           │   │
│ [📊]    │  │                   │                │   │
│         │  └───────────────────┴───────────────┘   │
│  🐱     │  ┌───────────────────────────────────┐   │
│ chibi   │  │ Card (full width)                  │   │
│ mascot  │  └───────────────────────────────────┘   │
└─────────┴─────────────────────────────────────────┘

Background: Three.js particle canvas (z-index: -1)
All content above particles
```

## Component Tree

### Sidebar (`widgets/Sidebar.tsx`)
- Collapsed by default (64px) — icon-only
- Icons: custom anime-style or Lucide icons
- Active tab: sky-blue soft bg + glow ring
- GSAP hover: translateX(2px) + spring scale
- Bottom: chibi mascot avatar (CSS art or SVG)
- Framer Motion layout animation when switching

### Header (`widgets/Header.tsx`)
- Transparent, barely visible border-bottom
- Left: animated tab title + subtitle
- Right: status badges (WS green dot + Voice) — cute style
- Avatar placeholder with anime border

### Cards (all shared/ui and feature components)
- White bg, sky-blue border, 16px radius
- Soft shadow with sky-blue tint
- GSAP hover: lift +4px, shadow deepens
- Framer Motion: stagger entrance when tab changes
- Inside: playful headings, pastel accents

### Empty States
- Chibi mascot illustration (CSS-drawn character)
- Playful text: "No speakers yet... 🎤✨"
- Subtle bounce animation on the mascot

## Three.js Particles

- **Layer:** z-index: -1, pointer-events: none, fixed position
- **Elements:** Floaty sakura petals (pink soft) + sparkles (white/sky blue)
- **Behavior:** Slow drift downward, slight mouse interaction (gentle pull)
- **Performance:** `useFrame` optimized, max ~50 particles, auto-pause when tab hidden
- **Implementation:** `@react-three/fiber` Canvas with custom `Particles` component

## Animations (GSAP + Framer Motion)

### GSAP
- **Page transitions:** tab switch → old content fades out (300ms) → new content slides up (400ms)
- **Timeline:** coordinated header + sidebar + content stagger
- **Hover effects:** card lift on `onMouseEnter`/`onMouseLeave`

### Framer Motion
- **Card stagger:** each card enters with 80ms delay, spring physics
- **Layout animations:** sidebar width, list reorder
- **AnimatePresence:** smooth mount/unmount for sub-panels
- **WhileHover:** cards, buttons, badges

## Features to Modify

### 1. Auth Page (`features/auth/index.tsx`)
- Center card with sky-blue gradient border
- Mascot next to lock icon
- Floating sparkle particles in background
- Input: rounded-xl, sky-blue focus ring
- GSAP entrance: card slides up + fade

### 2. Live Panel (`features/live/index.tsx`)
- VoiceConnectionCard: anime-styled select inputs, cute buttons with icons
- AudioVisualizer: keep but style with sky-blue/pink gradient bars
- ActiveSpeakers: avatar dengan anime-style border (double ring)
- NowPlaying: spinning record visual + anime equalizer bars
- Music/Screen/Recordings tabs: rounded cards with sky-blue accents

### 3. Messages Panel (`features/messages/index.tsx`)
- Search bar: rounded-full, sky-blue focus
- Filter buttons: pill-shaped, anime pastel colors
- MessageCard: avatar with anime border, content with rounded bg
- AI badges: cute tags (clean = green pastel, flagged = pink pastel)
- ImageGrid: masonry-like with sky-blue hover border

### 4. Analytics Panel (`features/analytics/index.tsx`)
- Summary cards: large number with sky-blue glow, small anime icon
- Charts: sky-blue + pink pastel gradients
- Tables: rounded rows, alternating pastel bg
- Loading skeletons: sky-blue shimmer animation

## Implementation Phases

### Phase 1: Foundation
1. Install new dependencies (`three`, `@react-three/fiber`, `@react-three/drei`, `gsap`, `framer-motion`)
2. Update `tailwind.config.js` with new color system
3. Rewrite `styles.css` with white/sky-blue theme
4. Create Three.js ParticleBackground component
5. Create shared animation hooks (`useGsapTransition`, `useFramerStagger`)

### Phase 2: Layout
6. Redesign `Sidebar.tsx` (collapsed icon-only, anime icons, mascot)
7. Redesign `Header.tsx` (transparent, anime status badges)
8. Redesign `DashboardLayout.tsx` (white bg, particle layer)
9. Add GSAP page transitions between tabs

### Phase 3: Components
10. Redesign shared UI: `card.tsx`, `button.tsx`, `badge.tsx`, `input.tsx`, `select.tsx`
11. Redesign `AuthOverlay` with anime styling
12. Redesign `VoiceConnectionCard` + `ActiveSpeakers` + `NowPlaying`
13. Redesign `MessageFeed` + `MessageCard` + `ImageGrid`
14. Redesign Analytics panel components

### Phase 4: Polish
15. Add Framer Motion stagger animations to all lists
16. Add empty states with mascot illustrations
17. Add loading animations (skeleton shimmer, pulse)
18. Final color/contrast pass for readability
19. Responsive check on mobile

## Edge Cases & States

### Loading States
- Skeletons: sky-blue gradient shimmer, rounded-xl
- Three.js particles: render behind skeleton, visible from second 0
- GSAP entrance: content fades in after skeleton → real content swap

### Empty States
- **No messages:** Chibi mascot waving "No messages yet~ 💬"
- **No speakers:** Mascot sleeping "Quiet in here... zzz 🌙"
- **No analytics data:** Mascot thinking "Not enough data, give me moar! 📊"
- **Auth locked:** Mascot peeking "Password please~ 🔒"

### Error States
- Error boundaries: pastel pink/red card with chibi crying mascot
- Network error: toast with cute sad face
- Retry button: bouncy animation on hover

### Edge Cases
- **Tab not visible:** Three.js pauses via `document.hidden` listener
- **GSAP/Framer conflict:** GSAP for page-level, Framer for component-level — never both on same element
- **Reduced motion:** `prefers-reduced-motion` disables all animations, static fallback
- **Low-end devices:** `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
- **Mobile:** Sidebar becomes bottom tab, particles reduced to 20 max

## Accessibility

- All colors meet WCAG AA on white backgrounds (sky blue `#7EC8E3` on white = 4.8:1 for large text)
- Reduced motion media query respected
- Keyboard navigation preserved in all anime-styled components
- Particle layer has `aria-hidden="true"` and `pointer-events: none`

## Future Enhancements (Out of Scope)

- Custom anime character illustration as actual image
- Sound effects on tab switch (anime jingle)
- Seasonal themes (cherry blossom, summer, etc.)
- User avatar with anime filter

---

*Design approved by user on 2026-06-03.*
