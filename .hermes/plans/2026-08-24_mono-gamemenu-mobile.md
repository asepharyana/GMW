# GMW FE — Monokrom Hitam-Putih + Sidebar Ala Menu Game + Ringan di Mobile

Tanggal: 2026-08-24 · Basis: `eda5c75` (shell usable hasil revert)

## Tujuan
1. Tema **monokrom murni** (hitam-putih, tanpa warna) di dark & light.
2. Sidebar (desktop NavRail + mobile dock) beranimasi **ala menu game** — corner
   brackets, sweep, stagger masuk, marker segitiga.
3. **Ringan di mobile**: matikan WebGL ambient di layar kecil, kurangi biaya
   blur/backdrop, animasi transform/opacity saja.

## Non-goals
- Tidak menyentuh backend, endpoint, hooks/data-flow, struktur route.
- Tidak menambah dependensi baru (CSS murni untuk semua animasi).

## File yang disentuh
| File | Perubahan |
|---|---|
| `src/app/globals.css` | Token mono (dark+light): signal/amber/vermilion → skala putih-abu; `.glass` blur adaptif; kelas baru `.game-nav-item` (bracket ::before/::after, sweep, stagger via `--i`), `.game-frame` (panel sudut terpotong + garis tergambar), keyframes `sweep-x`, `draw-line`, `nav-in`; media query `<md`: blur 18→8px, hambat animasi berat |
| `src/components/shell/nav-rail.tsx` | Item pakai `.game-nav-item` + `style={{'--i': n}}`; marker aktif jadi segitiga ▸ putih; hapus box-shadow glow besar (ganti sweep) |
| `src/components/shell/mobile-nav.tsx` | Dock mono: tab aktif = bar atas putih + sweep sekali; target sentuh ≥44px; hapus glow blob |
| `src/components/shell/topbar.tsx` | Aksen mono + `.game-frame` pada container (cek markup dulu) |
| `src/components/ambient/ambient-canvas.tsx` | Early-return WebGL bila `(pointer: coarse)` / lebar <768 / `saveData` / core ≤4; fallback statik CSS tetap |
| `src/components/ambient/status/signal tone` (`SIGNAL_RGB`) | Semua tone jadi grayscale (putih; intensitas beda per tone) |
| `src/app/(dashboard)/dashboard/view.tsx` | Hero + kartu metrik pakai `.game-frame`/cut-corner sebagai showcase |

## Keputusan desain
- **Full monokrom termasuk danger**: flag/moderation tidak lagi merah —
  ditandai badge putih-di-atlas-hitam inversi + pulse. Kalau user kangen merah,
  tinggal isi ulang `--color-vermilion`.
- Semua animasi hanya `transform`/`opacity` (compositor-friendly), hormati
  `prefers-reduced-motion` (sudah ada kill-switch global).

## Verifikasi (gerbang)
1. `tsc --noEmit` bersih; biome 0 error 0 warning.
2. `pnpm build` sukses; smoke lokal 4024 → 9 route 200.
3. Push → GHA "Build & Deploy (Nix)" hijau → live 9×200.
4. Visual check live: desktop (rail game-menu terlihat) + cek rule mobile
   (media query & gate kode) — screenshot disimpan.
