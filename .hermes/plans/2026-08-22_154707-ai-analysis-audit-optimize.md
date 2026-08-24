# AI Analysis Flow — Audit & Optimization (discord-gateway)

**Goal:** Analisis alur AI analysis end-to-end, temukan bug/inconsistency yang merusak kualitas verdict, lalu perbaiki root cause-nya.

## Scope
- `services/discord-gateway/src/modules/ai-moderation/**`
- Tidak menyentuh chatbot backend / frontend.

## Alur saat ini (hasil tracing)
```
message capture → aiAnalyzer.queueMessageAnalysis(messageId)
  → batchScheduler.scheduleConversationAnalysis(conversationKey)   [debounce 250ms, CB gate]
  → messageStore.getPendingMessagesByConversation(≤200)
  → skipAgeRestrictedMessages
  → pickBatchWithinBudget(14000 tokens, 50/msg)
  → processBatch [Piscina worker, ≤4 threads]
      → ai-analysis-worker.processBatch
          → getConversationContextBefore(20 msgs) + attachments
          → attachment-upload race guard (pending upload → skip)
          → runModerationAnalysis
              → Phase 1: exact-hash cache (PG text_analysis_cache, per channel/thread)
              → Phase 2: semantic cache (embedTexts → Qdrant batch search; PG fallback)
              → split text-only vs media
              → runTextOnlyBatch: URL fetch + wiki search + glossary (paralel)
                  → dedup short messages → sub-batches (60/sub-batch)
                  → vision evidence utk URL images (hoisted, 15s cap per image)
                  → callModerationLLM per sub-batch (stream:true, retries 3, JSON parse + correction retry)
              → runMediaBatch: download → vision per image (cache LRU→DB→live, lock) → 1 LLM call
              → setCachedTextModeration (PG + Qdrant upsert w/ embedding)
          → normalizeResult (confidence clamp, fallback analysis)
          → updateMessagesAIAnalysisBulk → broadcast + scheduleAutoDelete
  → recovery worker tiap 10s: pending keys → re-schedule; incomplete → individual fallback queue
  → individual fallback: 1 msg = 1 worker job (context + full LLM)
  → cache prune tiap 6 jam (PG expired + Qdrant expired points)
```

## Temuan audit (ranked)

### F1 — Cache hit menghapus status "warn" (BUG AKURASI)
`moderationOrchestrator.ts` Phase-2 semantic hit & PG-fallback memetakan status via
`parseQdrantVerdict`: storedStatus bukan "warn"/"flagged" → dipaksa "clean".
TAPI exact-hash lookup (`getCachedTextModeration`, textCacheStore.ts:288-295) lebih parah:
hanya menerima "clean"|"flagged" — **"warn" jatuh ke branch flags.length===0 ? clean : flagged**
→ warn dengan flags=["conflict_instigation"] dibaca sebagai FLAGGED.
Efek: auto-delete eligibility (butuh recommendedAction delete/escalate + severity list) salah baca;
dashboard menampilkan flagged padahal verdict asli warn. Root cause: type narrowing legacy
(`status: "clean" | "flagged"`) tidak diupdate ketika "warn" ditambahkan ke schema.

### F2 — Exact-cache key mengabaikan edit (BUG EVASION)
Key = sha256(content)+context. Pesan yang DIEDIT (`edited_content`) menghasilkan hash berbeda,
tapi verdict lama utk konten pre-edit tetap hidup; lebih penting: pesan edited="true" adalah sinyal
evasion di prompt, sedangkan cache bisa menyajikan verdict dari konten lama jika content sama.
(Minor, tapi konsistensi: `resolveIsEdited` ada di prompt, tidak ada di cache key.)

### F3 — `pickBatchWithinBudget` skip-bukan-break (LATENSI/KUALITAS)
Loop `if (usedTokens + msgTokens <= maxTokens) {push}` — pesan BESAR di tengah list dilewati
dan iterasi lanjut mencoba msg berikutnya. Efek: batch berisi "lubang" (msg pending tetap pending,
dianalisis di gelombang berikutnya = LLM call tambahan). Ini by-design tolerable, tapi ada bug halus:
pesan >budget tunggal tidak pernah masuk (scheduler sudah punya fallback slice(0,1), OK).
Keputusan: biarkan (bukan bug nyata), catat saja.

### F4 — `callModerationLLM` max_tokens 16384 hardcoded (COST)
Sub-batch 60 pesan × output ~150 token/pesan ≈ 9k token cukup; 16k aman. Biarkan.

### F5 — Dead code builder user-profile/reputation
`buildUserProfilesBlock`, `buildUserProfileRef`, `UserProfileEntry` di moderationBuilders.ts
tidak dipakai lagi sejak context minimization (hanya tests). `<user_history>` juga tak pernah
di-inject (rules masih menyebutnya — misleading bagi model). Bersihkan referensi prompt.

### F6 — rules.ts menyebut `<user_history>` yang tidak pernah ada di payload
Model diberi instruksi tentang blok yang tak pernah muncul → pemborosan token + potensi
kelakuan aneh ("menunggu" data yang tak ada). Hapus/ubah kalimat.

### F7 — system.ts "Blok Data" menyebut `<term_glossary> (SearXNG)` — STALE
Sumber sudah Wikipedia. Komentar kode & teks prompt menyebut SearXNG. Perbaiki teks (kecil).

### F8 — output.ts typo "secifik", baris tabel `-|-` rusak
Kualitas prompt: typo + markdown table broken (`||-`) di beberapa baris. Rapikan.

### F9 — llmCaller parse-error correction tail hanya di SYSTEM
Correction tail ditambahkan ke system prompt; provider caching fine, tapi preview invalid
content (800 char) ikut SYSTEM — ok. Skip.

### F10 — `getLlmSemaphore` race kecil saat config berubah di tengah flight
Non-issue praktis (config statis per proses). Skip.

## Keputusan perbaikan (yang dieksekusi sekarang)
1. **F1 (utama):** normalisasi status di SATU tempat — `normalizeStoredStatus()` di
   textCacheStore.ts yang menerima clean/warn/flagged; pakai di getCachedTextModeration
   DAN parseQdrantVerdict; perluas return types ke union penuh. Orchestrator tinggal pakai.
2. **F6+F7+F8:** bersihkan stale references di prompts (user_history, SearXNG, typo).
3. **F5:** hapus dead builders + test-nya (biome/tsc yang jaga).
4. Regression test untuk F1 (vitest): warn tersimpan → warn terbaca (exact + qdrant path).

## Files touched
- services/discord-gateway/src/modules/ai-moderation/textCacheStore.ts (F1)
- services/discord-gateway/src/modules/ai-moderation/moderationOrchestrator.ts (type only)
- services/discord-gateway/src/modules/ai-moderation/prompts/rules.ts (F6)
- services/discord-gateway/src/modules/ai-moderation/prompts/system.ts (F7)
- services/discord-gateway/src/modules/ai-moderation/prompts/output.ts (F8)
- services/discord-gateway/src/modules/ai-moderation/moderationBuilders.ts (F5)
- services/discord-gateway/tests/contextEnrichment.test.ts (F5 test cleanup + F1 regression test baru)

## Verification
```
cd services/discord-gateway
npx tsc --noEmit
npx biome check --diagnostic-level=error .
npx vitest run
```
Semua harus hijau sebelum commit. Deploy via GHA (push main) — user konfirmasi belakangan.
