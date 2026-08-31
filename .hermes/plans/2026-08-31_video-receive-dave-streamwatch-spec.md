# Spec: Receive Others' Screen-Share/Camera Video Under DAVE — Build a DAVE-capable Stream-Watch Connection

Status: **P1–P3 DONE (implemented + deployed); P4 in-progress — DAVE Ready + MLS handshake CONFIRMED live (15:51), only video-burst→mp4 remains**
Date: 2026-08-31
Author: Hermes
Related: `.hermes/plans/2026-08-31_video-receive-eager-selfbot-connection-spec.md` (superseded by this)
         `.hermes/plans/2026-08-31_video-receive-phaseC-spec.md` (Phase C build, selfbot path — dead)

## Problem / Ground truth (established from live logs 2026-08-31)
GMW must record OTHER members' screen-share + camera video in a voice channel it
records. Audio works (via `@discordjs/voice` 0.19.2 negotiating DAVE). Video does
not. Verified live: the selfbot path (`discord.js-selfbot-v13` eager `joinChannel`
→ `joinStreamConnection` → `receiver.createVideoStream`) authenticates but Discord
closes the connection with WS code **4017 "E2EE/DAVE protocol required"** (5x →
`VOICE_CONNECTION_ATTEMPTS_EXCEEDED`). Root cause: **Discord now REQUIRES DAVE
(E2EE) on every voice RTC, and `discord.js-selfbot-v13`'s voice stack predates
DAVE** (identify has no `max_dave_protocol_version`, no MLS handshake). The selfbot
path is dead, cannot be repaired. Full details: skill `gmw-ops` →
`references/video-receive-and-unmute.md` §4.

Facts:
- Watching a stream = a **SEPARATE RTC connection**, not the guild audio socket:
  gateway `STREAM_WATCH` (op 20) → Discord replies `STREAM_CREATE` (rtc_server_id)
  + `STREAM_SERVER_UPDATE` (separate token+endpoint) → client opens its own voice
  WS+UDP to that endpoint (`StreamConnectionReadonly` in selfbot). The watched
  video never rides the @discordjs/voice guild socket.
- The stream-watch RTC ALSO requires DAVE (same 4017 mechanism).
- `@snazzah/davey` (bundled with @discordjs/voice 0.19.2) supports
  `MediaType.VIDEO` + `Codec.H264` decrypt — DAVE machinery CAN decrypt H264 video.
- No off-the-shelf DAVE-capable video-RECEIVE path exists. Closing references:
  - **Discord-RE/Discord-video-stream** (fork of `@dank074/discord-video-stream`,
    master 2026-08-28): full DAVE in `src/client/voice/BaseMediaConnection.ts`
    (Davey `DAVESession` init via `initDave`, MLS key-package / proposals /
    commit / welcome / transitions; `WebRtcConnWrapper` encrypts audio/video via
    `daveSession.encrypt(MediaType.VIDEO, codec, …)`). BUT it is STREAMING only
    (send). No STREAM_WATCH / receive.
  - `@discordjs/voice`: full DAVE receive for AUDIO only; `DAVESession.decrypt`
    hardcodes `MediaType.AUDIO` (dist ~line 892); `onUdpMessage` drops non-opus;
    no STREAM_WATCH.
  - `discord.js-selfbot-v13`: video receive but no DAVE.

## Goal
Replace the dead selfbot receive path with a **DAVE-capable stream-watch voice
connection**: on detecting a member `voiceState.streaming`, send `STREAM_WATCH`,
connect a DAVE-authenticated RTC to the stream endpoint, decrypt incoming H264
RTP (`MediaType.VIDEO`), reassemble via the existing `H264Depacketizer`, mux to a
playable container. Reuse every tested building block already in the repo.

## Strategy decision (default A; B as fallback) — de-risk in Phase 2
Two implementation routes. Decide by Phase 2 prototype result.

### Strategy A — extend @discordjs/voice's tested native stack (PREFERRED, lighter)
Reuse @discordjs/voice 0.19.2 internals (already a runtime dep, already DAVE-tested
for audio):
- Drive a connection to the stream endpoint using djs/voice's `VoiceWebSocket` +
  `VoiceUDPSocket` + `DAVESession` (the same classes that work for the guild
  connection — they take arbitrary endpoint/token/session).
- Send the voice identify with `max_dave_protocol_version`, complete the DAVE
  handshake (Davey), then on receipt of a video RTP packet call
  `daveSession.decrypt(userId, MediaType.VIDEO, packet)` (Davey exposes
  `MediaType.VIDEO` + `Codec.H264`) — djs/voice's hardcoded `AUDIO` is the only
  blocker, fix by invoking Davey directly with `MediaType.VIDEO` for video SSRCs.
- STREAM_WATCH sent via the existing selfbot `client.ws.broadcast` (cheap, works —
  it needs no selfbot voice connection).
- Feed decrypted H264 → `H264Depacketizer` → `.h264` → `muxToMp4` (both already
  in `videoReceiver.ts`, unit-tested).
- No new runtime deps. Risk: relies on non-exported djs/voice internals (reachable
  via `as any`, as the existing `parsePacket` usage shows).

### Strategy B — port Discord-RE's BaseMediaConnection (heavier, more self-contained)
Port `BaseMediaConnection.ts` DAVE handling + `WebRtcConnWrapper` into a
receive/watch connection in the gateway. Deps: requires `@lng2004/node-datachannel`
(new native WebRTC dep) + `@snazzah/davey` (already available). More code, more
risk (native dep in Nix store), but a clean-room receive path decoupled from
djs/voice internals. Use only if A proves infeasible.

## Files touched (Strategy A shape)
- `services/discord-gateway/src/modules/voice-recording/streamWatchReceiver.ts`
  (NEW): DAVE stream-watch connection wrapper. Owns, per watched user:
  - `sendStreamWatch(client, streamKey)` (via `client.ws.broadcast({op:20,
    d:{stream_key}})`), stream_key = `guild:<gid>:<chid>:<uid>`.
  - collects STREAM_CREATE (rtc_server_id) + STREAM_SERVER_UPDATE (token+
    endpoint) via `client.on('raw')` match on stream_key.
  - builds a djs/voice-style connection to `<endpoint>` with the received token/
    session; completes DAVE handshake.
  - `onUdpMessage` wrapper: for video payload types, decrypt with
    `daveSession.decrypt(userId, MediaType.VIDEO, buf)`, depacketize, write.
  - teardown on STREAM_DELETE / user stops streaming / leave / channel untrack.
- `recorder.ts`: wire `trackChannel`/`untrackChannel` already exist; ensure the
  selfbot *eager voice connection* attempt is REMOVED (it only 4017-spams logs) —
  but KEEP `client.ws.broadcast` availability for STREAM_WATCH.
- `videoRecorder.ts`: remove the dead selfbot `joinChannel`/`joinStreamConnection`
  calls; keep the `voiceStateUpdate` streaming detection + teardown bookkeeping as
  the entry point; delegate the actual receive to `streamWatchReceiver`.
- `videoReceiver.ts`: keep `H264Depacketizer` + `muxToMp4` (reused). The
  guild-socket `hookVideoReceiver` can be removed or left inert.
- Tests: `tests/streamWatchReceiver.test.ts` (DAVE-handshake stub, RTP decrypt path
  with a mocked Davey, STREAM_WATCH packet shape); keep `tests/videoReceiver.test.ts`.

## Phases (each independently verifiable)
1. **Phase 1 (this session): spec + source reconnaissance.** Confirm djs/voice
   internals are reachable (VoiceWebSocket/VoiceUDPSocket/DAVESession exports &
   shapes), confirm Davey `MediaType.VIDEO` decrypt signature, confirm how a raw
   stream-watch connection's identify/select-protocol flows. Verify the selfbot
   `streamKey` format + `raw` STREAM_CREATE/SERVER_UPDATE payload. GATE: accurate
   spec + no unknowns blocking A.
2. **Phase 2: de-risk prototype.** Standalone script (not in the gateway) that:
   logs into the same selfbot token, joins a real voice channel, sends STREAM_WATCH
   for a live streamer, receives STREAM_CREATE/SERVER_UPDATE, and attempts a
   DAVE-authenticated connect + receive of ≥1 H264 packet to prove the path before
   any gateway integration. GATE: at least one decrypted H264 NAL captured in the
   lab.
3. **Phase 3: gateway integration** per files-touched. GATE: typecheck + build +
   biome + unit tests green; CI deploy ok.
4. **Phase 4: live verify.** With a real streamer in a recorded channel: journal
   shows `STREAM_WATCH sent`, `DAVE ready`, `Video burst opened`, and a playable
   `.h264`/`.mp4`/`.mkv` on disk. GATE: playable file with real video content.

## Risks / open questions
- Does Discord require the stream-watch connection to use the SAME session_id as
  the bot's active voice session, or a fresh one? (Affects identify.) Resolve in P2.
- Which video codec does Discord actually send for camera vs GoLive (H264 likely,
  but VP9/AV1 possible) — the depacketizer only handles H264. P2 measures the
  payload type live; add depacketizers for other codecs only if observed.
- djs/voice `DAVESession`/`VoiceUDPSocket` reachability via `as any` must be
  confirmed against the installed 0.19.2 build (P1).
- The separate stream RTC may need `selectProtocol`/SDP even for receive-only; the
  Discord-RE SDP shows a `m=video ... inactive` section. Follow the same shape.

## Verification (overall)
- Per-phase gates above.
- No regression: audio recording + message capture still work after changes.
- `pnpm typecheck && pnpm build && pnpm lint` green in discord-gateway.
- Commit + push; CI `Build & Deploy (Nix)` green; live streamer produces a file.

## Phase 1 findings (CONFIRMED 2026-08-31, Strategy A feasible)
- `@discordjs/voice` 0.19.2 dist/index.mjs PUBLICLY exports exactly the primitives
  needed: `DAVESession`, `Networking`, `NetworkingStatusCode`, `VoiceConnection`,
  `VoiceReceiver`, `VoiceUDPSocket`, `VoiceWebSocket`, `SSRCMap`,
  `RTP_OPUS_PAYLOAD_TYPE` (export block ~3143). So a stream-watch connection can be
  built OUTSIDE the lib using these constructors — no `as any` needed for the heavy
  lifting.
- `Networking` child wiring (~line 1364-1484): `new VoiceWebSocket('wss://' +
  endpoint + '?v=8', debug)`; on WS open send Identify `{op, d:{server_id,
  user_id, session_id, token, max_dave_protocol_version: getMaxProtocolVersion()}}`;
  `createDaveSession(protocolVersion)` → `new DAVESession(protocolVersion, userId,
  channelId, {decryptionFailureTolerance})` then `.reinit()`; UDP via
  `new VoiceUDPSocket({ip, port})` after Ready gives modes + ssrc.
- `DAVESession` wraps `@snazzah/davey` `Davey.DAVESession(protocolVersion, userId,
  channelId)`; on network packets it calls `this.session.decrypt(userId,
  Davey.MediaType.AUDIO, packet)` — hardcoded AUDIO (line ~892). For video we call
  Davey directly with `MediaType.VIDEO` + `Codec.H264`.
- `@snazzah/davey` MediaType enum: AUDIO=0, VIDEO=1; Codec H264=4; methods
  `decrypt(mediaType, codec, packet): Buffer` + `encrypt(...)`. Confirmed in davey
  index.d.ts.
- Stream key format (selfbot VoiceConnection.js ~1240): `guild:<gid>:<chid>:<uid>`
  for guild channels; `STREAM_WATCH` = gateway op 20, `d:{stream_key}`;
  `sendSignalScreenshare` = `client.ws.broadcast({op:20,d:{stream_key}})`. Replies
  come as gateway `raw` events `STREAM_CREATE` (`d.rtc_server_id`) +
  `STREAM_SERVER_UPDATE` (`d.token`, `d.endpoint`); selfbot routes them to the
  stream connection via `client.on('raw')` matching `d.stream_key`, setting
  `setSessionId(sessionId)` + `setTokenAndEndpoint(token, endpoint)` (Watch case in
  `StreamConnectionReadonly`).
- Discord-RE reference for the identify SDP: stream connections send a `m=video`
  section with `a=inactive` (receive-only-ish) + standard DAVE/VoiceOpCodes
  (op 0 identify, op 2 select protocol incl. `max_dave_protocol_version`). See
  `BaseMediaConnection.handleProtocolAck` + `initDave`.
- Decision: proceed with **Strategy A**. Selfbot code to REMOVE: the eager
  `ensureSelfbotVoice` join + `joinStreamConnection`/`receiver.createVideoStream`
  in `videoRecorder.ts` (proven dead — 4017). Keep the `voiceStateUpdate` streaming
  detection + bookkeeping; swap the receive plumbing to a new `streamWatchReceiver`
  driven by a djs/voice-style connection. STREAM_WATCH itself still sent via the
  selfbot `client.ws.broadcast` (needs only the WS, not a selfbot voice conn).
- OPEN (resolve in Phase 2 lab): (a) whether the stream connection's identify must
  use the bot's ACTIVE voice session_id or a fresh one; (b) actual video codec Discord
  sends for camera vs GoLive (measure payload type live; H264 assumed, VP9/AV1 possible
  → add depacketizers only if observed).
