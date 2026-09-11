# Spec: Perbaiki Delay Attachment 162s→<20s (GMW AI Analysis)

Tanggal: 2026-08-24 · Repo `~/GMW` · Service discord-gateway

## Evidence (audit produksi)

Klaster pesan attachment delay ~330–400 detik. Trace pesan `1541417073245290638` (.gif):
19:01:08 dibuat → 19:01:09 batch incomplete → fan-out individual → **guard upload-pending
mengembalikan `results:[]`** → diperalakukan sukses (`complete ... (undefined)`) → row
tertahan `ai_status='processing'` **tanpa penanggung jawab** → 19:06:12 cleanup mengembalikan
ke `pending` (tepat 300s) → baru dianalisis. Plus vision gagal 3× utk GIF besar
("Stream ended before producing a non-ping SSE event") → degradasi teks.

## Root causes

- **A (fatal)**: `individualFallbackProcessor.processIndividualFallback` memperlakukan
  `ok:true + results:[]` sebagai sukses. Race-guard upload di `ai-analysis-worker.processIndividual`
  sengaja balik `results:[]` (desain lama) → pesan yatim `processing` sampai cleanup 300s.
- **B**: `llmVision` hanya mencoba `stream:true`; kegagalan SSE truncation pada gambar besar
  = 3 retry sia-sia (semua jalur sama) → bukti media hilang.
- **C**: safety-net cleanup 300s terlalu lambat sbg satu-satunya pemulih `processing`.

## Fix

1. **F1 — sinyal eksplisit upload-pending**: `IndividualOkResponse` + field opsional
   `uploadPending?: boolean`. Worker set `uploadPending:true` saat race guard kena.
2. **F2 — processor menangani 3 kondisi** via helper murni baru
   `classifyIndividualWorkerResult(result): "success" | "upload_pending" | "incomplete" | "error"`
   (modul baru `fallbackResultClassifier.ts`, zero-dep agar mudah dites):
   - `upload_pending` → tulis ulang row ke `pending` (pola sama dgn revert apiFailed di
     batchProcessor) + broadcast + **re-schedule analisis percakapan segera**
     (dynamic import batchScheduler, pola anti-siklus yg sudah ada) → retry dalam ~250ms
     begitu upload beres. Bukan error, tidak naikkan CB counter.
   - `incomplete` (flags analysis_incomplete) → perilaku lama (exhausted path).
   - `error` / `results kosong tanpa penjelasan` → throw transien (retry oleh recovery),
     BUKAN sukses palsu. Log "(undefined)" hilang.
3. **F3 — vision non-stream fallback**: di `llmVision`, jika error match
   `/Stream ended before producing a non-ping SSE|stream ended/i` → coba SEKALI lagi dengan
   `stream:false` (router agregasi penuh; timeout tetap 60s). Konversi hard-fail jadi sukses.
4. **F4 — turunkan safety net**: default `revertStuckProcessingMessages` 300000 → 120000 ms.

## File disentuh

- `src/modules/ai-moderation/fallbackResultClassifier.ts` (BARU, pure)
- `src/modules/ai-moderation/ai-analysis-worker.ts` (tipe + set flag uploadPending)
- `src/modules/ai-moderation/individualFallbackProcessor.ts` (konsumsi classifier + reschedule)
- `src/modules/ai-moderation/llmClient.ts` (fallback non-stream di llmVision)
- `src/modules/message-capture/messagesCleanup.ts` (default 120s)

## Verifikasi

- Test baru `tests/fallbackResultClassifier.test.ts` (4 klasifikasi + edge kosong).
- Gate: tsc --noEmit, biome error-level, vitest run semua hijau.
- Deploy GHA sukses; pasca-deploy: pesan attachment baru p50 < 20s
  (`SELECT percentile_cont(0.5) ... WHERE metadata attachments>0 AND created_at > deploy`),
  tidak ada lagi "complete ... (undefined)".
