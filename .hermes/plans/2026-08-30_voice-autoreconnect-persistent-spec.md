# Spec: Voice auto-reconnect (persistent state + rejoin on drop)

## Goal
Setelah `VoiceController.connect()` berhasil, state "sedang merekam di <guild>/<channel>"
disimpan di Postgres. Kalau gateway restart/reboot, atau koneksi voice drop tidak
disengaja (dikeluarkan/moved/server restart), gateway otomatis join ulang ke channel
yang sama.

## Requirement mapping (user's ask)
- "autoreconnect ke channel yg sama jika server restart atau reboot" → reconnect on
  startup (ready handler) + keep DB record across graceful shutdown.
- "state nya persistent di db" → `voice_auto_reconnect` table.
- "rejoin jika tidak sengaja dikeluarkan" → watchdog on `Disconnected`/`Destroyed`
  (kick / moved / voice server restart) → full rejoin with backoff.
- Manual leave (`/voice disconnect`, dashboard disconnect) MUST NOT rejoin.

## Design decisions
1. **New table** `voice_auto_reconnect` (dedicated, not `ui_state`):
   - `guild_id` text PK
   - `channel_id` text NOT NULL
   - `channel_name` text
   - `connected_at` bigint epoch-ms
   - `updated_at` bigint epoch-ms
   DAO: `voiceAutoReconnectRepo.ts` — `upsert(record)`, `list()`, `delete(guildId)`.
2. **Write on connect**: `VoiceController.connect()` → after `startRecording` success →
   `upsert`. IDEMPOTENT (upsert per guild).
3. **Clear on manual leave**: `handleVoiceDisconnect` (all) + `handleVoiceDisconnectGuild`
   pass `clearPersisted: true`. Graceful shutdown `disconnect()` keeps the record.
4. **Rejoin on startup**: bootstrap `ready` → `await voiceController.autoReconnect()`
   (list persisted → connect each, non-fatal on failure).
5. **Rejoin on unexpected drop**: monitor per-connection; on `Disconnected`/`Destroyed`
   with `!intentional` → schedule rejoin `connect(guildId, persistedChannelId)` with
   backoff (min 2s, max 30s, max 5 attempts). Track `rejoinAttempts`, reset on success.
6. **Intentional flag**: `disconnectGuild(guildId, { clearPersisted?, intentional? })`.
   - shutdown `disconnect()` → `{ intentional: true, clearPersisted: false }`.
   - manual `disconnect()` (dashboard) → `{ clearPersisted: true }`, sets intentional.
   - manual `disconnectGuild` → `{ clearPersisted: true }`, sets intentional.
   The monitor checks `intentional` before rejoin; `clearPersisted` only deletes the row.

## Files touched
- `services/discord-gateway/src/shared/database/schema.ts` — add `pgVoiceAutoReconnectTable`
  + types.
- `services/discord-gateway/src/shared/database/voiceAutoReconnectRepo.ts` (NEW) — DAO.
- `services/discord-gateway/src/modules/voice-recording/voiceController.ts` — upsert on
  connect; monitor + rejoin; `autoReconnect()`; `disconnect/disconnectGuild` opts.
- `services/discord-gateway/src/modules/command-handler/voice.handler.ts` — manual
  disconnect/disconnectGuild pass `clearPersisted: true`.
- `services/discord-gateway/src/app/bootstrap.ts` — call `voiceController.autoReconnect()`
  in `ready`.
- `services/discord-gateway/drizzle/migrations/0020_add_voice_auto_reconnect.sql` +
  `meta/_journal.json` entry (apply manually per gmw-ops).

## Edge cases
- Channel deleted / guild lost while persisted → `connect()` throws (channel not found)
  → log + delete persisted row (don't retry forever).
- Rejoin attempts exhausted → keep row (so next restart retries) + log.
- Multiple guilds: per-guild monitor, per-guild persisted row.
- Graceful shutdown order: shutdown sets intentional=true (so no rejoin during teardown)
  but keeps row.

## Verification
- `pnpm typecheck && pnpm build && pnpm lint` in `services/discord-gateway`.
- Apply migration `0020` manually; verify table exists.
- CI `Build & Deploy (Nix)` green; gateway deploy lands.
- Manual: connect via dashboard → check `voice_auto_reconnect` row; simulate drop →
  confirm rejoin; manual disconnect → row cleared.