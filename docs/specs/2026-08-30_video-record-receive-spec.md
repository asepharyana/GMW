# Spec: Record video (kamera/screenshare) orang lain — WebRTC receive (Request 2)

Date: 2026-08-30. Status: Phase A + B DONE (capture → playable MP4); Phase C (UI) open.

## Why this is hard (ground truth, verified from @discordjs/voice 0.19.2 source)
`VoiceReceiver.onUdpMessage` (dist/index.mjs:2059) drops EVERY non-opus RTP
packet at line 2068: `if ((msg[1] & 127) !== RTP_OPUS_PAYLOAD_TYPE) return;`.
So video (kamera H264? actually Discord uses VP8/H264; screenshare combines with
video SSRC) is decrypted-capable but never forwarded. `receiver.parsePacket`
(2033) DOES decrypt any payload type generically (audio + video) using
`connectionData.{encryptionMode, nonceBuffer, secretKey}` — the only audio gate
is the opus check inside onUdpMessage.

=> FIX: wrap `receiver.onUdpMessage` (like screenShareAudio.ts already does for
screen-share AUDIO SSRCs): for packets whose payload type is a VIDEO type
(payload 96 VP8, 101/102 H264, 106/116/126/127 AV1, VP9 98...), call
`receiver.parsePacket(...)` myself to decrypt, then depacketize + write frames.
Delegate opus (120) to the original handler. Delegate audio to original.

## Audio already works (screenShareAudio.ts). We add VIDEO.

## Science-of-the-changes below.

## Phase A — capture + decrypt + depacketize to AnnexB h264 (THIS change)
Files (new): `src/modules/voice-recording/videoReceiver.ts`
- Hook into `recorder.startRecording` alongside `hookScreenShareAudio`.
- Wrap `receiver.onUdpMessage`:
  - read ssrc = msg.readUInt32BE(8); userData = receiver.ssrcMap.get(ssrc)
  - if payload type is video AND we have a "watching" subscription for that user
    (videoSSRC present), decrypt via receiver.parsePacket(...), then:
      - H264 (101/102 + payload 120 not): strip RTP header, reassemble FU-A
        fragments into AnnexB NALs (start-code prefixed), buffer until we have
        a full access unit (keyframe SPS/PPS/IDR or slices), append to a per-
        user-per-burst `.h264` file.
  - else delegate to original onUdpMessage.
- Watch `receiver.ssrcMap` "create"/"update" for `videoSSRC !== undefined` →
  signal a video burst started for that user (like screenShareAudio does).
- Per-user video files written to `config.RECORDINGS_DIR/<uid>/video-<ts>.h264`.
- Guard: skip bot's own video (client.user.id).

Dependencies: NO new npm deps for Phase A (only crypto already in
@discordjs/voice via parsePacket + Buffer). ffmpeg-headless (already in Nix
buildInputs) used in Phase B for decode+mux.

## Phase B — decode + mux to playable MP4/WebM (DONE, commit 999c054b)
- `closeBurst` waits for the WriteStream `finish` (full flush/fd close), then
  `muxToMp4(rawPath)`: `ffmpeg -f h264 -i raw.h264 -c copy -movflags +faststart
  out.mp4`, deletes raw on success (>=1B mp4), keeps it on failure.
- Output: `<RECORDINGS_DIR>/<uid>/video-<ssrc>-<ts>.mp4`.
- ffmpeg is on the gateway runtime PATH (pkgs.ffmpeg-headless, already in the
  Nix buildInputs for the music/GoLive players).
- Test: `tests/videoReceiver.test.ts` muxToMp4 case (real ffmpeg, generates a
  tiny baseline h264, asserts mp4 non-empty + raw deleted; skipped if no ffmpeg).

## Phase C — frontend playback + session grouping (follow-up)
- Backend oRPC list video files; FE video player, group by call session like audio.

## Verification
- Phase A: join voice, have a member screen-share/camera, confirm `.h264` file
  grows with NAL frames + keyframes; journal shows "video burst" logs.
- Run vitest unit: RTP header strip + FU-A reassembly gives correct bytes.

## Open questions / risks
- Discord codec for camera = H264(101/102); screenshare uses H264 (101/103?)
  and can also be VP8/VP9. Handle H264 first (depacketize proven), VP8/VP9 in
  Phase B via ffmpeg RTP input.
- Encryption: DAVE (dave_protocol_version) adds a session layer; parsePacket
  already applies daveSession.decrypt for audio — we must call the SAME
  parsePacket path so DAVE/encryption is handled identically.
- ssrc↔user mapping during a broadcast: videoSSRC is in ssrcMap after the
  voice state; may need the STREAM_CREATE network events to key reliably.
