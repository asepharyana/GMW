# GMW Frontend — Mobile Nav + Form Controls Responsive Pass

## Problem
Two mobile UX defects reported by user:

1. **Mobile navbar can't navigate between pages** (`tidak bisa pindah halaman`).
   - **Root cause A (click-block):** the floating chatbot FAB
     (`chatbot.tsx` line ~125: `fixed right-4 bottom-5 z-50 size-11`) overlaps the
     mobile bottom nav (`MobileNav` is `fixed bottom-0 z-40`). Because the FAB is
     `z-50` and sits at `bottom-5` on the right, it intercepts taps on the
     rightmost bottom-nav items (Voice/Media). Verified in Playwright: click on
     `Media` nav item is blocked by `button[aria-label="Open neural HUD assistant"]`.
   - **Root cause B (missing destinations):** `mobileNavItems` in
     `src/lib/navigation.ts` filters `navItems` to only
     `['/dashboard','/messages','/voice','/media']`, so `/recordings`,
     `/moderation`, `/analysis` are unreachable from the mobile bottom bar.
   - **Chosen design (user directive):** extend the mobile bottom bar to **all 7
     nav items**, horizontally **scrollable/flex-wrap** so they fit on narrow
     screens, following the desktop sidebar's items (same set as `navItems`).

2. **Form controls not responsive on mobile** (`perbagus textfield, dropdown,
   lainnya agar responsif di mobile`).
   - `Select` dropdown (`primitives/select.tsx`) is portalled w/ `fixed`
     positioning computed from trigger rect only (top/left/width). On a narrow
     viewport a dropdown anchored near the right edge overflows past the screen's
     right edge and can be clipped/clickable-outside the visible area. Clamp
     horizontally within viewport.
   - `Input`/`Textarea` (`primitives/input.tsx`) use `text-sm` (14px) which on
     iOS triggers auto-zoom on focus (a known mobile annoyance) and can be small
     touch targets. Give inputs a comfortable mobile baseline.

## Files touched
- `src/components/shell/mobile-nav.tsx` — use `navItems` (all 7), make the bar
  scrollable on narrow widths (overflow-x-auto + snap), keep active indicator.
- `src/components/chatbot/chatbot.tsx` — raise FAB above the mobile bottom nav on
  `md:hidden` (e.g. `bottom-[calc(4.75rem+env(safe-area-inset-bottom))]`),
  keep `bottom-5` on `md+` so it never overlaps the nav.
- `src/lib/navigation.ts` — drop `mobileNavItems` special-case (or repoint to
  `navItems`); keep `navItems` as the single source.
- `src/components/primitives/select.tsx` — clamp dropdown `left` so it stays
  within viewport; cap width on narrow screens; keep max-height.
- `src/components/primitives/input.tsx` — mobile-friendly font size / touch
  height (16px inputs to avoid iOS zoom; keep desktop as-is via responsive
  classes).

## Verification
- `pnpm format`, `pnpm lint` (biome clean), `pnpm build` compiles.
- Smoke on NON-PROD port (4024) — confirm free first via `ss -ltnp`.
- Playwright mobile viewport (390px): ALL 7 nav items present in bottom bar;
  tapping each navigates (esp. Media rightmost item NOT blocked by FAB); FAB is
  raised above the nav and no longer intercepts taps.
- Select dropdown on a 390px viewport stays fully on-screen (no right overflow).
- Commit (no trailer), push, `gh run watch`, verify all 7 live routes 200.
