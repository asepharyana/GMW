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
import type { GoLiveFrame } from "./BaseMediaStream.js";

/** 4-byte AnnexB start code (00 00 00 01) used when building access units. */
const startCode4 = Buffer.from([0, 0, 0, 1]);

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
  opts: { format: string; frameRate?: number },
): Promise<{
  video: DemuxedStream | undefined;
  audio: DemuxedStream | undefined;
  close: () => void;
}> {
  // objectMode pipes carrying one frame per item. HWM 2 keeps backpressure
  // near-instant: at most ~1-2 frames in flight (~66ms @ 30fps) before the
  // encoder is throttled, so the viewer sees near-live video instead of a
  // multi-second backlog (the old HWM 128 held 128 frames ≈ 4.3s of lag).
  // BaseMediaStream below has HWM 0, so the chain is tightly coupled to the
  // WebRTC sender's real pace — faithful to @dank074/discord-video-stream.
  const vPipe = new PassThrough({ objectMode: true, highWaterMark: 2 });
  const aPipe = new PassThrough({ objectMode: true, highWaterMark: 2 });

  const isStream = typeof input !== "string";
  // NUT/matroska input (prepareStream with includeAudio) carries audio; the
  // h264 path is video-only raw AnnexB. Video always goes to stdout (pipe:1);
  // audio goes to fd3 (pipe:3) so stderr stays free for metadata parsing.
  const containerFormat =
    isStream && opts.format !== "h264" ? opts.format : null;
  const withAudio = isStream && containerFormat !== null;
  const args: string[] = [
    "-hide_banner",
    // info level: stream init lines ("Stream #0:0: Video: h264...") go to
    // stderr and are parsed for dimensions/fps.
    "-loglevel",
    "info",
    // Real-time throttle: read piped input at 1x so the WHOLE upstream chain
    // (encoder x264, merge ffmpeg, yt-dlp download) is paced by wall-clock,
    // not by network/VOD speed. Without this the encoder bursts ~10x faster
    // than real-time and the vPipe queue grows unboundedly — the WebRTC
    // sender correctly paces 30fps but always emits the OLDEST buffered
    // frame, so video freezes/lags while audio (small, jitter-buffer
    // recoverable) stays smooth. Pausing proc.stdout instead (previous fix)
    // stalled the same ffmpeg's fd3 audio too → audio stuttered AND the
    // already-built backlog never drained. `-re` fixes production rate at
    // source; a bounded backlog below still protects against sender stalls.
    ...(isStream ? ["-re"] : []),
    // Input format hint: raw H264 has NO magic header, so ffmpeg's
    // auto-detection fails with "Invalid data found when processing input"
    // whenever the first bytes arrive late/buffered. Pin the demuxer input
    // format for streams (NUT for the audio-capable path).
    ...(withAudio
      ? ["-f", containerFormat as string]
      : isStream
        ? ["-f", "h264"]
        : []),
    "-i",
    isStream ? "pipe:0" : input,
    "-map",
    "0:v:0",
    "-c:v",
    "copy",
    "-f",
    "h264",
    "pipe:1",
    ...(withAudio
      ? ["-map", "0:a:0?", "-c:a", "copy", "-f", "opus", "pipe:3"]
      : ["-an"]),
  ];
  const proc = spawn(FFMPEG, args, {
    stdio: isStream
      ? withAudio
        ? ["pipe", "pipe", "pipe", "pipe"]
        : ["pipe", "pipe", "pipe"]
      : ["ignore", "pipe", "pipe"],
  });
  console.log(
    `[goLive:Demuxer] spawn ffmpeg pid=${proc.pid} input=${isStream ? "stream" : input} args=${args.join(" ")}`,
  );

  // Pipe live input straight into ffmpeg stdin — never await stream end.
  if (isStream && proc.stdin) {
    input.pipe(proc.stdin);
    input.on("error", () => proc.stdin?.destroy());
  }

  // Audio: ffmpeg writes Ogg Opus on fd3 (pipe:3). Parse OGG pages into
  // opus packets and emit them as GoLiveFrames (20ms, 48kHz) on aPipe.
  if (withAudio && proc.stdio[3]) {
    createOggOpusDemux(
      proc.stdio[3] as unknown as NodeJS.ReadableStream,
      aPipe,
    );
    console.log("[goLive:Demuxer] audio pipe wired (fd3 → Ogg Opus → aPipe)");
  }

  // Track which stream kinds we've seen. We must NOT stop parsing on the
  // first stream found: ffmpeg can print the video line and audio line in
  // separate stderr chunks (input arrives slowly), and the old
  // early-return dropped the audio line forever
  // → aInfo undefined → no audio RTP → static GoLive tile.
  let seenVideo = false;
  let seenAudio = false;

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
  // With audio expected (NUT input), ALWAYS expose an audio stream even if
  // ffmpeg's audio init line hasn't arrived in stderr yet. prepareStream
  // encodes libopus into the NUT unconditionally (`-map 0:a:0? -c:a libopus`),
  // so fd3 WILL carry Ogg Opus — aInfo must not stay undefined just because
  // the metadata line raced the resolve. The stderr handler below upgrades
  // this default with real sample_rate metadata when the line lands.
  if (withAudio) {
    aInfo = {
      codec: AVCodecID.AV_CODEC_ID_OPUS,
      codecName: "opus",
      width: 0,
      height: 0,
      framerate_num: 0,
      framerate_den: 0,
      sample_rate: 48000,
      stream: aPipe,
    };
  }
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
      const streamRe = /Stream #0:(\d+): (Video|Audio): ([^,]+)/g;
      let m: RegExpExecArray | null;
      const found: Array<{ kind: string; codecRaw: string }> = [];
      // biome-ignore lint/suspicious/noAssignInExpressions: regex loop idiom
      while ((m = streamRe.exec(stderrBuf)) !== null) {
        found.push({ kind: m[2], codecRaw: m[3] });
      }
      if (process.env.GMW_DEMUX_DEBUG) {
        console.log(
          `[goLive:Demuxer] DEBUG stderrBuf=${JSON.stringify(stderrBuf.slice(0, 300))} found=${JSON.stringify(found)}`,
        );
      }
      const v = found.find((s) => s.kind === "Video");
      const a = found.find((s) => s.kind === "Audio");
      if (v) {
        seenVideo = true;
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
        seenAudio = true;
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
      // Mark that at least one stream kind was seen. Note: we must NOT
      // resolve the metadata wait on the FIRST stream kind alone. With live
      // NUT input, ffmpeg can print the video init line in one stderr chunk
      // and the audio init line in the NEXT chunk (NUT info-stream packets
      // arrive as ffmpeg reads them from the pipe). The old code returned
      // immediately on `parsedMeta=true` — the audio line then landed in the
      // handler AFTER `return { audio: aInfo }` had already captured
      // `undefined` → no audio RTP → static GoLive tile even though the NUT
      // carried audio. Wait for BOTH kinds (when audio is expected).
      // (parsedMeta removed — we now wait for both via allSeen() below.)
    });
  }

  // Wait (briefly) for ffmpeg to print its stream init lines on stderr so
  // vInfo/aInfo carry real metadata. With audio expected, wait for BOTH the
  // video and audio init lines (they may arrive in separate stderr chunks on
  // live input); the timeout covers slow starts / genuinely audio-less input.
  const allSeen = () =>
    withAudio ? seenVideo && seenAudio : seenVideo || seenAudio;
  await Promise.race([
    new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (allSeen()) {
          clearInterval(check);
          resolve();
        }
      }, 25);
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);

  // Scan stdout for AnnexB NAL units and group them into ACCESS UNITS
  // (one picture). Discord's H264 decoder requires a complete access unit —
  // parameter sets + slice — inside a single RTP frame. Emitting each NAL
  // as its own frame (SPS/PPS/SEI separate from the slice) makes the decoder
  // unable to produce ANY picture: production showed a black GoLive tile
  // despite frames flowing (5892B slices + 4B PPS + 33B SPS as separate
  // frames, each with a near-zero RTP timestamp delta). We therefore buffer
  // NALs and flush one frame per slice, prepending the parameter sets that
  // precede it, and timestamp it as ONE frame at the video frame rate.

  // EMISSION: faithful to @dank074/discord-video-stream — the demuxer does NOT
  // pace. It writes each access unit straight to vPipe (objectMode, HWM 128)
  // with a monotonically increasing PTS; BaseMediaStream (ported 1:1 from dank)
  // then paces playback via sleep-PTS + A/V sync and applies backpressure when
  // the WebRTC sender can't keep up. This is what works upstream; the custom
  // setInterval/tail-drop clocks we tried broke IDR delivery → blank tiles.
  let videoBuf = Buffer.alloc(0);
  let frameCount = 0;
  let pendingNals: Buffer[] = [];
  let pendingHasSlice = false;
  let pendingIsKey = false;
  // Raw H264 streams carry no timing info — ffmpeg's h264 demuxer guesses
  // 25fps on stderr. Prefer the caller's explicit frameRate (the encode
  // setting); it drives both RTP timestamp advance and pacing.
  const videoFps =
    opts.frameRate ?? (vInfo.framerate_num / vInfo.framerate_den || 30);

  // Write one frame to the video pipe with backpressure: if the pipe buffer is
  // full, pause ffmpeg's stdout so the encoder self-throttles (instead of
  // building an unbounded backlog). Resumed on drain. Faithful to dank's
  // `resume &&= vPipe.write(packet)` in LibavDemuxer.
  const writeFrame = (frame: {
    data: Buffer;
    pts: number;
    duration: number;
    timeBase: { num: number; den: number };
    flags: number;
    streamIndex: number;
    free: () => void;
  }): void => {
    const ok = vPipe.write(frame);
    if (!ok) proc.stdout?.pause();
  };

  const flushAccessUnit = () => {
    if (pendingNals.length === 0) return;
    // AnnexB access unit: 00 00 00 01 + NAL for every buffered NAL. The
    // packetizer (H264RtpPacketizer, StartSequence separator) needs the
    // start codes to find NAL boundaries inside the frame.
    const parts: Buffer[] = [];
    for (const n of pendingNals) parts.push(startCode4, n);
    const au = Buffer.concat(parts);
    const isKey = pendingIsKey;
    pendingNals = [];
    pendingHasSlice = false;
    pendingIsKey = false;
    // Write directly to the video pipe (with backpressure via writeFrame).
    // PTS advances one frame per output frame at videoFps (duration=1 in a
    // 1/fps timebase) so BaseMediaStream computes the correct frametime and the
    // WebRTC RTP timestamp advances by clockRate/fps per frame (3000 @ 30fps /
    // 90kHz). Keyframes carry AV_PKT_FLAG_KEY so the decoder re-establishes a
    // reference.
    writeFrame({
      data: au,
      pts: frameCount,
      duration: 1,
      timeBase: { num: 1, den: videoFps },
      flags: isKey ? AV_PKT_FLAG_KEY : 0,
      streamIndex: 0,
      free: () => {},
    });
    frameCount++;
    if (frameCount === 1 || frameCount % 30 === 0) {
      console.log(
        `[goLive:Demuxer] frames=${frameCount} last=${au.length}B key=${isKey}`,
      );
    }
  };

  if (proc.stdout) {
    vPipe.on("drain", () => proc.stdout?.resume());
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
            const nalType = nalTrimmed[0] & 0x1f;
            const isSlice = nalType === 1 || nalType === 5;
            if (isSlice) {
              // A new slice while one is pending closes the previous
              // access unit (x264 emits one slice per frame).
              if (pendingHasSlice) flushAccessUnit();
              pendingNals.push(Buffer.from(nalTrimmed));
              pendingHasSlice = true;
              if (nalType === 5) pendingIsKey = true;
            } else {
              // Parameter-set / SEI / AUD / filler NAL. After a slice these
              // belong to the NEXT access unit — flush the completed frame.
              if (pendingHasSlice) flushAccessUnit();
              pendingNals.push(Buffer.from(nalTrimmed));
            }
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
    // Backpressure (faithful to dank's `resume &&= vPipe.write`): when the
    // downstream pipe's buffer is full, stop reading from ffmpeg's stdout so
    // the encoder self-throttles instead of building an unbounded backlog.
    // Resume on drain.
    vPipe.on("drain", () => proc.stdout?.resume());
    proc.stdout.on("end", () => {
      flushAccessUnit();
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

/**
 * Parse an Ogg Opus byte stream (as written by ffmpeg's `-f opus` muxer)
 * into individual opus packets and push them onto `out` as GoLiveFrames
 * (duration 960 @ 48kHz = 20ms, matching the OpusRtpPacketizer clock).
 *
 * OGG page structure:
 *   "OggS" | ver(1) | header_type(1) | granule(8 LE) | serial(4) | seq(4) |
 *   crc(4) | page_segments(1) | segment_table[n] | payload
 * Lacing: a value < 255 ends a packet; 255 continues it (0.5KB chunk).
 * The first packet is OpusHead (19B) — skipped, as is OpusTags.
 */
function createOggOpusDemux(
  input: NodeJS.ReadableStream,
  out: PassThrough,
): void {
  let buf = Buffer.alloc(0);
  // Packets assembled from lacing; packetParts accumulates across pages
  // when a packet spans a page boundary (continued flag / 255 lacing).
  let packetParts: Buffer[] = [];
  let headerDone = false;
  let frameIndex = 0;

  const emitPacket = (packet: Buffer) => {
    if (!headerDone) {
      // First packet = OpusHead ("OpusHead"), second = OpusTags. Skip both.
      const magic = packet.toString("latin1", 0, 8);
      if (magic === "OpusHead" || magic === "OpusTags") return;
      headerDone = true;
    }
    out.write({
      data: packet,
      pts: frameIndex * 960,
      duration: 960,
      timeBase: { num: 1, den: 48000 },
      free: () => {},
    } satisfies GoLiveFrame);
    frameIndex++;
  };

  const processPages = () => {
    while (true) {
      // Sync to "OggS"
      const sync = buf.indexOf("OggS", 0, "latin1");
      if (sync === -1) {
        // Keep the tail (partial sync pattern) for the next chunk
        buf = buf.length > 3 ? buf.subarray(buf.length - 3) : buf;
        return;
      }
      if (sync > 0) buf = buf.subarray(sync);
      if (buf.length < 27) return; // need full page header
      const numSeg = buf[26];
      if (buf.length < 27 + numSeg) return; // need segment table
      let payloadLen = 0;
      for (let i = 0; i < numSeg; i++) payloadLen += buf[27 + i];
      if (buf.length < 27 + numSeg + payloadLen) return; // need payload

      const headerType = buf[5];
      // Extract packets from the payload using lacing values
      let off = 27 + numSeg;
      for (let i = 0; i < numSeg; i++) {
        const lace = buf[27 + i];
        const part = buf.subarray(off, off + lace);
        off += lace;
        packetParts.push(Buffer.from(part));
        if (lace < 255) {
          const packet = Buffer.concat(packetParts);
          packetParts = [];
          if ((headerType & 0x01) === 0) {
            // Not a continuation page → packet starts here
            emitPacket(packet);
          } else if (headerDone) {
            // Continued page — packet body, emit directly
            emitPacket(packet);
          }
          // (header packets on continuation pages are dropped)
        }
      }
      buf = buf.subarray(off);
      if (buf.length === 0) return;
    }
  };

  input.on("data", (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    processPages();
  });
  input.on("end", () => {
    out.end();
  });
  input.on("error", () => {
    out.end();
  });
}
