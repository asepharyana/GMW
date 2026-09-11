# GMW — Fix mobile navbar "tidak bisa pindah halaman" (root cause)

## Context / symptom
- User (phone, mobile viewport <md): pressing the bottom mobile nav items does NOT
  navigate ("Masih sama, walau sudah ditekan tidak pindah halaman").
- Previous fix (commits ae41f64e, 4d0bbed5) repositioned the chatbot FAB above the
  nav and expanded nav to all 7 items — but the bug persisted.

## Root cause (verified live 2026-08-28)
Reproduced on the LIVE site (`imphnen.asepharyana.my.id`) with Playwright @375px:
1. **Next `<Link>` client-side navigation is dead app-wide.** Clicking a mobile nav
   `<Link>` fires the click (event reaches document, `inLink=true`,
   `defaultPrevented=false`) but **the URL never changes**. `window.next.router.push('/voice')`
   also does nothing. The desktop NavRail navigates only because it uses a **plain
   `<a href>`** (full browser navigation bypasses the broken router).
2. **A React hydration failure (#418 "server rendered text didn't match the client")**
   is thrown on live pages — the only console error. Cause: relative-time text
   (`formatRelativeTime(e.edited_at)` / `formatRelativeTime(m.created_at)` in the
   SSR-seeded messages/edit-history feed uses `Date.now()`; server and client
   render slightly different text → hydration mismatch → React re-renders, and the
   Next client router ends up non-functional.

## Why desktop "worked" / mobile didn't
- `NavRail` = plain `<a href>` → **hard** navigation (works).
- `MobileNav` = Next `<Link>` → **client** navigation → dead router.
User's instruction "ikuti cara kerja sidebar" = make mobile nav behave like the
sidebar (plain anchors).

## Changes
### 1. `src/components/shell/mobile-nav.tsx`
Replace Next `<Link>` with a **plain `<a href>`** (mirrors NavRail). Keep:
`usePathname` for active-state styling + `scrollIntoView` for snap-to-active.
Drop the now-unused `Link` import (biome import-order — run biome check --write).

### 2. Hydration root cause — `formatRelativeTime` in SSR-seeded feeds
Add `suppressHydrationWarning` to the timestamp elements in the SSR-seeded
components that render live-relative text so server/client text drift no longer
throws #418:
- `src/components/EditHistory.tsx` (line ~111 `edited {formatRelativeTime(...)}`)
- `src/app/(dashboard)/messages/view.tsx` MessageRow channel/time (line ~580) +
  semantic row (line ~364)
- `src/components/LiveModerationFeed.tsx` (line ~139)
- (recordings/view.tsx, TermGlossary, ChannelCultureGlossary, CategoryDrilldown,
  chatbot — chatbot is client-after-mount; add where SSR-seeded.)

NOTE: `suppressHydrationWarning` is safe for these single-text spans; the values
are cosmetic and self-correct on the next interval/render.

## Verification (non-prod, NEVER 4017)
- `pnpm format` + `pnpm lint` (biome) + `pnpm build` clean.
- Smoke on :4024 (fresh `next dev`): mobile click on nav item actually navigates
  (URL changes) AND no React #418 in console.
- After push: `gh run watch`, then live `imphnen.asepharyana.my.id` @375px: nav tap
  navigates, console free of #418.

## Files
- services/frontend/src/components/shell/mobile-nav.tsx
- services/frontend/src/components/EditHistory.tsx
- services/frontend/src/app/(dashboard)/messages/view.tsx
- services/frontend/src/components/LiveModerationFeed.tsx
- (others only if #418 persists)
