# Spec: Recordings v2 — transcription, search, filters, leaderboard, sessions

## Konteks
4 fitur lanjutan untuk halaman /recordings (dipilih user):
1. Tampilkan transkripsi + search by kata kunci
2. Filter lanjutan: by channel + rentang tanggal
3. Kelompokkan klip jadi "sesi rapat" + autoplay berurutan + export satu sesi
4. Leaderboard bicara per user + ringkasan

## Fakta terverifikasi (2026-08-30)
- `voice_recordings` kolom: id, user_id, username, avatar_url, guild_id,
  channel_id, channel_name, filename, size_bytes, download_url, upload_status,
  upload_error, created_at, uploaded_at, **transcription** (schema
  `shared/database/schema.ts:246`). Index user_id/channel_id/created_at.
- **Transcription 0/10.640** terisi prod: `AI_VOICE_TRANSCRIPTION_ENABLED`
  default **false** (config/index.ts:333) & tidak diset di BWS env →
  `transcribeRecording` (voiceTranscriber.ts) langsung return null.
  `AI_LLM_BASE_URL` + `AI_LLM_API_KEY` SUDAH dikonfig (Whisper via router GMW).
- Transcriber hardcode `language: "en"` (voiceTranscriber.ts:34) — salah utk
  ucapan campur id/en. Utk auto-detect: hapus param `language` (Whisper
  auto-detect jika tidak diberikan).
- Backend `RecordingsService.getRecent` (recordings.service.ts) TIDAK select
  `transcription`; SUDAH dukung filter `channelId`+`userId`+`cursor`; belum
  dukung date-range & keyword search. `RecordingRow` interface juga tak punya
  `transcription`.
- Tidak ada kolom `session_id` / `duration_ms` → sesi grouping = heuristik
  (channel sama + gap created_at), durasi leaderboard = estimasi dari
  size_bytes (MP3 128kbps: durasi_s ≈ size_bytes*8/128000).

## Keputusan desain
1. **Aktifkan transkripsi (fondasi)**: transcriber auto-detect (hapus
   `language:"en"`), set secret BWS `AI_VOICE_TRANSCRIPTION_ENABLED=true`
   (dibaca runtime oleh bws-exec saat service start). Rekaman BARU dapat
   transkripsi. Backfill rekaman lama TIDAK dilakukan (pilih user: fokus baru;
   file OGG lama kemungkinan besar sudah tidak dipakai).
2. **Backend** — perluas `getRecent`:
   - select `transcription` (+ interface RecordingRow + FE type)
   - filter baru: `q` (ILIKE on transcription + username), `startDate`/`endDate`
     (created_at range, bigint ms)
   - endpoint baru `recordings.summary`: agregasi per user → {user_id,
     username, avatar_url, clips, est_duration_s, words, last_at}. `words`
     dihitung dari transcription (tokenisasi spasi). Return sorted by clips.
3. **Frontend**:
   - Kartu: tampilkan transkripsi (collapse/expand line-clamp) + durasi estimasi.
   - Toolbar: search box (q), Select channel, date range (start/end), speaker
     (sudah ada), reset filter.
   - Tab/segment "Tape Deck" vs "Leaderboard": leaderboard render summary per
     user + klik → filter deck by user itu.
   - Sesi grouping (deck view): klip di-group jadi sesi bila channel sama &
     gap antar klip < SESSION_GAP_MS (default 120s). Header sesi (channel,
     waktu mulai, jumlah klip, total durasi). Autoplay tombol "Play session" &
     "Export session WAV" (concat klip sesi via lib/audio/wav.ts yg sudah ada).

## Perubahan file

### Gateway (Tahap 1)
- `voiceTranscriber.ts`: hapus baris `language: "en"`.
- (secret) set `AI_VOICE_TRANSCRIPTION_ENABLED=true` via bws.

### Backend (Tahap 2)
- `recordings.service.ts`: interface + select + getRecent tambah transcription;
  tambah filter q/startDate/endDate; method getSummary() untuk leaderboard.
- `orpc/router.ts`: procedur `recordings.list` schema tambah fields; prosedur
  baru `recordings.summary`.

### Frontend (Tahap 3-5)
- `lib/types/recording.ts`: tambah transcription, est_duration_s opsional,
  Summary type.
- `lib/api/recordings.ts`: list tambah q/startDate/endDate; + summary().
- `hooks/use-recordings.ts`: propagate filter baru ke key+call; hook
  useRecordingsSummary.
- `app/(dashboard)/recordings/view.tsx`: toolbar search+channel+date, kartu
  transkripsi, tab leaderboard, grouping sesi + autoplay + export sesi.

## Verification
- tiap tahap: gateway `pnpm build` + `biome check src/`; backend `pnpm build`
  + `biome check src/ tests/`; FE `pnpm build` + `biome check src/`.
- CI Build & Deploy hijau tiap tahap; deploy landing dicek via
  `systemctl show gmw-<svc>.service --property=ActiveEnterTimestamp`.
- Tahap 1c: setelah deploy + rekaman baru, cek
  `SELECT COUNT(*) FROM voice_recordings WHERE transcription IS NOT NULL`.
