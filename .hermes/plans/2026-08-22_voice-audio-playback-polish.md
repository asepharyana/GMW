# Spec: Perbagus fitur Voice + Audio Playback (GMW frontend)

Tanggal: 2026-08-22 · Scope: **frontend only** (backend/gateway API sudah cukup)

## Masalah (audit)
1. Recordings: semua kartu pakai `<audio controls>` native — tampilan identik,
   tidak ada indikasi which-clip-playing / loading / paused, dan N audio bisa
   play bareng (overlap).
2. Media view: `thumbnailUrl` dari gateway tidak dipakai; tidak ada visual
   "sedang playing" selain disc spin; queue item semua sama tanpa badge up-next.
3. Mini-player (`lib/hooks/use-media-player.tsx`) ada tapi TIDAK PERNAH
   dimount → dead code, user tidak lihat status musik di halaman lain.
4. Voice page: `useMicTransmit.setVolume` + `useVoiceListen.setVolume`
   tersedia tapi tak ada UI-nya; mic live tidak punya level feedback.

## Desain

### A. RecordingAudioPlayer (baru, `components/voice/recording-audio-player.tsx`)
Custom player menggantikan `<audio controls>`:
- Play/pause button (ikon berubah), spinner saat buffering (`waiting` event).
- Progress bar seekable (click-to-seek) + time label `m:ss / m:ss`.
- Waveform-ish equalizer bars saat playing (CSS animation, reduced-motion safe).
- **Single-playback**: module-level registry `activePlayers` — memainkan satu
  clip otomatis pause yang lain.
- Kartu pemilik player aktif dapat highlight border signal + "Now playing" chip.

### B. Recordings view — pasang player baru
- Ganti `<audio>` → `<RecordingAudioPlayer src download_url>`.
- Highlight kartu via state lifted: `playingId` di view, callback `onPlay`.

### C. Media view polish
- Hero: thumbnail (jika `current.thumbnailUrl`) sebagai disc center image;
  fallback ListMusic icon. Equalizer bars animasi CSS saat `playing`.
- Queue row pertama: badge "up next"; baris current track diberi ring signal.
- Volume read-only tetap.

### D. MiniPlayer global
- Hapus `lib/hooks/use-media-player.tsx` (dead) — ganti dengan komponen
  `components/media/mini-player.tsx` yang subscribe `useMediaState` +
  `useMediaWsSync` langsung (SWR cache shared antar route), mounted di
  `AppFrame` bawah layar (fixed bottom, hidden di route `/media`).
- Menampilkan: thumbnail kecil/judul, tombol skip/stop, link ke /media.

### E. Voice UI
- Mic live: level meter (Equalizer bars) — mic-transmitter sudah punya worklet;
  tambah `getLevel()` via AnalyserNode pada stream (simple RMS) di hook.
- Listen: volume slider (input range) wired ke `listen.setVolume`.
- Mic volume slider wired ke `mic.setVolume`.

## File touched
| File | Aksi |
|---|---|
| services/frontend/src/components/voice/recording-audio-player.tsx | new |
| services/frontend/src/app/(dashboard)/recordings/view.tsx | edit |
| services/frontend/src/app/(dashboard)/media/view.tsx | edit |
| services/frontend/src/components/media/mini-player.tsx | new |
| services/frontend/src/components/shell/ambient-app.tsx | mount MiniPlayer |
| services/frontend/src/lib/hooks/use-media-player.tsx | delete |
| services/frontend/src/hooks/use-voice.ts | tambah micLevel |
| services/frontend/src/lib/audio/mic-transmit.ts | expose analyser level |
| services/frontend/src/app/(dashboard)/voice/view.tsx | sliders + meter |

## Verifikasi
1. `pnpm lint` (biome) + `pnpm build` clean.
2. Smoke di port **4024** (BUKAN 4017) → curl 200 semua route.
3. Commit (tanpa trailer) → push → `gh run watch` → live check
   https://imphnen.asepharyana.my.id/{media,recordings,voice}/ = 200.
