// Regression test: demux must emit frames from a LIVE stream that never
// ends (the NUT/H264 merge output during playback). The old implementation
// spooled the whole stream to a file first → deadlocked forever → 0 frames.
// Run: npx tsx tests/golive-demux-live-e2e.ts [ffmpeg-path]
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { demux } from "../src/goLive/Demuxer.js";

const FFMPEG = process.argv[2] ?? "ffmpeg";

// 1) Generate a 2s H264 test clip to a temp file
const clip = "/tmp/golive-live-test.h264";
await new Promise<void>((resolve, reject) => {
  const p = spawn(
    FFMPEG,
    [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=2",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-f", "h264", clip,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let err = "";
  p.stderr?.on("data", (d: Buffer) => (err += d.toString()));
  p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err))));
});

// 2) Feed the clip through a PassThrough but DON'T end it (live semantics),
//    with a small pause after the first chunk so demux has time to emit.
const input = new PassThrough();
const demuxPromise = demux(input, { format: "h264" });
const { video, close } = await demuxPromise;

let frames = 0;
let bytes = 0;
video.stream.on("data", (frame: { data: Buffer }) => {
  frames++;
  bytes += frame.data.length;
});

const fs = await import("node:fs");
const buf = fs.readFileSync(clip);
const chunkSize = 16384;
for (let i = 0; i < buf.length; i += chunkSize) {
  input.write(buf.subarray(i, i + chunkSize));
  if (i === 0) await new Promise((r) => setTimeout(r, 1500));
}
// Stream still open — if the old spool logic was here we'd never emit.
await new Promise((r) => setTimeout(r, 500));

console.log(`metadata: ${video.codecName} ${video.width}x${video.height} fps=${video.framerate_num}/${video.framerate_den}`);
console.log(`frames while stream OPEN (not ended): ${frames}, bytes: ${bytes}`);
if (frames === 0) {
  console.error("FAIL: no frames emitted while input still open (deadlock)");
  close();
  process.exit(1);
}
input.end();
await new Promise((r) => setTimeout(r, 300));
close();
console.log("PASS: live stream demux works");
process.exit(0);
