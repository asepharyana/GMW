# GMW FE Rombak — Extend Tactical-HUD/GSAP Treatment Wide (2026-08-26)

## Context / lessons that constrain this plan
- 2026-08-24: full novel navigation metaphor (constellation/three.js) was
  SHIPPED green on every gate then REJECTED by user for hurting usability.
  Rolled back entirely. Lesson: do NOT invent a new nav metaphor.
- 2026-08-24: accepted direction = monochrome theme + game-menu style sidebar
  animation ON TOP of the familiar shell (rail/topbar/panel kept).
- 2026-08-25: `dashboard` and `media` routes were already revamped into a
  "Tactical HUD" style with GSAP (`@gsap/react` useGSAP) reactive stages —
  commits 183a510, cab451f. This is the established, ACCEPTED visual language.
- Remaining routes (`channels`, `voice`, `messages`, `moderation`,
  `recordings`, `analysis`, `glossary`) have NOT received the tactical-HUD/GSAP
  treatment — last touch was an error-handling/state pass (31e303c) or the
  constellation revert (eda5c75).

## Scope of THIS request
User: "rombak fe dengan sekeren mungkin tapi tidak menyusahkan user, pewarnaan
sesuai tidak berlebihan, pakai gsap, sekreatif mungkin."

Read against the history above, this means: EXTEND the already-accepted
tactical-HUD + GSAP + monochrome visual language to the remaining routes,
adding creative micro-interactions and view-specific "reactive stage" touches
— NOT a new structural/navigation metaphor, NOT a color explosion.

## Hard constraints (do not violate)
1. Keep the existing shell: top bar / nav rail / mobile bottom dock. No new
   navigation metaphor.
2. Monochrome/greyscale token system stays as-is (`--color-signal/amber/
   vermilion` luminance greys). Do not introduce saturated colors; accent use
   stays restrained (used sparingly for state: active/alert/success).
3. GSAP via `@gsap/react` `useGSAP({ scope, dependencies })` + `clearProps` on
   cleanup, per `dashboard-rombak/references/tactical-hud-gsap-pattern.md`.
   Respect `prefers-reduced-motion` (extend the kill-list in globals.css for
   any new `animate-*` class).
4. Mobile lightness gate: any WebGL/heavy canvas work must gate off on
   <768px / pointer:coarse / saveData / deviceMemory<=4 (see AmbientCanvas
   pattern already in the codebase).
5. Each route ships independently: edit → `pnpm format` → `npx @biomejs/biome
   check --write` → `pnpm lint` (0 errors, 0 warnings) → `tsc --noEmit` →
   `pnpm build` → commit (no Co-Authored-By trailer) → push → `gh run watch`
   for Build & Deploy (Nix) → live verify via browser_vision on
   imphnen.asepharyana.my.id/<route>/.
6. NEVER claim "done" from reading code — every route gets a live screenshot
   check confirming: (a) not a stock template, (b) monochrome/restrained,
   (c) GSAP entrance/interaction actually fires, (d) nav/theme toggle/command
   palette still work.

## Per-route creative direction (reactive-stage motifs, one distinct idea per
route so it doesn't feel copy-pasted from dashboard/media)
- **channels**: node/roster telemetry — GSAP stagger-in channel cards with a
  "signal strength" bar-fill tween keyed to activity; hover reveals HUD-style
  meta readout.
- **voice**: live speaker HUD — waveform/ring pulse tied to WS voice_state
  (GSAP timeline looping while speaking, `clearProps` on stop); ambient tile
  glow keyed to active speaker count.
- **messages**: scan-line reveal on list mount + WS-driven "new message" slide
  insert (respect existing sortMessages fix — do not reintroduce the race).
- **moderation**: alert-priority HUD — flagged severity as inverted mono
  badge with a pulse GSAP loop (no red, per accepted mono direction);
  queue-clear micro celebration (subtle, no confetti-color).
- **recordings**: waveform scrub deck echoing media's frequency-deck visual
  language but for static recordings (progress-tied GSAP scrub, not looping).
- **analysis**: gauge/metric reveal using the existing `radial-gauge.tsx`
  driven by a GSAP number tween (count-up) instead of an instant value snap.
- **glossary**: lightweight — accordion/definition reveal with GSAP height
  auto + fade, kept minimal since it's low-traffic reference content.

## Verification checklist (must pass before calling any route "shipped")
- [ ] tsc --noEmit clean
- [ ] biome check: 0 errors AND 0 warnings
- [ ] next build succeeds
- [ ] CI green (Build & Deploy (Nix))
- [ ] Live screenshot: monochrome, GSAP motion visible, nav/theme/command
      palette intact, not a stock template
- [ ] Reduced-motion: new animate-* classes added to the kill-list
- [ ] Mobile: WebGL/heavy work gated per existing pattern

## Rollback plan
Every route ships as its own atomic commit. If user rejects a specific route's
direction, `git revert <that commit>` — do not touch unrelated routes.
