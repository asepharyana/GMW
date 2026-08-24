# GMW FE Rombak — "Constellation Ops" Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
> Setiap task = edit → lint → build/test → smoke → commit (author `asepharyana`, tanpa Co-Authored-By).

**Goal:** Rombak total FE GMW dari template dashboard klasik menjadi **Constellation Node Graph** — graf node interaktif (three.js force layout) di mana channel/event/moderasi adalah node bintang dan navigasi adalah terbang antar node — untuk semua 9 route sekaligus.

**Architecture:** Hapus total shell template (TopBar + NavRail + MobileNav + main scroll container). Ganti dengan satu `ConstellationStage`: canvas full-bleed fixed di belakang seluruh app yang me-render force-directed graph per-route (scene), plus overlay HTML mengambang (tanpa card box standar) untuk konten detail. Router tetap Next App Router; perpindahan route = kamera "fly-to" ke scene baru. Data tetap lewat pola SSR seed (`page.tsx` server fetch → `view.tsx` client + SWR fallbackData) — tidak ada endpoint baru yang diarankan.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 (token oklch existing) · three r180 (+ `@types/three`) · d3-force (+ `@types/d3-force`) untuk simulasi layout deterministik · motion v12 (transisi antar-scene) · biome (0 error **dan** 0 warning) · bun:test untuk modul murni.

---

## Keputusan Terkunci (2026-08-24, user MythEclipse)

| Keputusan | Pilihan user |
|---|---|
| Cakupan | **Semua 9 route sekali jalan** (dashboard, voice, media, recordings, moderation, messages, analysis, channels, glossary) |
| Arah struktural | **Constellation Node Graph** — navigasi = terbang antar node |
| Tema | **Pertahankan toggle light/dark** (jangan rebuild sistem tema — harden saja) |

## Kondisi Saat Ini (fakta repo, 2026-08-24)

- Repo: `/home/code/GMW/services/frontend` (monorepo GMW, deploy Nix-first via GHA "Build & Deploy (Nix)" ke `imphnen.asepharyana.my.id`; nginx gmw-proxy :4009 → Next standalone :4017).
- Shell aktif: `src/components/shell/ambient-app.tsx` → `AppFrame` = NavRail + TopBar + `<main>` scroll + MobileNav + MiniPlayer, dipakai SEMUA route via `(dashboard)/layout.tsx`. AmbientCanvas (233 l) masih ada sebagai background di belakang chrome template.
- 9 route di `src/app/(dashboard)/`: dashboard (368 l), voice (311), media (293), moderation (424), messages (611), analysis (196), recordings (201), channels (23), glossary (15).
- `next.config.ts`: `output: "standalone"` + `trailingSlash: true` → **nav via `router.push`/Link bisa no-op; pakai `<a href>` polos** (pitfall terverifikasi).
- Token desain ada di `globals.css` `@theme`: `--color-canvas/-2`, `--color-ink/-soft/-faint`, `--color-signal(+glow)`, amber, vermilion, hairline; font Bricolage Grotesque/JetBrains Mono; `.light` class override + next-themes sudah jalan — JANGAN dibangun ulang.
- Sudah ada & dipertahankan: CommandPalette (⌘K), Chatbot, MiniPlayer, primitives (GlassPanel/GlassCard/Badge/…), shared states+skeletons, `lib/format.ts`, `lib/ai-status.ts`, WS typed events (`message_created/updated/deleted/analyzed/snapshot*`, `voice_state`, dll).
- Tooling lokal: `pnpm lint|build|format`, `pnpm exec biome check --write --unsafe .` buat import order; bun 1.3.14 tersedia untuk unit test modul murni.
- Smoke test SELALU di port non-prod (mis. 4024), cek `ss -ltnp | grep <port>` dulu; JANGAN pernah bind 4017.

## Struktur Target

```
src/components/shell/
  constellation-frame.tsx    # pengganti AppFrame: tanpa topbar/rail/bottom-bar
  constellation-stage.tsx    # canvas three.js full-bleed + hit-test + kamera
  route-scenes.ts            # map pathname → scene config (nodes/edges/focus)
  floating-chrome.tsx        # brand mark + status dot + route switcher minim + palette hint
  (hapus setelah migrasi): topbar.tsx, nav-rail.tsx, mobile-nav.tsx, ambient-app.tsx*
src/lib/constellation/
  graph.ts                   # tipe GraphNode/GraphEdge + builder dari data API (murni)
  layout.ts                  # wrapper d3-force deterministik (seeded) + fallback radial (murni)
  camera.ts                  # interpolasi kamera fly-to (murni, testable)
  *.test.ts                  # bun:test utk modul murni di atas
```

*ambient-canvas/context dievaluasi: bisa di-refactor jadi bagian dari stage atau dihapus.

### Scene per route (bahasa visual satu kesatuan)

| Route | Scene |
|---|---|
| `/dashboard/` | Guild = bintang pusat; channel = node orbit; event WS = pulse edge; metric cluster floating (tanpa box) |
| `/channels/` | Semua channel sebagai konstelasi; klik channel = fly-to + panel detail mengambang |
| `/moderation/` | Pesan flagged = node merah (vermilion) mengelilingi hub AI-verdict; LiveModerationFeed jadi ribbon ticker |
| `/messages/` | Stream pesan = sabuk orbital; node baru masuk lewat animasi dari tepi |
| `/voice/` | Stage node di tengah; speaker aktif = node mengorbit dengan glow intensitas |
| `/media/` | Galeri spiral node (thumbnail via div bg-image); klik = MiniPlayer handoff |
| `/recordings/` | Variasi spiral media, timeline density sebagai cincin |
| `/analysis/` | Hub analitik; chart existing dirender sebagai panel translusen mengambang ter-anchor ke node |
| `/glossary/` | Term KB = cincin satelit; search memfilter node real-time |

### Checklist anti-default (wajib lolos sebelum commit akhir)

- [ ] Tidak ada top bar / nav rail / side panel / bottom prompt bar
- [ ] Tidak ada card grid standar sebagai struktur utama
- [ ] Layout beda SPASIAL dari versi lama (bukan ganti warna)
- [ ] Verifikasi visual sungguhan: browser_navigate + browser_vision → "bukan template dashboard"

---

## Tasks

### Phase 0 — Fondasi

#### Task 1: Dependencies + scaffold direktori
**Files:** `package.json`, create `src/lib/constellation/`
1. `cd /home/code/GMW/services/frontend && pnpm add three @types/three d3-force @types/d3-force && pnpm add -d @types/bun`
2. Buat 4 file kosong bertipe sesuai struktur target (ekspor placeholder bertipe agar tsc lolos).
3. Run: `pnpm exec tsc --noEmit` → expected PASS.
4. Commit: `chore(frontend): scaffold constellation lib + deps`.

> Catatan: jika `@types/bun` bentrok dengan tsconfig Next (duplikat globals), fallback: exclude `"**/*.test.ts"` dari `tsconfig.json` dan jalankan test hanya via `bun test` (tanpa typecheck). Putuskan saat eksekusi, dokumentasikan di commit body.

#### Task 2 (TDD): Modul murni graph + layout + camera
**Files:** `src/lib/constellation/{graph,layout,camera}.ts` + `*.test.ts`
1. **Tulis test dulu** (bun:test):
   - `graph.test.ts`: builder `dashboardToGraph()` menghasilkan node guild pusat + N channel + edges benar dari fixture `/api/dashboard/stats|channels` shape (lihat AGENTS.md; nama channel di `message.metadata.channelName`).
   - `layout.test.ts`: `computeLayout(nodes, edges, {seed:42})` DETERMINISTIK (dua pemanggilan = posisi identik), semua posisi finite, radius dalam bound; `radialLayout()` fallback untuk reduced-motion.
   - `camera.test.ts`: `flyTo(from,to,t)` easing monotonic, t=0→from, t=1→to.
2. Run: `bun test src/lib/constellation` → expected FAIL (belum diimplementasi).
3. Implementasi minimal sampai PASS.
4. Run: `bun test src/lib/constellation && pnpm exec tsc --noEmit` → PASS.
5. Commit: `feat(frontend): constellation graph/layout/camera pure modules (tested)`.

### Phase 1 — Shell Baru

#### Task 3: `ConstellationStage` (canvas renderer)
**Files:** `src/components/shell/constellation-stage.tsx`
- `<canvas>` fixed inset-0 `-z-10`; three.js orthographic 2D-ish render node+edge (sprite/glow shader sederhana — jangan over-engineer; titik + garis + glow cukup).
- Interaksi: drag = pan, wheel/pinch = zoom, hover = highlight node + tooltip title, click node ber-`href` = navigasi via `<a>` semantics (window.location assign — hindari router.push no-op).
- DPR-aware resize; pause render loop saat `document.hidden`; `prefers-reduced-motion` → render statis tanpa animasi.
- Sampling warna dari CSS var (`getComputedStyle`) + `MutationObserver` pada `documentElement.classList` agar ikut toggle dark/light.
- Verify: `pnpm lint && pnpm build` PASS → commit `feat(frontend): constellation stage canvas renderer`.

#### Task 4: `route-scenes.ts` + `ConstellationFrame`
**Files:** `src/components/shell/{route-scenes,constellation-frame,floating-chrome}.tsx`
- `route-scenes.ts`: `usePathname()` → config scene (builder mana, focus node, overlay slots).
- `ConstellationFrame`: render `ConstellationStage` + `children` (overlay HTML absolute, BUKAN flex column bertingkat) + `floating-chrome` (brand mark kiri-atas dgn status dot WS, switcher route minimal kanan-bawah, hint ⌘K). MiniPlayer + Chatbot + CommandPalette tetap termounting.
- Switcher & semua nav internal pakai `<a href="/<route>/">` polos (trailingSlash!). Verifikasi klik di browser nanti, bukan cuma baca kode.
- Wire `(dashboard)/layout.tsx`: ganti `AppFrame` → `ConstellationFrame` (provider Ambient/WS tetap).
- Smoke: `ss -ltnp | grep 4024` kosong → `PORT=4024 pnpm start` → curl semua 9 route = 200 → kill server.
- Commit: `feat(frontend): replace classic shell with constellation frame`.

#### Task 5: Hapus chrome lama + bersih-bersih
**Files:** hapus `shell/topbar.tsx`, `shell/nav-rail.tsx`, `shell/mobile-nav.tsx`, update `shell/index.ts`; eval `ambient-*` (refactor jadi layer stage ATAU hapus).
- `grep -rn "TopBar\|NavRail\|MobileNav\|AppFrame" src/` → 0 referensi tersisa.
- `pnpm exec biome check --write --unsafe .` → import order rapi.
- Commit: `refactor(frontend): remove classic dashboard chrome`.

### Phase 2 — Migrasi 9 Route (batch, tiap batch ship hijau)

Urutan sengaja dari yang paling graph-native ke paling padat konten:

#### Task 6: `/dashboard/` + `/channels/`
- Dashboard view: guild-star + channel orbit + WS pulse; metric cluster floating (reuse MetricTile tapi tanpa card-box — ubah jadi teks besar + hairline).
- Channels: konstelasi channel, klik = fly-to + panel detail (data dari hook `use-channels`/server fetch existing — jangan karang endpoint).
- Lint+build+smoke 2 route → commit `feat(frontend): dashboard & channels constellation scenes`.

#### Task 7: `/glossary/` + `/analysis/`
- Glossary: cincin satelit term + search filter node (client-side filter pada node label).
- Analysis: hub node + panel chart translusen mengambang (reuse komponen charts/* existing, anchor posisi ke node).
- Commit: `feat(frontend): glossary & analysis scenes`.

#### Task 8: `/messages/` + `/moderation/`
- Messages: sabuk orbital stream (reuse sortMessages/logika WS `use-messages.ts` — jangan duplikasi); pesan baru animate-in dari tepi.
- Moderation: flagged nodes vermilion + hub verdict; LiveModerationFeed jadi ticker ribbon bawah (bukan panel).
- Commit: `feat(frontend): messages & moderation scenes`.

#### Task 9: `/voice/` + `/media/` + `/recordings/`
- Voice: speaker aktif orbit dgn glow (seed dari snapshot `activeSpeakers` server-authoritative — pertahankan perilaku useSpeakers).
- Media/Recordings: spiral galeri; thumbnail pakai div background-image (hindari `noImgElement`; kalau terpaksa `<img>` → `// biome-ignore lint/performance/noImgElement: <alasan>`); MiniPlayer handoff tidak boleh regress.
- Commit: `feat(frontend): voice, media & recordings scenes`.

### Phase 3 — Polish, A11y, Tema

#### Task 10: Motion & micro-interaction
- Fly-to antar scene pakai `motion` v12 (interpolasi kamera dari `lib/constellation/camera.ts`).
- Overlay: stagger masuk (pattern `animate-stagger` + `staggerDelay(i)` existing); tambah semua `animate-*` baru ke kill-list `prefers-reduced-motion` di `globals.css`.
- Commit: `feat(frontend): scene transitions + motion polish`.

#### Task 11: A11y & fallback semantik
- Setiap scene punya fallback semantik: `<nav aria-label="Routes">` visually-hidden berisi link semua route + `<ul>` node (label + href) yang ter-sync dgn graph state.
- Keyboard: Tab ke daftar route; panah memindahkan fokus antar node; Enter aktivasi; `focus-visible` ring pakai `--color-ring`.
- Kontras ink-on-canvas dicek (WCAG AA utk teks overlay).
- Hooks-after-early-return pitfall: compute flags dulu, guard di dalam useEffect.
- Commit: `feat(frontend): a11y semantic fallback for constellation`.

#### Task 12: Hardening tema light/dark
- Pastikan canvas sampling var `.light` benar saat toggle (MutationObserver dari Task 3); harden `.light`: `color-scheme: light`, scrollbar/selection, glow opacity turun.
- JANGAN menyentuh sistem next-themes.
- Commit: `fix(frontend): light theme parity for constellation stage`.

### Phase 4 — Gerbang Ship (non-negotiable)

#### Task 13: Verifikasi penuh + deploy
1. `pnpm lint` → **Found 0 errors. Found 0 warnings** (warning pun harus bersih).
2. `bun test src/lib/constellation` → all PASS; `pnpm exec tsc --noEmit` PASS; `pnpm build` sukses.
3. Smoke: port 4024 bersih → start → curl 9 route (dgn trailing slash) semua **200** → kill server.
4. `git status` audit: hanya file scope yang ter-commit (`git checkout --` file liar hasil auto-format).
5. Push `origin/main` → `gh run watch` "Build & Deploy (Nix)" → hijau.
6. Live: curl `https://imphnen.asepharyana.my.id/<route>/` × 9 → 200.
7. **Verifikasi visual sungguhan**: browser_navigate ke live URL → browser_vision: "Apakah ini masih template dashboard?" — jawaban HARUS bukan; screenshot dikirim ke user (`MEDIA:<path>`).
8. Checklist anti-default dicentang satu per satu di PR/commit message akhir.

---

## Files Likely to Change

```
package.json, pnpm-lock.yaml
next.config.ts                        # hanya jika perlu (tidak diharapkan)
src/app/(dashboard)/layout.tsx        # wire frame baru
src/app/(dashboard)/{9 route}/page.tsx|view.tsx   # scene migration
src/components/shell/**               # frame baru + hapus lama
src/lib/constellation/**              # baru (murni + test)
src/app/globals.css                   # tokens tambahan + reduced-motion kill list
biome.json                            # hanya jika rule intentional baru perlu "off"
```

## Risks / Tradeoffs

| Risiko | Mitigasi |
|---|---|
| Perf GPU di device lemah (full-page WebGL) | Node count kecil (<200/route), pause saat tab hidden, fallback radial statis utk reduced-motion; jika tetap berat → downgrade ke Canvas2D renderer dgn API sama |
| router.push no-op (standalone+trailingSlash) | Semua nav pakai `<a href>`; verifikasi klik nyata di browser |
| Konten padat (messages 611 l) tak muat di metafora graf | Prinsip: graf = struktur/navigasi; DETAIL tetap lewat overlay panel mengambang — konten tidak dikorbankan, hanya wadahnya yang berubah |
| Bun test + Next tsconfig konflik types | Exclude `*.test.ts` dari tsconfig (keputusan Task 1) |
| Regress fitur existing (theme toggle, palette, chatbot, mini-player, WS sync) | Dipertahankan apa adanya; smoke + klik verifikasi per phase; sortMessages & snapshot voice TIDAK disentuh logikanya |

## Open Questions

- Tidak ada blocker. Satu preferensi opsional: apakah brand mark perlu jam/uptime seperti TopBar lama — default: tidak (minimal). Keputusan bisa diambil saat review Task 4.
