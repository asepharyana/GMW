# Spec: Simpan pesan NSFW tanpa analisis AI (Request 1)

Date: 2026-08-30

## Goal
Saat ini GMW **skip capture** untuk pesan di channel age-restricted/NSFW
(`messageCapture.ts` baris 291 & 310 memanggil `isAgeRestrictedMessage` lalu
`return`). User ingin pesan NSFW tetap **disimpan** ke database (jadi terlihat
di dashboard), tetapi **tidak dianalisis AI** (tidak dipanggil LLM).

## Behavior target
1. Pesan NSFW/age-restricted di `messageCreate` → DISIMPAN (capture normal).
2. Pesan NSFW di `messageUpdate`/`messageDelete` → tetap diproses seperti pesan
   biasa (edit/deleted state tercatat).
3. AI analysis TIDAK berjalan untuk pesan NSFW. Sudah ada jalur yang benar:
   `queueMessageAnalysis` → `isAgeRestrictedMessage(message)` →
   `buildAgeRestrictedSkipResult()` yang menulis `status=clean` + flag
   `age_restricted` + `action=none` TANPA memanggil LLM. Jalur ini sudah ada dan
   dipakai di `aiAnalyzer.queueMessageAnalysis` (baris 72-84) dan
   `batchProcessor.skipAgeRestrictedMessages`. Jadi tinggal membuka capture.
4. Konten NSFW TIDAK masuk ke Qdrant public archive (semantic search publik).
   `archiveMessageEmbedded` harus di-guard untuk pesan age-restricted.

## Files touched
- `services/discord-gateway/src/modules/message-capture/messageCapture.ts`
  - Hapus guard `isAgeRestrictedMessage` di `messageCreate` (baris 291) dan
    `messageUpdate` (baris 310). Jangan hapus guard `isExcludedThread`,
    `isBotExcludedChannel`, `shouldCaptureForAnyTarget`.
- `services/discord-gateway/src/modules/message-capture/archiveEmbedder.ts`
  - `archiveMessageEmbedded` terima flag/cek metadata age-restricted → skip
    embed untuk NSFW.
  - Call-site di `messageCapture.ts` `captureMessage` (baris 218) pass isNSFW
    atau cek dulu.

## Schema/type changes
- TIDAK ada perubahan DB schema. Metadata pesan sudah membawa `channel.nsfw`
  (`getMessageLocation`). Tidak perlu kolom baru — flag `age_restricted` sudah
  ditulis ke `ai_moderation_flags` lewat skip-result.

## Verification
- `pnpm typecheck`, `pnpm lint` (biome), `pnpm build` di `services/discord-gateway`.
- Unit test: pastikan ada test untuk age-restricted skip (sudah ada
  `tests/conversationContext.test.ts` ref nsfw; cek apakah ada test sesuai).
- Deploy via GHA push; verify pesan NSFW muncul di DB dan `ai_status` = clean
  dengan flag age_restricted, dan TIDAK ada panggilan LLM (log llm-caller tidak
  menampilkan id pesan NSFW).

## Request 2 (video) — NOT in this change
Fitur record video kamera/screenshare orang lain. @discordjs/voice hanya
mendukung **audio** receive. Video orang lain butuh WebRTC viewer baru
(SDP answer, decrypt H264/VP8, decode frame, mux MP4/WebM). Diluar scope
changeset ini; dicatat untuk desain lanjutan.
