# Spec: Selfbot-Viable Video Capture — manual screen-share watch command (Phase D)

Status: PLANNED (not yet built)
Date: 2026-09-02
Author: Hermes
Related: `.hermes/plans/2026-08-31_video-receive-phaseC-spec.md` (auto-receive, superseded
for selfbot), `gmw-ops/references/selfbot-presence-detection-limits.md`,
`gmw-ops/references/discord-voice-fork-video-receive.md`

## TL;DR — the decisive finding (verified live 2026-09-02)

User insists on keeping the **selfbot** (no bot-token migration). Live diagnostics prove
a selfbot CANNOT auto-detect other members' camera/share because:
- It never receives `VOICE_STATE_UPDATE` for other members (only its own).
- `guild.members.fetch()` → 403, `GET /channels/{id}/voice-states` → 404.
- No `GUILD_CREATE`, no `READY.broadcaster_user_ids` presence.
- `scanExistingStreamers` + `handleVoiceStateUpdate` (the only two `startStreamWatch`
  triggers) are therefore both **dead on a selfbot**.
- No manual watch command exists today, so even on-demand capture is impossible.

→ The ONE selfbot-viable path is a **manual, operator-initiated STREAM_WATCH** on a
   member known to be screen-sharing. Gateway op 20 (STREAM_WATCH) is **NOT gated on
   bot-vs-user**; the DAVE handshake to Ready+MLS was already verified live in earlier
   sessions. The receive/mux/segment/upload pipeline (`streamWatchReceiver.ts`) is already
   built and only lacks a real streamer to produce its first `.mp4`.

Camera-of-others is NOT viable on a selfbot even with `unknown-ssrc` fallback:
`@discordjs/voice` `parsePacket` calls `daveSession.decrypt(packet, userId)` keyed per
REAL userId (vendor fork dist/index.js:2143), so a fake id selects no MLS decryptor →
garbage, not H264. (The uncommitted `unknown-ssrc` change was reverted this session.)

Selfbot CAN capture the OWNER's own video (its own VOICE_STATE_UPDATE + fork op12
videoSSRC are attributable), but `videoRecorder.ts` hard-skips its own id — parameterized
self-capture is a follow-up, not the default.

## Goal

Add a **manual watch command** so an operator can say "record <member>'s screen share"
and the gateway `startStreamWatch`s that member → DAVE watch → per-burst `.mp4` segments
(mirroring voice silence split) → upload → DB `voice_recordings` → dashboard `<video>`.

This is the only form of OTHER-member video capture a selfbot can deliver, and it is
genuinely buildable with the existing receive pipeline.

## Scope / files

Gateway (`services/discord-gateway`):
- New command type `VIDEO_WATCH` + handler in `command-handler/` (dedicated
  `video.handler.ts`), routed via `createHandlerRegistry`.
- Handler resolves a VoiceChannel (from persisted `voice_auto_reconnect` / active
  connections) + target memberId from the command payload, calls
  `startStreamWatch(channel, memberId)` (already exported).
- Idempotent (startStreamWatch early-returns if a watch exists); a `VIDEO_UNWATCH`
  command calls `stopStreamWatch(guildId, userId)`.
- Reply: success/failure via the standard `CommandReply` publish.

Backend (`services/backend`):
- oRPC procedure (or the existing command bridge) that publishes a `VIDEO_WATCH`
  command to `backend:command` with `{ guildId, channelId, userId }`. Reuse the same
  bridge the FE already uses for voice commands.

Frontend (`services/frontend`):
- A "Video Watch" control: pick a voice member + a "Record screen" button → calls the
  backend procedure. Shows live status (watching / recording / segments uploaded).

(Each layer optional independently; gateway alone gives a Redis-testable path.)

## Verification
1. `pnpm typecheck` + `pnpm build` + `biome check src/` green in discord-gateway.
2. Unit test: handler publishes reply + calls startStreamWatch with the right args
   (mock the module).
3. Live: operator invokes `!videorec <member>` while that member screen-shares →
   journal shows `Sending STREAM_WATCH` → `STREAM_CREATE` → `DAVE watch READY` → `Video
   burst opened` → `Video muxed to mp4` → a `video-*.mp4` appears under
   `<recordingsDir>/<uid>/` and a `video-%` row lands in `voice_recordings`.
4. `Build & Deploy (Nix)` CI green.

## Out of scope (documented dead ends on selfbot)
- Auto camera/share capture of OTHER members (impossible at detection layer).
- Camera-of-others via `unknown-ssrc` (DAVE decrypt needs real userId).
- Bot-token migration (user declined).
