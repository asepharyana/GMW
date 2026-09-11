# Optimisasi "non-issue" AI analysis pipeline

## Scope
Dua item yang sebelumnya dinyatakan non-issue, kini dioptimalkan + 1 bug ordering
yang ditemukan saat menelusuri:

1. **pickBatchWithinBudget: skip → break.** Pesan diurutkan `created_at ASC`
   oleh DB. Setelah budget habis, pesan berikutnya pasti lebih besar/lebih kecil
   arbitrer — skip-then-take menghasilkan batch non-kontigu (ada gap analisis
   di tengah timeline). Ubah jadi stop at first overflow (break) supaya prefix
   kronologis utuh; sisanya otomatis diambil gelombang berikutnya
   (`shouldScheduleNext` sudah selalu true setelah sukses).
2. **max_tokens dinamis.** Hard-coded 16384 di llmCaller.ts → parameter
   opsional `maxTokens?`; default tetap 16384. Caller text/media batch pass
   nilai berbasis ukuran prompt (tiktoken) dengan floor/ceiling.
3. **Bug ordering UPDATE..RETURNING (bonus).** messagesAnalysis.ts
   `getPendingMessagesByConversation`: SELECT ids di-order `created_at ASC`
   tapi UPDATE...RETURNING tanpa ORDER BY → urutan rows balik tidak
   terjamin. Konsumen pakai messages[0] sebagai anchor konteks
   (beforeCreatedAt) dan pickBatchWithinBudget asumsi urutan. Fix: re-sort in
   JS by created_at (stable) sebelum return.

## Files touched
- src/modules/ai-moderation/batchProcessor.ts — break bukan skip; test baru.
- src/modules/ai-moderation/llmCaller.ts — param maxTokens.
- src/modules/ai-moderation/textBatchProcessor.ts / mediaBatchProcessor.ts —
  hitung token prompt & pass maxTokens.
- src/modules/message-capture/messagesAnalysis.ts — sort hasil RETURNING.
- tests/batchBudget.test.ts — baru.

## Verification
cd services/discord-gateway && bun run typecheck && bun run lint && bun run test
lalu commit+push, watch GHA, restart service via deploy pipeline.
