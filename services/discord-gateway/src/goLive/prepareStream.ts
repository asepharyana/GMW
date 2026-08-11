/**
 * prepareStream & playStream — ported from @dank074/discord-video-stream
 * newApi.js (Encoders/prepareStream/playStream), but uses `child_process.spawn`
 * + ffmpeg CLI args directly instead of fluent-ffmpeg + node-av.
 *
 * Replaces the @dank074 video pipeline entirely:
 *   input (URL or Readable) → ffmpeg spawn → H264 AnnexB frames
 *   → Demuxer stream → VideoStream/AudioStream → WebRtcConnWrapper
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PassThrough, type Readable } from "node:stream";
import { demux } from "./Demuxer.js";
import { type EncoderSettings, Encoders } from "./Encoders.js";
import { VideoStream } from "./VideoStream.js";
import type { WebRtcConnWrapper } from "./WebRtcWrapper.js";

export interface PrepareStreamResult {
  command: ChildProcess;
  output: PassThrough;
  encoder: () => Record<string, EncoderSettings>;
  options: Record<string, unknown>;
  videoCodec: string;
  width: number;
  height: number;
  frameRate?: number;
  includeAudio: boolean;
}

function isFiniteNonZero(n: unknown): n is number {
  return typeof n === "number" && !!n && Number.isFinite(n);
}

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36",
  Connection: "keep-alive",
};

/** Resolve ffmpeg binary (env override → PATH → Nix store ffmpeg-headless). */
function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const store = "/nix/store";
  if (existsSync(store)) {
    const entries = readdirSync(store);
    for (const entry of entries) {
      if (!entry.includes("ffmpeg-headless-")) continue;
      const candidate = join(store, entry, "bin", "ffmpeg");
      if (existsSync(candidate)) return candidate;
    }
  }
  return "ffmpeg";
}

const FFMPEG_BIN = resolveFfmpeg();

/**
 * prepareStream — build an ffmpeg command (as spawn args + PassThrough output)
 * that transcodes the input into a pipe we can demux. Mirrors @dank074's
 * prepareStream but produces a raw spawn instead of a fluent-ffmpeg command.
 */
export function prepareStream(
  input: string | Readable,
  options: Record<string, unknown> = {},
): PrepareStreamResult {
  const mergedOptions = {
    noTranscoding: false,
    width: isFiniteNonZero(options.width)
      ? Math.round(options.width as number)
      : -2,
    height: isFiniteNonZero(options.height)
      ? Math.round(options.height as number)
      : -2,
    frameRate:
      isFiniteNonZero(options.frameRate) && (options.frameRate as number) > 0
        ? options.frameRate
        : undefined,
    videoCodec: (options.videoCodec as string) ?? "H264",
    bitrateVideo:
      isFiniteNonZero(options.bitrateVideo) &&
      (options.bitrateVideo as number) > 0
        ? Math.round(options.bitrateVideo as number)
        : 5000,
    bitrateVideoMax:
      isFiniteNonZero(options.bitrateVideoMax) &&
      (options.bitrateVideoMax as number) > 0
        ? Math.round(options.bitrateVideoMax as number)
        : 7000,
    bitrateAudio:
      isFiniteNonZero(options.bitrateAudio) &&
      (options.bitrateAudio as number) > 0
        ? Math.round(options.bitrateAudio as number)
        : 128,
    includeAudio: options.includeAudio ?? true,
    encoder:
      (options.encoder as () => Record<string, EncoderSettings>) ??
      Encoders.software(),
    customHeaders: {
      ...DEFAULT_HEADERS,
      ...(options.customHeaders as Record<string, string> | undefined),
    },
    customInputOptions: (options.customInputOptions as string[]) ?? [],
    customFfmpegFlags: (options.customFfmpegFlags as string[]) ?? [],
    minimizeLatency: options.minimizeLatency ?? false,
  };

  const output = new PassThrough();

  const args: string[] = [
    "-hide_banner",
    "-loglevel",
    "error",
    ...(typeof input === "string" ? ["-i", input] : ["-i", "pipe:0"]),
    ...mergedOptions.customInputOptions,
  ];

  if (mergedOptions.minimizeLatency) {
    args.push("-fflags", "nobuffer", "-analyzeduration", "0");
  }

  if (typeof input === "string" && input.startsWith("http")) {
    const headerStr = Object.entries(mergedOptions.customHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    args.push(
      "-headers",
      headerStr,
      "-reconnect",
      "1",
      "-reconnect_at_eof",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "4294",
    );
  }

  // Video
  args.push("-map", "0:v:0");
  if (mergedOptions.noTranscoding) {
    args.push("-c:v", "copy");
  } else {
    args.push(`-vf`, `scale=${mergedOptions.width}:${mergedOptions.height}`);
    if (mergedOptions.frameRate)
      args.push("-r", String(mergedOptions.frameRate));
    const enc = mergedOptions.encoder()[mergedOptions.videoCodec];
    if (!enc)
      throw new Error(
        `Encoder settings not specified for ${mergedOptions.videoCodec}`,
      );
    // Encoder options are declared as single strings like "-forced-idr 1";
    // spawn needs each flag and value as separate argv entries.
    const encOptions = enc.options.flatMap((opt) =>
      opt.split(/\s+/).filter(Boolean),
    );
    args.push(
      "-b:v",
      `${mergedOptions.bitrateVideo}k`,
      "-maxrate:v",
      `${mergedOptions.bitrateVideoMax}k`,
      "-bufsize:v",
      `${Math.round(mergedOptions.bitrateVideo / 2)}k`,
      "-bf",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-force_key_frames",
      "expr:gte(t,n_forced*1)",
      "-c:v",
      enc.name,
      ...encOptions,
      ...(enc.globalOptions ?? []).flatMap((opt) =>
        opt.split(/\s+/).filter(Boolean),
      ),
    );
  }

  // Audio
  if (mergedOptions.includeAudio) {
    args.push("-map", "0:a:0?");
    args.push(
      "-c:a",
      "libopus",
      "-b:a",
      `${mergedOptions.bitrateAudio}k`,
      "-ar",
      "48000",
      "-ac",
      "2",
    );
  } else {
    args.push("-an");
  }

  args.push(...mergedOptions.customFfmpegFlags);
  args.push("-f", "h264", "pipe:1");

  const isUrl = typeof input === "string";
  const proc: ChildProcess = isUrl
    ? spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] })
    : spawn(FFMPEG_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });

  if (proc.stdin && !isUrl) {
    input.on("data", (chunk: Buffer) => proc.stdin?.write(chunk));
    input.on("end", () => proc.stdin?.end());
    input.on("error", () => proc.stdin?.destroy());
  }

  proc.stdout?.pipe(output);
  proc.stderr?.on("data", () => {
    /* swallow ffmpeg stderr */
  });
  proc.on("error", (err) => {
    // spawn failed (e.g. ffmpeg missing). If someone is consuming output
    // (demux attaches an 'error' listener) propagate; otherwise just end.
    if (output.listenerCount("error") > 0) {
      output.destroy(err);
    } else {
      output.end();
    }
  });
  proc.on("close", () => {
    output.end();
  });

  return {
    command: proc,
    output,
    encoder: mergedOptions.encoder,
    options: mergedOptions,
    videoCodec: mergedOptions.videoCodec,
    width: mergedOptions.width,
    height: mergedOptions.height,
    frameRate: mergedOptions.frameRate,
    includeAudio: !!mergedOptions.includeAudio,
  };
}

export interface PlayStreamOptions {
  type?: "go-live" | "video";
  format?: string;
  width?: number | ((v: unknown) => number);
  height?: number | ((v: unknown) => number);
  frameRate?: number | ((v: unknown) => number);
  readrateInitialBurst?: number;
  streamPreview?: boolean;
}

/**
 * playStream — demux the prepareStream output and pipe frames into the
 * WebRTC connection's video/audio streams. Resolves when the video stream
 * ends (natural EOF or the ffmpeg command is killed via cleanup/stop).
 */
export async function playStream(
  prepared: PrepareStreamResult,
  streamer: { createStream: () => Promise<WebRtcConnWrapper> },
  options: PlayStreamOptions = {},
): Promise<void> {
  const conn = await streamer.createStream();
  console.log("[goLive:playStream] createStream resolved");

  const { video, close: demuxClose } = await demux(prepared.output, {
    format: options.format ?? "nut",
  });
  console.log(
    `[goLive:playStream] demux done codec=${video?.codecName ?? "?"} ${video?.width ?? 0}x${video?.height ?? 0} fps=${video ? video.framerate_num / video.framerate_den || 30 : 30}`,
  );

  if (!video) throw new Error("No video stream in media");

  conn.setPacketizer(video.codecName);
  conn.mediaConnection.setSpeaking(true);
  console.log(
    `[goLive:playStream] setPacketizer(${video.codecName}) + setSpeaking done`,
  );

  const w =
    typeof options.width === "function"
      ? options.width(video)
      : (options.width ?? video.width);
  const h =
    typeof options.height === "function"
      ? options.height(video)
      : (options.height ?? video.height);
  const fr =
    typeof options.frameRate === "function"
      ? options.frameRate(video)
      : (options.frameRate ??
        (video.framerate_num / video.framerate_den || 30));

  conn.mediaConnection.setVideoAttributes(true, {
    width: Math.round(w),
    height: Math.round(h),
    fps: Math.round(fr),
  });

  const vStream = new VideoStream(conn);
  video.stream.pipe(vStream);

  const cleanup = () => {
    try {
      prepared.command.kill("SIGTERM");
    } catch {
      /* already dead */
    }
    demuxClose();
    try {
      conn.mediaConnection.setSpeaking(false);
      conn.mediaConnection.setVideoAttributes(false);
    } catch {
      /* connection already torn down */
    }
  };

  return new Promise<void>((resolve) => {
    vStream.once("finish", () => {
      cleanup();
      resolve();
    });
    vStream.once("error", () => {
      cleanup();
      resolve();
    });
  });
}

export { Encoders };
