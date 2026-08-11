/**
 * Lightweight demuxer — replaces node-av's LibavDemuxer for GoLive.
 *
 * Spawns ffmpeg to remux input into H264 AnnexB on stdout (video only —
 * screen share doesn't need to mux audio into the demuxer; audio goes
 * separately). This replaces the 114MB node-av binary with a plain ffmpeg
 * spawn.
 *
 * Each video "frame" emitted is a complete NAL sequence terminated by a
 * keyframe boundary (IDR). Audio is not extracted here — for GoLive with
 * audio, the NUT mux + full demuxer would be needed; screen share audio is
 * handled via a separate ffmpeg instance (see getDirectScreenInput).
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";

/**
 * Resolve ffmpeg/ffprobe binary. Prefers explicit env override, then PATH,
 * then a Nix-store ffmpeg-headless (the GMW flake provides it in the service
 * profile, but dev shells / tests may not have it on PATH).
 */
function resolveBin(name: "ffmpeg"): string {
  const override = process.env.FFMPEG_PATH;
  if (override && existsSync(override)) return override;
  // Nix store scan: <store>/<hash>-ffmpeg-headless-*/bin/<name>
  const store = "/nix/store";
  if (existsSync(store)) {
    const entries = readdirSync(store);
    for (const entry of entries) {
      if (!entry.includes("ffmpeg-headless-")) continue;
      const candidate = join(store, entry, "bin", name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return name; // fall back to PATH
}

const FFMPEG = resolveBin("ffmpeg");

export const AVCodecID = {
  AV_CODEC_ID_H264: 27,
  AV_CODEC_ID_HEVC: 173,
  AV_CODEC_ID_VP8: 139,
  AV_CODEC_ID_VP9: 167,
  AV_CODEC_ID_AV1: 225,
  AV_CODEC_ID_OPUS: 86019,
} as const;
export type AVCodecID = (typeof AVCodecID)[keyof typeof AVCodecID];

export const AV_PKT_FLAG_KEY = 1;

export interface Frame {
  data: Buffer | null;
  pts: number;
  duration: number;
  timeBase: { num: number; den: number };
  flags: number;
  streamIndex: number;
  free(): void;
}

export interface DemuxedStream {
  codec: number;
  codecName: string;
  width: number;
  height: number;
  framerate_num: number;
  framerate_den: number;
  sample_rate: number;
  stream: PassThrough;
}

/**
 * Probe a media file for stream info using ffmpeg's stderr (the
 * ffmpeg-headless Nix package ships ffmpeg but not ffprobe). Returns
 * stream descriptors in the same shape ffprobe -show_streams would.
 */
export async function probeStreams(
  url: string,
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, [
      "-hide_banner",
      "-loglevel",
      "info",
      "-i",
      url,
      "-f",
      "null",
      "-",
    ]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", () => {
      // Parse "Stream #0:0: Video: h264 (High), yuv420p, 640x360, 30 fps"
      const streams: Array<Record<string, unknown>> = [];
      const re = /Stream #0:(\d+): (Video|Audio): ([^,]+)/g;
      let m: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: regex loop idiom
      while ((m = re.exec(stderr)) !== null) {
        const [full, idx, kind, codecRaw] = m;
        void full;
        const codecName = codecRaw.split(" ")[0].toLowerCase();
        const stream: Record<string, unknown> = {
          index: Number(idx),
          codec_type: kind.toLowerCase(),
          codec_name: codecName,
          width: 0,
          height: 0,
          r_frame_rate: "0/1",
          sample_rate: 0,
        };
        // dimensions: "640x360"
        const dim = /(\d{2,5})x(\d{2,5})/.exec(stderr.slice(m.index));
        if (dim) {
          stream.width = Number(dim[1]);
          stream.height = Number(dim[2]);
        }
        // fps: "30 fps" or "29.97 fps"
        const fps = /(\d+(?:\.\d+)?) fps/.exec(stderr.slice(m.index));
        if (fps) {
          const v = Number(fps[1]);
          stream.r_frame_rate = `${Math.round(v * 1000)}/1000`;
        }
        // sample rate for audio: "48000 Hz"
        const sr = /(\d+) Hz/.exec(stderr.slice(m.index));
        if (sr) stream.sample_rate = Number(sr[1]);
        streams.push(stream);
      }
      resolve(streams);
    });
    proc.on("error", (err) => reject(err));
  });
}

/**
 * Demux input (URL string or readable stream) into video frames on a
 * PassThrough. Streams input DIRECTLY into ffmpeg (no spool-to-file — the
 * live NUT/H264 source never ends, so spooling deadlocks). ffmpeg emits
 * AnnexB H264 on stdout; NAL units are split into frames on the fly.
 * Video metadata is parsed from ffmpeg stderr during init.
 */
export async function demux(
  input: string | PassThrough,
  _opts: { format: string },
): Promise<{
  video: DemuxedStream | undefined;
  audio: DemuxedStream | undefined;
  close: () => void;
}> {
  const vPipe = new PassThrough({ objectMode: true, highWaterMark: 128 });
  const aPipe = new PassThrough({ objectMode: true, highWaterMark: 128 });

  const isStream = typeof input !== "string";
  const args: string[] = [
    "-hide_banner",
    // info level: stream init lines ("Stream #0:0: Video: h264...") go to
    // stderr and are parsed for dimensions/fps.
    "-loglevel",
    "info",
    // Input format hint: prepareStream always emits raw AnnexB H264 on
    // pipe:0. Raw H264 has NO magic header, so ffmpeg's auto-detection
    // fails with "Invalid data found when processing input" whenever the
    // first bytes arrive late/buffered. Pin the demuxer input format.
    ...(isStream ? ["-f", "h264"] : []),
    "-i",
    isStream ? "pipe:0" : input,
    "-c:v",
    "copy",
    "-an", // no audio in this minimal demuxer
    "-f",
    "h264",
    "pipe:1",
  ];
  const proc = spawn(FFMPEG, args, {
    stdio: isStream ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });
  console.log(
    `[goLive:Demuxer] spawn ffmpeg pid=${proc.pid} input=${isStream ? "stream" : input} args=${args.join(" ")}`,
  );

  // Pipe live input straight into ffmpeg stdin — never await stream end.
  if (isStream && proc.stdin) {
    input.pipe(proc.stdin);
    input.on("error", () => proc.stdin?.destroy());
  }

  // Set true once stderr metadata has been parsed (see handler below).
  let parsedMeta = false;

  // Parse stream metadata from ffmpeg stderr as it arrives (first chunk has
  // the init lines). Fall back to H264 defaults if parsing fails.
  let vInfo: DemuxedStream = {
    codec: AVCodecID.AV_CODEC_ID_H264,
    codecName: "h264",
    width: 0,
    height: 0,
    framerate_num: 0,
    framerate_den: 1,
    sample_rate: 0,
    stream: vPipe,
  };
  let aInfo: DemuxedStream | undefined;
  let stderrBuf = "";
  if (proc.stderr) {
    proc.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      stderrBuf = (stderrBuf + text).slice(-16384);
      // Surface actionable lines: ffmpeg errors + stream init lines
      if (/error|invalid|no such|failed|cannot|not found|unable/i.test(text)) {
        console.log(
          `[goLive:Demuxer] ffmpeg stderr: ${text.trim().split("\n").slice(0, 4).join(" | ")}`,
        );
      }
      if (parsedMeta) return;
      const streamRe = /Stream #0:(\d+): (Video|Audio): ([^,]+)/g;
      let m: RegExpExecArray | null;
      const found: Array<{ kind: string; codecRaw: string }> = [];
      // biome-ignore lint/suspicious/noAssignInExpressions: regex loop idiom
      while ((m = streamRe.exec(stderrBuf)) !== null) {
        found.push({ kind: m[2], codecRaw: m[3] });
      }
      const v = found.find((s) => s.kind === "Video");
      const a = found.find((s) => s.kind === "Audio");
      if (!v && !a) return;
      parsedMeta = true;
      if (v) {
        const codecName = v.codecRaw.split(" ")[0].toLowerCase();
        const dim = /(\d{2,5})x(\d{2,5})/.exec(stderrBuf);
        const fps = /(\d+(?:\.\d+)?) fps/.exec(stderrBuf);
        vInfo = {
          codec:
            AVCodecID[
              (codecName.toUpperCase() as keyof typeof AVCodecID) ??
                "AV_CODEC_ID_H264"
            ] ?? AVCodecID.AV_CODEC_ID_H264,
          codecName,
          width: dim ? Number(dim[1]) : 0,
          height: dim ? Number(dim[2]) : 0,
          framerate_num: fps ? Math.round(Number(fps[1]) * 1000) : 0,
          framerate_den: fps ? 1000 : 1,
          sample_rate: 0,
          stream: vPipe,
        };
      }
      if (a) {
        const codecName = a.codecRaw.split(" ")[0].toLowerCase();
        const sr = /(\d+) Hz/.exec(stderrBuf);
        aInfo = {
          codec:
            AVCodecID[
              (codecName.toUpperCase() as keyof typeof AVCodecID) ??
                "AV_CODEC_ID_OPUS"
            ] ?? AVCodecID.AV_CODEC_ID_OPUS,
          codecName,
          width: 0,
          height: 0,
          framerate_num: 0,
          framerate_den: 0,
          sample_rate: sr ? Number(sr[1]) : 0,
          stream: aPipe,
        };
      }
    });
  }

  // Wait (briefly) for ffmpeg to print its stream init lines on stderr so
  // vInfo carries real dimensions/fps. The lines arrive with the first chunk
  // — a short timeout covers slow starts; callers fall back to sensible
  // defaults when width/height are 0 anyway.
  await Promise.race([
    new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (parsedMeta) {
          clearInterval(check);
          resolve();
        }
      }, 25);
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 1500)),
  ]);

  // Scan stdout for NAL units. Each NAL unit (between start codes) is one frame
  // payload. We emit them individually; the packetizer chain handles FU-A.
  let videoBuf = Buffer.alloc(0);
  let frameCount = 0;

  const emitFrame = (nal: Uint8Array, isKeyFrame: boolean) => {
    vPipe.write({
      data: Buffer.from(nal),
      pts: frameCount,
      duration: 1,
      timeBase: { num: 1, den: 90000 },
      flags: isKeyFrame ? AV_PKT_FLAG_KEY : 0,
      streamIndex: 0,
      free: () => {},
    });
    frameCount++;
    if (frameCount === 1 || frameCount % 30 === 0) {
      console.log(
        `[goLive:Demuxer] frames=${frameCount} last=${nal.length}B key=${isKeyFrame}`,
      );
    }
  };

  if (proc.stdout) {
    proc.stdout.on("data", (chunk: Buffer) => {
      videoBuf = Buffer.concat([videoBuf, chunk]);
      // Find start codes (00 00 01 or 00 00 00 01) and split NALs
      let start = 0;
      // If buffer starts with zeros, that's the first start code — emit from there
      while (start < videoBuf.length) {
        let scPos = -1;
        for (let i = start + 1; i < videoBuf.length - 2; i++) {
          if (
            videoBuf[i] === 0 &&
            videoBuf[i + 1] === 0 &&
            videoBuf[i + 2] === 1
          ) {
            scPos = i + 3;
            break;
          }
        }
        if (scPos === -1) break;
        // Emit the NAL from `start` to `scPos` (but skip the start code bytes at `start`)
        if (start < scPos) {
          let nalStart = start;
          // Skip start code bytes for the NAL itself (00 00 01)
          if (
            videoBuf[nalStart] === 0 &&
            videoBuf[nalStart + 1] === 0 &&
            videoBuf[nalStart + 2] === 1
          ) {
            nalStart += 3;
          } else if (
            nalStart + 3 < scPos &&
            videoBuf[nalStart] === 0 &&
            videoBuf[nalStart + 1] === 0 &&
            videoBuf[nalStart + 2] === 0 &&
            videoBuf[nalStart + 3] === 1
          ) {
            nalStart += 4;
          }
          const nal = videoBuf.subarray(nalStart, scPos);
          // Trim trailing zero bytes (from start code overlap)
          let end = nal.length;
          while (end > 0 && nal[end - 1] === 0) end--;
          if (end > 0) {
            const nalTrimmed = nal.subarray(0, end);
            const isIdr = (nalTrimmed[0] & 0x1f) === 5; // IDR
            emitFrame(nalTrimmed, isIdr);
          }
        }
        // Skip the 00 00 01 at scPos-3 to find next
        start = scPos;
        // But the next start code needs at least 3 bytes
        if (start > videoBuf.length - 3) break;
      }
      // Keep remaining bytes (potential partial NAL or start code)
      if (start > 0 && start < videoBuf.length) {
        videoBuf = videoBuf.subarray(start);
      } else if (videoBuf.length > 4) {
        // No full NAL found, but avoid unbounded growth
        // Keep a sliding window
        videoBuf = videoBuf.subarray(videoBuf.length - 3);
      }
    });
    proc.stdout.on("end", () => {
      if (videoBuf.length > 0) {
        let end = videoBuf.length;
        while (end > 0 && videoBuf[end - 1] === 0) end--;
        if (end > 0) emitFrame(videoBuf.subarray(0, end), false);
      }
      vPipe.end();
      aPipe.end();
    });
  }

  proc.on("close", () => {
    vPipe.end();
    aPipe.end();
  });

  const close = () => {
    proc.kill("SIGTERM");
    vPipe.end();
    aPipe.end();
  };

  return { video: vInfo, audio: aInfo, close };
}
