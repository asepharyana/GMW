# FE Optimasi: Error Handling, State Refactor, Polish

**Scope:** `services/frontend/src` — Next.js 16, React 19, SWR, oRPC-over-WS.
**Branch:** `feat/fe-error-handling-state` (buat baru dari `main`).
**User:** MythEclipse — bahasa Indonesia/Inggris campur, "gas" = eksekusi langsung.

## 1. Masalah yang teridentifikasi

### 1.1 Error handling tidak seragam
- `ErrorState` (states.tsx:126) sudah ada dengan `onRetry?`, tapi **80% pemanggilan tidak pass `onRetry`** → user stuck, harus refresh manual.
- Pola `if (error && !data) return <ErrorState />` berulang di 5+ view, setiap satu hardcode logic-nya.
- `useAction` (use-action.ts) set `error` di state tapi komponen pakai `try/catch` lokal juga — **dua error states** (hook `action.error` + lokal `catch (e)`).

### 1.2 State duplication / double source of truth
- `useReview` (use-messages.ts:129) pakai `refreshInterval: 15_000` (polling) padahal WS sudah broadcast `moderation_action` real-time. **Polling + WS = double-fetch + race condition.**
- `page.tsx` dan `view.tsx` duplikat state `guildId`/`channelId`/`query` — logic selection ada di 2 tempat.
- Chatbot pakai local `failed` state + `setFailed(text)` untuk retry, tapi `useAction` sudah ada `error` field yang tidak dipakai.
- `useSpeakers` (use-voice.ts:50) pakai local `useState` untuk speakers, bukan SWR → tidak konsisten dengan pola SWR yang dipakai semua hook lain.

### 1.3 WebSocket error/user feedback lemah
- `WsConnection.onerror` (connection.ts:78) cuma `setStatus("error")` — tidak ada info ke user "reconnecting… (attempt N)".
- Tidak ada broadcast error ke komponen (tidak ada `ws_error` handler).

## 2. Rencana perubahan

### 2.1 Standardisasi ErrorBoundary + Retry (FE-only)
**File:** `src/components/shared/states.tsx`
- Tambahkan komponen `ErrorBoundary` (React error boundary untuk crash React, bukan fetch error).
- Refactor semua `<ErrorState error={error} />` → `<ErrorState error={error} onRetry={retryFn} />`.
- Tambahkan helper `withSWR` atau pattern: tiap view pakai `error` + `mutate`/`refetch` dari SWR dan pass ke ErrorState.

**File:** `src/app/(dashboard)/*/view.tsx` (6 files)
- Setiap `ErrorState` dapat `onRetry` yang memanggil `mutate`/`refetch`.
- `DashboardView`: `onRetry={() => void mutate(["dashboard-stats"])}` — tapi SWR keys tersebar. Solusi: export `mutate` via custom hook atau pakai `useSWR` config `onErrorRetry` global.
- **Keputusan:** gunakan pola **global SWR config** (`src/lib/swr-config.ts`) dengan `onErrorRetry` backoff, dan tiap view pass `onRetry` explicit ke ErrorState.

### 2.2 Hapus polling `useReview`, ganti WS-driven
**File:** `src/hooks/use-messages.ts`
- Hapus `refreshInterval: 15_000` dari `useReview`.
- Tambahkan `useReviewWsSync(ws)` — subscribe ke `moderation_action` WS event, mutate key `["messages-review", channelId]`.
- Backend sudah broadcast `moderation_action` via WS (redis-channels.ts:130). Review messages yang di-flag akan dapat `moderation_action` event. **Bisa pakai ini.**

**File:** `src/app/(dashboard)/messages/view.tsx`
- Tambahkan `useReviewWsSync(ws)` call.

### 2.3 Konsistensi state: `useSpeakers` → SWR
**File:** `src/hooks/use-voice.ts`
- Refactor `useSpeakers` agar pakai SWR key `["voice-speakers"]` + initialData dari `useVoiceStatus`. Ini memungkinkan revalidate + cache sharing.
- Tapi `voice_state` dan `voice_active_user` adalah WS events — perlu persist ke SWR cache via `mutate`. Refactor: `useSpeakers` subscribe WS + mutate SWR key.

### 2.4 Chatbot: gunakan `useAction` error state, hapus duplikat `failed`
**File:** `src/components/chatbot/chatbot.tsx`
- Hapus `const [failed, setFailed]` — sebalihoikan ke `useAction` return `error`.
- Tapi `useAction` `mutateAsync` throw — perlu catch. Refactor: pakai `mutate` (fire-and-forget) + `isPending` + `error`.
- **Note:** chatbot pakai `send` yang butuh pemuatan history — tetap pakai local state untuk msgs tapi gunakan `action.error` untuk display.

### 2.5 WS error feedback
**File:** `src/lib/ws/connection.ts`
- `onerror` emit kode/status ke status listeners.
- Tambahkan method `getReconnectAttempt()` atau expose via status change.

**File:** `src/lib/ws/context.tsx`
- Subscribe `onStatusChange` di `WsProvider`, toast "Reconnecting… (attempt N)" ketika status `error`/`connecting`.

## 3. Verification
- `npx tsc --noEmit` — compile OK
- `npx biome check src/` — lint OK
- `npm run build` — build OK (Next 16 SSG/SSR)
- Manual: refresh halaman, pastikan ErrorState muncul dengan tombol Retry yang bisa diklik.

## 4. Files yang disentuh
```
src/components/shared/states.tsx          # ErrorBoundary + helper
src/lib/swr-config.ts                     # global SWR config (baru)
src/hooks/use-messages.ts                 # useReviewWsSync, hapus polling
src/hooks/use-voice.ts                    # useSpeakers → SWR
src/hooks/use-action.ts                   # expose resetError
src/lib/ws/connection.ts                  # reconnect info
src/lib/ws/context.tsx                    # WS error toast
src/app/(dashboard)/messages/view.tsx     # useReviewWsSync
src/app/(dashboard)/messages/page.tsx     # SSR error passthrough
src/app/(dashboard)/moderation/view.tsx   # onRetry
src/app/(dashboard)/dashboard/view.tsx    # onRetry
src/app/(dashboard)/voice/view.tsx        # onRetry
src/app/(dashboard)/media/view.tsx        # onRetry
src/app/(dashboard)/recordings/view.tsx   # onRetry
src/components/chatbot/chatbot.tsx        # pakai useAction error
```

## 5. Out of scope (BE)
- Regex heuristic di moderation.repository.ts (scam domain extraction) — ini BE task, catat tapi jangan sentuh kecuali diminta.
