# Spec: Record Other Users' Video (Camera / Screen Share) — Phase C

Status: PLANNED (not built)
Date: 2026-08-31
Author: Hermes
Related: `.hermes/plans/2026-08-30_video-record-receive-spec.md` (Phase A/B — raw UDP hook, superseded for receive)

## TL;DR — what changed vs Phase A/B

Phase A/B (commit `999c054b` etc.) hooked `@discordjs/voice`'s UDP socket to capture non-opus RTP and
depacketize H264 → mp4. **It captured ZERO video** because `@discordjs/voice` never authorizes the bot to
receive others' video (no STREAM_WATCH). This spec replaces that approach with the **native, selfbot-lib
receive path**, which is battle-tested and does the authorization + decryption + ffmpeg muxing for us.

## Ground truth (verified in discord.js-selfbot-v13 3.7.1 source)

1. `ClientVoiceManager.joinChannel(channel, config)` → a **selfbot `VoiceConnection`** with
   `.receiver` (`VoiceReceiver` → `PacketHandler`). [ClientVoiceManager.js:102-118]
2. `VoiceConnection.receiver` is created in the constructor. [VoiceConnection.js:140]
3. `VoiceReceiver.createVideoStream(user, output)` → `PacketHandler.makeVideoStream` → **`Recorder`**
   (ffmpeg that muxes H264+Opus RTP over UDP → **Matroska (.mkv)**). [Receiver.js, Recorder.js]
4. `PacketHandler` routes: video RTP → Recorder UDP 65506, opus RTP → UDP 65510; decodes all via
   `connection.authentication.{secret_key, mode}` (supports `aead_aes256_gcm_rtpsize` and
   `aead_xchacha20_poly1305_rtpsize` = DAVE-compatible). [PacketHandler.js:115-155, 195-240]
5. `StreamConnectionReadonly.joinStreamConnection(userId)` + `sendSignalScreenshare()` sends
   gateway op `STREAM_WATCH` so Discord actually forwards the streamer's RTP to us. [VoiceConnection.js:1100-1240]
6. `VoiceState.streaming` = `data.self_stream ?? false` — lets us detect a streamer on voice state update. [VoiceState.js:94]

## Problem / the crux

The gateway's voice today is **`@discordjs/voice`** (audio + music + GoLive-send). The selfbot-lib
video-receive path lives on the **selfbot-lib `VoiceConnection`** — a separate voice stack. Two options:

### Option A (RECOMMENDED): Parallel selfbot video-watch connection
Keep `@discordjs/voice` for everything it does today. Add a **second, selfbot-lib voice connection**
to the same channel whose ONLY job is to watch + record others' video.

- Pros: zero regression risk to audio/music/screenshare-send; uses native `createVideoStream` → mk4.
- Cons: two voice connections for the same bot user in one channel. Need to verify Discord tolerates it
  (real selfbots like Discord-RE do exactly this for multi-stream). The selfbot lib's `joinChannel`
  reuses `ClientVoiceManager.connection` (it's a singleton) — see caveat below.

### Option B: Migrate primary voice to selfbot lib
Make the selfbot `VoiceConnection` THE voice layer (it also does audio via `receiver.createStream`).
- Pros: one connection; video+audio unified.
- Cons: large refactor; high regression risk to the entire existing audio/music/GoLive stack. NOT chosen now.

## CAVEAT — ClientVoiceManager.connection is a singleton
`ClientVoiceManager.connection` is a single `VoiceConnection`. The gateway's `@discordjs/voice` adapter and
the selfbot lib both drive the same client voice state. Need to verify whether `client.voice.joinChannel()`
can coexist with the active `@discordjs/voice` session, or whether we must create the selfbot VoiceConnection
manually / re-use the existing voice state. This is the #1 technical risk to validate in the spike before
committing to Option A.

## Implementation plan (Option A)

### 1. Streamer detector (new: `modules/voice-recording/videoRecorder.ts`)
- Listen to voice state updates (`client.on('voiceStateUpdate')` or the existing voice-state hook).
- When `voiceState.streaming === true` for a member in the bot's channel → candidate to record.
- Skip bot's own user id (unless we also want self-video; default skip).

### 2. Watch + record wiring
- Ensure a selfbot-lib `VoiceConnection` exists for the channel (spike: `client.voice.joinChannel(channel)`,
  fallback: build a `VoiceConnection` directly from the existing voice auth).
- `await selfbotVoiceConn.joinStreamConnection(userId)`  → STREAM_WATCH op 20.
- `const recorder = selfbotVoiceConn.receiver.createVideoStream(userId, outPath)` where outPath points under
  `<RECORDINGS_DIR>/<uid>/video-<streamKey>-<ts>.mkv` (Recorder outputs MKV natively).
- On `recorder.on('ready')` → mark recording; `recorder.on('closed')` → finalize.
- Transcript later: MKV → mp4 via ffmpeg (Phase B `muxToMp4` can accept mkv) for dashboard playback.

### 3. Teardown
- When `voiceState.streaming === false` / user leaves / channel emptied → `recorder.destroy()`,
  `selfbotVoiceConn.streamWatchConnection.delete(userId)` / `sendStopScreenshare()`.

### 4. Frontend (Phase UI, later)
- oRPC/backend list `.mkv` per call session + FE `<video>` player (mirror audio recordings UI).

## Files touched
- `services/discord-gateway/src/modules/voice-recording/videoRecorder.ts` (new)
- `services/discord-gateway/src/modules/voice-recording/recorder.ts` (wire streamer detector on voice join)
- Possibly `voiceController.ts` (voice state update subscription)
- Tests: `tests/videoRecorder.test.ts` (mock selfbot VoiceConnection + Recorder)

## Verification
1. `pnpm typecheck` + `pnpm build` + biome clean in discord-gateway.
2. Unit: Recorder wiring + streamer detection with mocked VoiceConnection.
3. Live (deploy): user shares screen → journal shows `STREAM_WATCH` sent + `Recorder ready` + `.mkv` file
   appears under recordings dir; playable via ffmpeg.
4. CI Build & Deploy (Nix) green.

## Open questions for spike (before full build)
- [ ] Can `client.voice.joinChannel()` run alongside the active `@discordjs/voice` session, or does the
      singleton `ClientVoiceManager.connection` collide / tear down the existing audio connection?
- [ ] Does the selfbot `VoiceConnection` need the bot's `video: true` flag in IDENTIFY to receive video
      (it advertises `streams` in IDENTIFY — see BaseMediaConnection/identify vs selfbot VoiceConnection)?
- [ ] Does `Recorder` (spawns system ffmpeg, UDP loopback on 65506/65510) work in the Nix store runtime
      (ffmpeg-headless on PATH confirmed; UDP loopback fine)?
