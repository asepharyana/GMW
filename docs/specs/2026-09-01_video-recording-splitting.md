# Video Recording Splitting — Like Voice Recording

## Goal
Camera + screen share (stream watch) recording should split into per-burst
segments just like voice recording does — each time a streamer pauses/stops
and resumes, a new MP4 segment is created and registered in the DB + uploaded.

## Voice Recording Model (to replicate)
1. `receiver.speaking.start` → new OGG segment per burst
2. AfterSilence (4000ms) → stream "end" → segment finalized + uploaded
3. Each segment → DB insert → OGG→MP3 transcode → upload → update DB
4. File stored as `<userId>/<startTime>.ogg` + `.json`

## Video Recording Splitting
1. DAVE video RTP → depacketize H264 → write to current segment .h264
2. Silence detection: no H264 packets for 4000ms → close segment → flush →
   mux to MP4 → insert DB record → upload → start new segment on next packet
3. Each segment: `<userId>/video-<channelId>-<startTime>.h264` → `.mp4`
4. DB: reuse `voice_recordings` table (filename indicates video, e.g. `video-XXX-1234.mp4`)
5. Upload: MP4 to TeleUploader (no transcode needed — MP4 plays everywhere)

## Files Modified
- `services/discord-gateway/src/modules/voice-recording/streamWatchReceiver.ts`
  — Main change: silence-based splitting + DB registration + upload

## Constants
- `VIDEO_SILENCE_MS = 4000` (matches voice AfterSilence)
- `VIDEO_MIN_SEGMENT_MS = 1000` (skip segments <1s — avoid noise)

## Verification
- `pnpm typecheck` in `services/discord-gateway`
- `pnpm build` (dist/ is the deployed artifact)
- Push → CI deploy → live test with a streamer
