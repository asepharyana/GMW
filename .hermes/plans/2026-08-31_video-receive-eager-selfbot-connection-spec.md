# Spec: Fix Video Capture — Eagerly Establish the Selfbot Voice Connection at Join Time

Status: PLANNED
Date: 2026-08-31
Author: Hermes
Related: `.hermes/plans/2026-08-31_video-receive-phaseC-spec.md` (Phase C build, made Option A this fix)

## Symptom (from live logs, 2026-08-31 ~12:34)
A user was actively screen-sharing + on camera in the recorded voice channel.
The gateway recorded MANY users' audio (.ogg) fine, but video capture produced
nothing. The only video signal in `journalctl -u gmw-discord-gateway` was:

```
[VOICE (guild:2)]: Sending voice state update: {"self_mute":false,...,"flags":2}
[VOICE] received voice state update: {member hunterz ...}   # OTHER user, not bot
[VOICE] connection? true, guild session channel
[VOICE (guild:2)]: Setting sessionId <S> (stored as "undefined")
[VOICE (guild:2)]: Authenticated with sessionId <S>         # debug print only
[VOICE (guild:2)]: Authenticate failed - VOICE_CONNECTION_TIMEOUT   # +15s
video-recorder: userId=..., "Connection not established within 15 seconds."
```

## Root cause (verified against discord.js-selfbot-v13 3.7.1 source)
The gateway records audio via `@discordjs/voice` (`joinVoiceChannel` + adapter).
Video receive lives on the SEPARATE selfbot `ClientVoiceManager.connection`
(a singleton `VoiceConnection`). `videoRecorder.ts` currently calls
`client.voice.joinChannel(channel)` LAZILY — only when a `voiceStateUpdate`
shows `newState.streaming === true`.

At that moment the bot is ALREADY connected to the channel via @discordjs/voice.
A selfbot `joinChannel` then does `VoiceConnection.authenticate()` →
`sendVoiceStateUpdate()`, and waits for a fresh `VOICE_SERVER_UPDATE`
(`setTokenAndEndpoint`) + `VOICE_STATE_UPDATE` (`setSessionId`) to reach
`checkAuthenticated()` (needs token+endpoint+sessionId). Because the bot is
already in an established voice session, Discord does NOT emit a new
`VOICE_SERVER_UPDATE` for the lazy selfbot re-join → token/endpoint never set →
15s `VOICE_CONNECTION_TIMEOUT`.

This is fatal to video: `joinStreamConnection(userId)` (STREAM_WATCH op 20) and
`receiver.createVideoStream(userId, out)` (Recorder/ffmpeg) BOTH live on the
parent selfbot `VoiceConnection` and require it `CONNECTED` (its own voice
WS+UDP socket feeds `PacketHandler.push`, authenticated with
`authentication.secret_key`).

## Fix — establish the selfbot connection eagerly, at voice-join time
The selfbot `VoiceConnection` must exist and be `CONNECTED` before any streamer
appears. Establish it once, synchronously alongside the @discordjs/voice join in
`recorder.startRecording`, so it rides the bot's FRESH voice join — when Discord
DOES emit VOICE_SERVER_UPDATE. Then cache it and let `videoRecorder` reuse it.

Ordering: in `startRecording`, after the @discordjs/voice `joinVoiceChannel`
returns (and retries) — fire `ensureSelfbotVoice(channel)` best-effort:
1. `await client.voice.joinChannel(channel, { selfMute:false, selfDeaf:false,
   selfVideo:false })` (rejects ~VOICE_CONNECTION_TIMEOUT on failure → log +
   return null; do NOT block audio).
2. Cache the returned selfbot `VoiceConnection` keyed by guildId.
3. Wire teardown: on `recorder` voice stop / destroyed → `untrackChannel` +
   destroy the cached selfbot connection (`disconnect()`).

`videoRecorder.startVideoRecording` then uses the cached selfbot connection:
- If cached & `status === CONNECTED` → use it.
- Else → fall back to a lazy `joinChannel` (still best-effort).

## The two-connection coexistence risk (must verify live)
@discordjs/voice (audio) and the selfbot `VoiceConnection` (video) each open
their OWN low-level voice WS+UDP on the same session. The spec's original
open-question flagged this. Mitigations:
- Clear logging: `Selfbot voice connected (guild=...)`, plus a periodic
  `djs/voice status` log so we can confirm audio stays `READY` while the selfbot
  connection is up.
- If Discord kicks/breaks the audio connection, logs will show
  @discordjs/voice `Disconnected`/reconnect churn — we detect and pivot.

## Files touched
- `services/discord-gateway/src/modules/voice-recording/videoRecorder.ts`:
  add `ensureSelfbotVoice(channel)` (return cached/connected), use it in
  `startVideoRecording`, add `destroyGuildSelfbotVoice(guildId)`,
  richer status logging.
- `services/discord-gateway/src/modules/voice-recording/recorder.ts`: call
  `ensureSelfbotVoice(channel)` after `joinVoiceChannel` (best-effort);
  call `destroyGuildSelfbotVoice` on voice stop/destroy.
- Tests: `tests/videoRecorder.test.ts` (update to assert eager-connection reuse
  + status gating).

## Verification
1. `pnpm typecheck` + `pnpm build` + biome clean (discord-gateway).
2. Tests green.
3. Commit + push; CI `Build & Deploy (Nix)` green, service restarts.
4. LIVE (deploy): join a channel with the bot → journal shows
   `Selfbot voice connected` (parent CONNECTED). When a member streams →
   `Sender signal screenshare` / `Video recorder ready` + a `.mkv` under
   `<RECORDINGS_DIR>/<uid>/video-*.mkv`; playable via ffmpeg. Confirm audio
   recording still flows (no djs/voice reconnect churn).
