// Regression test: demux must emit frames from a LIVE stream that never
// ends (the NUT/H264 merge output during playback). The old implementation
// spooled the whole stream to a file first → deadlocked forever → 0 frames.
// v2: also validates ACCESS-UNIT grouping — each emitted frame must be a
// complete picture (parameter sets + slice), never a bare SPS/PPS/SEI NAL,
// and must be timestamped at the video frame rate (RTP +clockRate/fps).
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
const demuxPromise = demux(input, { format: "h264", frameRate: 30 });
const { video, close } = await demuxPromise;
if (!video) {
  console.error("FAIL: demux returned no video stream");
  process.exit(1);
}

interface Emitted {
  data: Buffer;
  duration: number;
  timeBase: { num: number; den: number };
  flags: number;
}
const frames: Emitted[] = [];
video.stream.on("data", (frame: Emitted) => {
  frames.push(frame);
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

// 3) Validate access-unit structure
const nalTypes = (frame: Buffer): number[] => {
  const out: number[] = [];
  let i = 0;
  while (i < frame.length - 3) {
    if (frame[i] === 0 && frame[i + 1] === 0 && frame[i + 2] === 1) {
      const start = i;
      let j = i + 3;
      if (frame[j - 4] === 0 && j >= 4) {
        // 4-byte start code already consumed by i pointing at the 3-byte tail
      }
      while (j < frame.length - 3) {
        if (frame[j] === 0 && frame[j + 1] === 0 && frame[j + 2] === 1) break;
        j++;
      }
      const nal = frame.subarray(start + 3, j);
      if (nal.length > 0) out.push(nal[0] & 0x1f);
      i = j;
    } else {
      i++;
    }
  }
  return out;
};

let bareParamSetFrames = 0;
let framesWithoutSlice = 0;
let keyframesWithParamSets = 0;
let keyframesWithoutParamSets = 0;
for (const f of frames) {
  const types = nalTypes(f.data);
  const hasSlice = types.some((t) => t === 1 || t === 5);
  const hasParams = types.some((t) => t === 7 || t === 8);
  const isKey = (f.flags & 1) !== 0;
  if (!hasSlice) framesWithoutSlice++;
  if (types.length === 1 && (types[0] === 7 || types[0] === 8 || types[0] === 6)) {
    bareParamSetFrames++;
  }
  if (isKey && hasParams) keyframesWithParamSets++;
  if (isKey && !hasParams) keyframesWithoutParamSets++;
}

console.log(
  `metadata: ${video.codecName} ${video.width}x${video.height} fps=${video.framerate_num}/${video.framerate_den}`,
);
console.log(`frames while stream OPEN (not ended): ${frames.length}`);
console.log(`frames w/o slice NAL: ${framesWithoutSlice}, bare param-set frames: ${bareParamSetFrames}`);
console.log(`keyframes with SPS/PPS: ${keyframesWithParamSets}, without: ${keyframesWithoutParamSets}`);
if (frames.length === 0) {
  console.error("FAIL: no frames emitted while input still open (deadlock)");
  close();
  process.exit(1);
}
if (bareParamSetFrames > 0 || framesWithoutSlice > 0) {
  console.error("FAIL: demux emitted bare parameter-set frames (must group into access units)");
  close();
  process.exit(1);
}
if (frames.some((f) => f.duration !== 1 || f.timeBase.den !== 30)) {
  console.error("FAIL: frame duration/timeBase not 1/30 (RTP timestamp advance wrong)");
  close();
  process.exit(1);
}
input.end();
await new Promise((r) => setTimeout(r, 300));
close();
console.log("PASS: live stream demux works + access units grouped correctly");
process.exit(0);
