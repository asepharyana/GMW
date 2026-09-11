# Spec: Recordings — filter per user + export WAV (Audacity)

## Konteks / Gejala
Halaman `services/frontend/src/app/(dashboard)/recordings` menampilkan semua
rekaman voice (deck). User ingin:
1. **Filter per orang** (tampil rekaman satu user saja).
2. **Export ke format untuk Audacity** (buka & edit rekaman di Audacity).

## Fakta saat ini (verified)
- Backend `recordings.list` (services/backend/src/orpc/router.ts:291) SUDAH
  menerima `userId`/`channelId` filter → `RecordingsService.getRecent`.
- Frontend `recordingsApi.list(limit, channelId, userId, cursor)` (lib/api/recordings.ts)
  sudah meneruskan `userId`. `useLoadMoreRecordings` juga sudah bawa userId.
- Tapi UI `RecordingsView` (app/(dashboard)/recordings/view.tsx) TIDAK punya
  filter UI, dan `useRecordingsPage` dipanggil tanpa userId → semua tampil.
- Setiap rekaman punya `download_url` (MP3 di TeleUploader), `user_id`, `username`.
- Audacity membuka MP3/OGG tapi editing paling bersih dari WAV (uncompressed)
  / FLAC (lossless). Backend TIDAK punya ffmpeg & Nix flake backend tak include
  ffmpeg → transcode server-side bukan pilihan. Browser punya codec MP3 → export
  WAV via Web Audio API (client-side) adalah solusi self-contained terbaik.

## Keputusan desain
1. **Filter per user**: UI dropdown (Semua User + per user) di header halaman.
   Memilih user → re-fetch `recordingsApi.list(50, undefined, userId)` (server
   filter, benar untuk dataset besar + pagination). Dropdown dibangun dari
   distinct `user_id`/`username` pada items yang sedang tampil.
2. **Export WAV (Audacity)**: client-side via Web Audio API.
   - Per kartu: tombol "WAV" → decode `download_url` → WAV 16-bit PCM → download.
   - Header: tombol "EXPORT WAV (N)" → gabung (concat) semua rekaman yang
     sedang tampil (ter-filter) jadi 1 file WAV → download. Ideal untuk analisis
     / mixdown per orang.
   - Implementasi di `lib/audio/wav.ts` (decode + encode + concat), tanpa dep baru.

## Perubahan

### Frontend
- **`src/lib/audio/wav.ts`** (baru):
  - `decodeAudio(url: string): Promise<AudioBuffer>` — fetch arrayBuffer →
    `new AudioContext().decodeAudioData`.
  - `audioBufferToWav(buf: AudioBuffer, sampleRate=48000): Blob` — PCM 16-bit
    interleaved, mono→stereo handling, RIFF/WAVE writer. Audacity-importable.
  - `concatBuffers(buffers: AudioBuffer[]): AudioBuffer` — gabung di channel 0
    (mono) dengan sample-rate max; untuk export gabungan.
  - `downloadWav(blob: Blob, filename: string): void` — obj URL + <a download>.
- **`src/app/(dashboard)/recordings/view.tsx`**:
  - Toolbar filter: dropdown user (built from distinct items) + tombol reset.
  - State `filterUserId`; saat berubah → `recordingsApi.list(50, undefined, id)`
    → set ke SWR (key includes filter), reset pagination.
  - Tombol "WAV" per kartu (disabled jika `!r.download_url`).
  - Tombol "EXPORT WAV (N)" di header (disabled jika 0 item punya download_url);
    concat semua items ter-filter yang punya download_url.
  - Status loading saat export (spinner/disable).
- **`src/hooks/use-recordings.ts`**: `useRecordingsPage` menerima `userId?` dan
  memasukkan ke key + call, supaya filter re-fetch bersih (per-user cache key).
  `useRecordings`/`useLoadMoreRecordings` propagate `userId`.
- **`src/lib/types/recording.ts`**: tidak berubah (userId dari items).

### Backend / gateway
- Tidak ada perubahan. Filter & export sepenuhnya frontend.

## File yang disentuh (frontend only)
- `src/lib/audio/wav.ts` (baru)
- `src/app/(dashboard)/recordings/view.tsx`
- `src/hooks/use-recordings.ts`

## Verification
1. `cd services/frontend && pnpm typecheck` (tsc --noEmit) — 0 error.
2. `pnpm lint` (biome check src/) — exit 0.
3. `pnpm build` (next build) — hijau.
4. Manual (user): buka /recordings; pilih user di dropdown → hanya rekaman user
   itu; klik WAV di kartu → file .wav ter-download & terbuka di Audacity; klik
   EXPORT WAV (filtered) → satu .wav gabungan.
5. Push → CI `Build & Deploy (Nix)` (frontend job) hijau → deploy landing.

## Risiko / Trade-off
- Web Audio decode MP3 di client: butuh CORS pada download_url (TeleUploader
  asepharyana.my.id — sudah same-serve/proxied, CORS ikut origin). Jika 403/CORS
  gagal, error toaster + fallback manual (RAW MP3 tetap ada).
- concat gabungan = mono 48k; Audacity bisa edit per-channel nanti. Acceptable.
- Filter client (dropdown dari items yang dimuat) hanya menawarkan user yang
  sudah tampil; dataset besar bisa pakai search nanti. Server filter benar untuk
  yang dipilih.
