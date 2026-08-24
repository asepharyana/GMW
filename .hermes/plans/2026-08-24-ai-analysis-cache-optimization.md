# Spec: Optimasi AI Analysis GMW — Naikkan Cache Hit Tanpa Kehilangan Akurasi

Tanggal: 2026-08-24 · Repo: `~/GMW` (branch `main`) · Service: `services/discord-gateway`

## Latar & Evidence (audit 2026-08-24)

State produksi:
- Qdrant `gmw_text_moderation`: **1.550 poin, status green** (vectors size 2048, Cosine).
- PG `text_analysis_cache`: 1.634 row `user_moderation`, 277 `vision_llm`; **sum(hit_count) = 0** →
  hit-rate tidak pernah terukur.
- Embedding aktif (`AI_LLM_EMBEDDING_MODEL` set, Nemotron-embed, dim 2048), `AI_LLM_EMBEDDING_MIN_SIMILARITY`
  tidak diset di BWS → default **0.97** (sangat konservatif).
- Messages: 9.375 total; 643 status `error` (banyak retry), 49 pending.

Temuan audit alur (`moderationOrchestrator.ts` → `textCacheStore.ts` → `qdrantClient.ts`,
`textBatchProcessor.ts`, `urlFetcher.ts`, `wikipediaClient.ts`, `visionAnalyzer.ts`):

| # | Temuan | Dampak |
|---|--------|--------|
| F1 | Exact-hash cache key menyertakan context (channel/thread) → teks sama di channel lain selalu miss | Killer hit-rate #1 |
| F2 | Semantic tier TIDAK memfilter context (Qdrant payload tak punya context) — sudah global tapi hanya aman krn sim 0.97 ketat | Inkonsisten dgn exact tier |
| F3 | Phase-1 lookup loop `await getCachedTextModeration(key)` per pesan → N round-trip PgBouncer per batch (60 msg = 60 query serial) | Latensi + beban DB |
| F4 | Verdict actionable (flagged/warn) dan clean sama-sama boleh di-serve semantic; toleransi akurasi beda | Risiko akurasi |
| F5 | `hit_count` tidak pernah di-increment oleh reader manapun | Hit-rate tak terukur |
| F6 | `wikipediaSearch()` (blok `<web_searches>`) tanpa cache — re-fetch tiap batch utk query sama | Latensi + spam ke WP |
| F7 | `fetchUrlSafely()` tanpa cache — link sama di batch berikutnya di-download lagi penuh | Latensi + bandwidth |
| F8 | Vision cache key dari data-URL base64 hasil resize → attachment sama via jalur berbeda (URL vs embed) = key beda → re-download + re-vision | Duplikasi kerja vision |

Non-goals: mengubah pipeline enforcement (auto-mute/ban trust-store writes), mengubah prompt
kebijakan moderasi, mengubah model/embedding provider.

## Desain

Semua perubahan degrade gracefully — cache gagal → perilaku lama (LLM). Akurasi dilindungi
asimetris: **hemat boleh untuk verdict non-actionable, konservatif untuk yang memicu aksi.**

### D1 — Cache metrics (F5)
- `textCacheStore.getCachedTextModeration()`: saat hit valid, increment `hit_count`
  (`UPDATE ... SET hit_count = hit_count + 1`) fire-and-forget (`.catch(()=>{})`), jangan blokir return.
- Log info periodik ringkas di orchestrator sudah ada ("User moderation cache applied") — cukup.

### D2 — Batched exact-cache lookup (F3)
- Fungsi baru `getCachedTextModerations(keys: string[]): Promise<Map<string, StoredModerationVerdict>>`
  di `textCacheStore.ts`: **satu** `SELECT ... WHERE text = ANY($1)` (chunk 200 key/query),
  parse + `normalizeStoredStatus` per row (reuse helper existing).
- Orchestrator fase-1: kumpulkan semua key unik → satu call batched → distribusi hasil.
- Semantik identik dengan loop lama (row expired/error-artifact tetap miss); hanya jumlah round-trip
  yang turun N→1.

### D3 — Global exact reuse untuk verdict non-actionable (F1)
- Key scoped-context TETAP ditulis (kompatibel, invalidasi moderator tetap presisi).
- Reader tambahan: kalau key `<ctx>:<hash>` miss, coba key legacy global `text_mod:<hash>` (bare).
- Guard akurasi (WAJIB semua terpenuhi):
  - `status === "clean"` DAN `flags.length === 0`;
  - `confidence >= AI_CACHE_GLOBAL_REUSE_MIN_CONFIDENCE` (default 0.85);
  - `recommendedAction === "none"`;
  - umur entry ≤ `AI_CACHE_GLOBAL_REUSE_MAX_AGE_H` (default 72h) — cek `analyzed_at`.
- Flag baru `policyVersion: "cached-global-clean-2026-08"` supaya terlacak di dashboard/log.
- Verdict flagged/warn TETAP context-scoped (tidak pernah lintas channel).

### D4 — Semantic dua-band similarity (F2+F4)
- Config baru: `AI_LLM_EMBEDDING_MIN_SIMILARITY_ACTIONABLE` default **0.97** (perilaku lama),
  `AI_LLM_EMBEDDING_MIN_SIMILARITY_CLEAN` default **0.92**, keduanya coerce number 0..1.
- Satu Qdrant batch search pakai threshold RENDAH (0.92). Per hit, klasifikasi ulang:
  - verdict non-actionable (clean, no flags, action=none): terima jika `score >= CLEAN_BAND`;
  - verdict actionable (warn/flagged atau flags ada / action != none): terima hanya jika
    `score >= ACTIONABLE_BAND` (0.97 — persis gate lama);
  - di antara dua band → buang hit, pesan lanjut ke LLM (fail-open ke akurasi).
- Legacy PG fallback path: filter serupa di `findSimilarTextModeration` via parameter band.

### D5 — Cache Wikipedia search (F6)
- `wikipediaClient.wikipediaSearch(query)`: cek `cacheGet(makeCacheKey("wikisearch", q))` dulu;
  miss → fetch (timeout existing) → sukses & hasil non-kosong → `cacheSet(..., TTL 6h)`.
  Hasil kosong TIDAK di-cache (biar retry nanti). Redis down → langsung fetch (no-op cache).

### D6 — Cache URL text fetch (F7)
- `urlFetcher.fetchUrlSafely(url)`: wrapper async memoize in-process LRU (max 500, TTL 30 menit)
  untuk `type === "text"` saja (image tetap selalu fresh-download karena dipakai sbg bukti vision
  + buffer besar; error tidak di-cache).
- Import `LRUCache` dari `lru-cache` (sudah dep gateway).

### D7 — Unified vision cache key (F8)
- `makeImageCacheKey(imageUrl)` di `textCacheStore.ts`: sebelum hash, strip query Discord CDN
  (`?ex=&is=&hm=` signed tokens, `format/width/height/size`) — regex `(\?[^#]*)$` dibuang bila host
  CDN discord (`cdn.discordapp.com`, `media.discordapp.net`, `images-ext-*.discordapp.net`);
  URL non-Discord: hash full URL seperti sekarang.
- Efek: attachment sama yang lolos lewat jalur embed vs inline vs re-fetch dgn token beda → SATU
  entry cache → skip download+vision kedua kali. Data-URL base64 tetap di-hash apa adanya.

## File yang disentuh

1. `src/shared/config/index.ts` — 3 config baru (D3×2, D4×2 — total 4 nilai, 3 baris zod + deskripsi).
2. `src/modules/ai-moderation/textCacheStore.ts` — hit_count inc (D1), batched getter (D2),
   global-reuse guard helper (D3), image-key normalize (D7).
3. `src/modules/ai-moderation/moderationOrchestrator.ts` — pakai batched getter (D2),
   global bare-key fallback (D3), dua-band semantic accept (D4).
4. `src/modules/ai-moderation/qdrantClient.ts` — `searchQdrantBatch` menerima threshold rendah
   (sudah parametrik — mungkin tanpa perubahan; verifikasi).
5. `src/modules/ai-moderation/wikipediaClient.ts` — cache layer (D5).
6. `src/modules/ai-moderation/urlFetcher.ts` — LRU text-fetch memoize (D6).

## Schema/type changes

- Tidak ada migrasi DB (kolom `hit_count`, `analyzed_at`, `expires_at` sudah ada).
- Tidak ada perubahan kontrak WS/oRPC/frontend.
- Type baru: none public; internal `StoredModerationVerdict` dipakai ulang.

## Verification

1. Unit tests baru (`tests/`):
   - `cacheBatchLookup.test.ts`: batched getter — hit/miss/expired/error-artifact mapping,
     chunking >200 keys (mock executeAll), hit_count increment called.
   - `globalReuseGuard.test.ts`: guard menerima clean+conf≥0.85+action none+umur ≤72h;
     menolak flagged/warn/conf rendah/action≠none/stale.
   - `semanticBands.test.ts`: clean @0.93 diterima, flagged @0.93 ditolak, flagged @0.98 diterima.
   - `imageKeyNormalize.test.ts`: URL Discord dgn/ex token → key sama; non-Discord beda query → beda.
2. Gate service: `pnpm typecheck && pnpm exec biome check --diagnostic-level=error . && pnpm exec vitest run`.
3. Deploy via GHA (`git push origin main`) → watch `Build & Deploy (Nix)` → verifikasi
   `systemctl show gmw-discord-gateway -p ActiveEnterTimestamp` baru.
4. Runtime probe pasca-deploy: journalctl level 30 normal; beberapa jam kemudian
   `SELECT sum(hit_count) FROM text_analysis_cache WHERE source='user_moderation'` > 0 membuktikan
   metrics jalan; log "User moderation cache applied" menunjukkan hits>0 pada traffic ramai.

## Rollback

Semua fitur behind config defaults yang mempertahankan perilaku lama pada nilai konservatif;
rollback = redeploy commit sebelumnya (tanpa migrasi DB, tanpa state eksternal).
