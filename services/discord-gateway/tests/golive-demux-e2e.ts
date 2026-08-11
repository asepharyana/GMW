// Phase 2 E2E: Demuxer on a real ffmpeg-generated H264 file.
// Run: npx tsx tests/golive-demux-e2e.ts

import { createReadStream } from "node:fs";
import { demux } from "../src/goLive/Demuxer.js";

const input = process.argv[2] ?? "/tmp/sample.h264";
const { video, close } = await demux(createReadStream(input), {
  format: "h264",
});

console.log(
  "video:",
  JSON.stringify({
    codecName: video.codecName,
    width: video.width,
    height: video.height,
    duration: video.duration,
    fps: Math.round(video.framerate_num / video.framerate_den),
  }),
);

let count = 0;
let keyframes = 0;
let bytes = 0;
video.stream.on("data", (frame: { data: Buffer; keyframe: boolean }) => {
  count++;
  bytes += frame.data.length;
  if (frame.keyframe) keyframes++;
});
video.stream.on("end", () => {
  console.log(`frames: ${count} (${keyframes} keyframes), ${bytes} bytes`);
  close();
  process.exit(0);
});
video.stream.on("error", (e: unknown) => {
  console.error("stream error:", e);
  close();
  process.exit(1);
});
