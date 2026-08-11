// Phase 2 E2E: full pipeline prepareStream → demux → frame stream.
// Run: npx tsx tests/golive-pipeline-e2e.ts

import { demux } from "../src/goLive/Demuxer.js";
import { Encoders } from "../src/goLive/Encoders.js";
import { prepareStream } from "../src/goLive/prepareStream.js";
import { normalizeVideoCodec } from "../src/goLive/utils.js";

// Use a real ffmpeg-generated video file as input (from sample generation).
const input = process.argv[2] ?? "/tmp/sample.h264";

const prepared = prepareStream(input, {
  encoder: Encoders.software({ x264: { preset: "superfast" } }),
  width: 640,
  height: 360,
  frameRate: 25,
  bitrateVideo: 500,
  bitrateVideoMax: 800,
  includeAudio: false,
  videoCodec: normalizeVideoCodec("H264"),
});

console.log(
  "prepareStream ok, videoCodec:",
  prepared.videoCodec,
  "size:",
  prepared.width,
  "x",
  prepared.height,
);

const { video, close } = await demux(prepared.output, { format: "h264" });
console.log("demux video:", video?.codecName, video?.width, "x", video?.height);

let frames = 0;
let keyframes = 0;
video.stream.on("data", (f: { keyframe?: boolean }) => {
  frames++;
  if (f.keyframe) keyframes++;
});
video.stream.on("end", () => {
  console.log(`pipeline frames: ${frames} (${keyframes} keyframes)`);
  close();
  prepared.command.kill("SIGTERM");
  process.exit(frames > 0 ? 0 : 1);
});
video.stream.on("error", (e: unknown) => {
  console.error("pipeline error:", e);
  close();
  prepared.command.kill("SIGTERM");
  process.exit(1);
});
setTimeout(() => {
  console.log("timeout after 30s — killing");
  close();
  prepared.command.kill("SIGTERM");
  process.exit(2);
}, 30000);
