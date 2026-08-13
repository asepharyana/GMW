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
import { AudioStream } from "./AudioStream.js";
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
  /** Container the encoder muxes to: "nut" (audio-capable) or "h264" (raw). */
  format: "nut" | "h264";
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
    // realtime: throttle ffmpeg's INPUT read to 1x so the encoder tracks
    // wall-clock instead of slurping a VOD at network speed. Without this,
    // a YouTube screen share downloads the whole clip fast and the encoder
    // produces a ~10x frame backlog that the demuxer buffers unboundedly —
    // the sender paces at 30fps but always emits the OLDEST buffered frames,
    // so the viewer sees frozen/laggy video while audio (tiny, jitter-
    // buffer recoverable) stays smooth. That is the "video stuck, voice
    // normal" symptom. `-re` caps the pipeline at 1x end-to-end. Default on
    // because this prepareStream is only used for screen share (VOD URLs).
    realtime: options.realtime ?? true,
  };

  const output = new PassThrough();

  const args: string[] = [
    "-hide_banner",
    "-loglevel",
    "error",
    // Real-time throttle: read the input at 1x so the encoder paces with
    // wall-clock and does NOT force-duplicate frames to fill -r 30. This
    // applies to BOTH URL and live-Pipe (Readable) inputs: a screen-share
    // pipe (yt-dlp merge → ffmpeg → stdout) is delivered at NETWORK speed
    // (bursts, stalls) and is NOT self-paced — without -re the encoder slurps
    // it instantly and, when the merge stalls, x264 -r 30 repeats the last
    // held frame ~30x → the viewer sees ~1fps while WebRTC still pushes
    // 30fps. -re reads the pipe at the stream's native PTS rate so each
    // output frame is a fresh picture. (Previous builds only added -re for
    // string URLs, so the screen-share pipe got none — root of the 1fps
    // symptom.)
    ...(mergedOptions.realtime ? ["-re"] : []),
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

  // Audio: transcode to libopus. NUT muxer on stdout carries video (H264
  // AnnexB) + audio (Ogg Opus) as ONE stream into the Demuxer, which re-splits
  // them via a child ffmpeg -f nut -i pipe:0 -c:v copy -f h264 pipe:1 ... . The
  // Demuxer's start-code scan runs on THAT child ffmpeg's stdout (pure H264),
  // NOT on NUT — so NAL type 5 (IDR) is parsed correctly. (Outputting raw
  // h264+opus on two pipes directly was tried and broke: the audio pipe was
  // never attached to the demuxer's input, so audio RTP never flowed.)
  if (mergedOptions.includeAudio) {
    args.push(
      "-map",
      "0:a:0?",
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

  // NUT muxer carries video+audio; the raw h264 muxer cannot ("h264 muxer
  // does not support any stream of type audio" -> header write fails ->
  // empty stdout -> black tile). Audio delivery requires NUT.
  const outFormat = mergedOptions.includeAudio ? "nut" : "h264";
  args.push("-f", outFormat, "pipe:1");

  const isUrl = typeof input === "string";
  const proc: ChildProcess = isUrl
    ? spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] })
    : spawn(FFMPEG_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });

  if (proc.stdin && !isUrl) {
    // Race guard: the merge ffmpeg may have already exited (transient 403
    // or stream death) before this function attaches its listeners — the
    // input's 'end'/'error' events then fire into the void and the encoder
    // stdin NEVER receives EOF, leaving an encoder that waits forever and a
    // screen share that shows a black tile with zero frames. Check the
    // terminal state eagerly and EOF the encoder immediately.
    if (input.readableEnded || input.destroyed) {
      proc.stdin.end();
    } else {
      input.on("data", (chunk: Buffer) => proc.stdin?.write(chunk));
      input.on("end", () => proc.stdin?.end());
      input.on("error", () => proc.stdin?.destroy());
    }
  }

  // Safety: proc may error before playStream attaches a demux listener on
  // `output`. A no-op listener here prevents an unhandled 'error' event
  // on the PassThrough from crashing the gateway on ffmpeg spawn failure.
  output.on("error", () => {});
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
    format: outFormat,
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

  const {
    video,
    audio,
    close: demuxClose,
  } = await demux(prepared.output, {
    format: options.format ?? prepared.format ?? "nut",
    frameRate:
      typeof options.frameRate === "number" ? options.frameRate : undefined,
  });
  console.log(
    `[goLive:playStream] demux done codec=${video?.codecName ?? "?"} ${video?.width ?? 0}x${video?.height ?? 0} fps=${video ? video.framerate_num / video.framerate_den || 30 : 30} audio=${audio?.codecName ?? "none"}`,
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

  // Audio: Discord's GoLive pipeline expects RTP on the audio SSRC too —
  // a video-only stream (zero audio packets) shows a static tile/thumbnail
  // instead of live video. Pipe opus frames from the demuxer (silence is
  // injected at the encoder when the source has no audio track).
  let aStream: AudioStream | undefined;
  if (audio) {
    aStream = new AudioStream(conn);
    audio.stream.pipe(aStream);
    console.log(
      `[goLive:playStream] audio stream attached (${audio.codecName})`,
    );
    // A/V sync (faithful to @dank074 newApi.js): audio is the master clock.
    // Video sleeps/wakes based on ptsDelta(video - audio) so they can't drift
    // apart under variable encoder throughput.
    vStream.syncStream = aStream;
  }

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

  // First-frame watchdog: if the encoder never delivers a single frame
  // (dead merge input, empty stream, codec mismatch), fail fast instead of
  // "playing" a black tile forever. The demuxer resolves with fallback
  // metadata even when no frame ever arrives, so this timeout is the only
  // place that detects "started but nothing flowing".
  let firstFrameTimer: NodeJS.Timeout | null = null;
  let gotFirstFrame = false;
  const firstFrame = new Promise<void>((resolve, reject) => {
    firstFrameTimer = setTimeout(() => {
      if (!gotFirstFrame) {
        cleanup();
        reject(
          new Error(
            "No video frames within 10s of stream start — input stream failed",
          ),
        );
      }
    }, 10000);
    video.stream.once("data", () => {
      gotFirstFrame = true;
      if (firstFrameTimer) clearTimeout(firstFrameTimer);
      resolve();
    });
  });

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => () => {
      if (settled) return;
      settled = true;
      if (firstFrameTimer) clearTimeout(firstFrameTimer);
      fn();
    };

    vStream.once("finish", () => {
      settle(() => {
        cleanup();
        if (!gotFirstFrame) {
          reject(new Error("Screen video stream ended without any frame"));
        } else {
          resolve();
        }
      })();
    });
    vStream.once("error", () => {
      settle(() => {
        cleanup();
        if (!gotFirstFrame) {
          reject(new Error("Screen video stream errored before first frame"));
        } else {
          resolve();
        }
      })();
    });
    // The stream may end without ever producing a frame (input was
    // silently dead) — surface that instead of resolving "successfully".
    video.stream.once("end", () => {
      settle(() => {
        cleanup();
        if (!gotFirstFrame) {
          reject(new Error("Screen video stream ended before any frame"));
        } else {
          resolve();
        }
      })();
    });
    // Watchdog timeout: no frame arrived within 10s — fail fast instead of
    // "playing" a black tile forever. cleanup() kills the encoder so the
    // vStream finish/error handlers above still fire, but the settled guard
    // ensures this rejection wins.
    firstFrame.catch((err) => {
      settle(() => {
        cleanup();
        reject(err);
      })();
    });
  });
}

export { Encoders };
