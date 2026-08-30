import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { VoiceReceiver } from "@discordjs/voice";
import type { Client } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";

const logger = createChildLogger("video-receiver");

// ─── Discord RTP video payload types (real Discord clients) ───────────────
// H264 is what Discord uses for the user's CAMERA; screen-share (GoLive) also
// uses H264. VP8/VP9/AV1 appear for some share types / forced codecs.
export const VIDEO_PAYLOAD_TYPES = new Set<number>([
  96, 98, 101, 102, 106, 116, 126, 127,
]);

// H264 NAL unit types (single byte, after the 1-byte NAL header)
const NAL_SPS = 7;
const NAL_PPS = 8;
const NAL_IDR = 5;

// RTP H264 packet types (byte 0 of the payload)
const H264_STAP_A = 24;
const H264_FU_A = 28;

/**
 * Pure RTP-H264 depacketizer → AnnexB (prefix NALs with 00 00 00 01 start codes).
 *
 * Input: RTP payload bytes (after the 12-byte RTP header, after decryption).
 * Output: a list of AnnexB NAL buffers (each with start code) ready to append
 * to a `.h264` elementary stream file.
 *
 * Reassembles FU-A fragmented NALs and STAP-A aggregated NALs into standalone
 * NALs with start codes. Fragments that don't form a complete NAL are buffered.
 */
export class H264Depacketizer {
  /** True after we've seen an SPS/PPS/IDR so we only start writing on a keyframe. */
  private sawConfig = false;
  /** Buffer for an in-progress FU-A NAL. */
  private fuBuffer: number[] = [];

  /** Handle one RTP payload; returns AnnexB NAL buffers to write (may be []). */
  push(payload: Buffer): Buffer[] {
    const out: Buffer[] = [];
    if (payload.length === 0) return out;

    const packetType = payload[0] & 0x1f;

    if (packetType >= 1 && packetType <= 23) {
      // Single NAL unit.
      const nalType = payload[0] & 0x1f;
      this.maybeEnableConfig(nalType);
      const annexB = this.toAnnexB(payload);
      if (this.sawConfig && annexB) out.push(annexB);
      return out;
    }

    if (packetType === H264_FU_A) {
      // Fragmentation unit: payload[0] = FU indicator (F/NRI/type=28),
      // payload[1] = FU header (S/E/R/type).
      const fuHeader = payload[1];
      const start = (fuHeader & 0x80) !== 0;
      const end = (fuHeader & 0x40) !== 0;
      const nalType = fuHeader & 0x1f;

      if (start) {
        // First fragment: reconstruct the full NAL header by preserving the
        // F and NRI bits from the FU indicator (payload[0]) OR'ed with the
        // NAL unit type from the FU header (payload[1] & 0x1F).
        const nalHeader = (payload[0] & 0xe0) | nalType;
        this.fuBuffer = [nalHeader, ...payload.subarray(2)];
      } else {
        // Continuation. (Ignore if no buffer — a lost first fragment.)
        if (this.fuBuffer.length === 0) {
          // We missed the start; the NAL type unknown, skip this fragment.
          return out;
        }
        if (payload.length > 2) {
          this.fuBuffer.push(...payload.subarray(2));
        }
      }

      if (end) {
        const nal = Buffer.from(this.fuBuffer);
        this.fuBuffer = [];
        this.maybeEnableConfig(nalType);
        if (this.sawConfig && nal.length > 0) {
          out.push(this.toAnnexB(nal));
        }
      }
      return out;
    }

    if (packetType === H264_STAP_A) {
      // Aggregation packet: list of (2-byte NAL size, NAL data).
      let offset = 1;
      while (offset < payload.length) {
        if (offset + 2 > payload.length) break;
        const naluLength = payload.readUInt16BE(offset);
        offset += 2;
        if (offset + naluLength > payload.length) break;
        const nalu = payload.subarray(offset, offset + naluLength);
        offset += naluLength;
        const nalType = nalu[0] & 0x1f;
        this.maybeEnableConfig(nalType);
        const annexB = this.toAnnexB(nalu);
        if (this.sawConfig && annexB) out.push(annexB);
      }
    }
    return out;
  }

  private maybeEnableConfig(nalType: number): void {
    if (nalType === NAL_SPS || nalType === NAL_PPS || nalType === NAL_IDR) {
      this.sawConfig = true;
    }
  }

  private toAnnexB(nal: Buffer): Buffer {
    const startCode = Buffer.from([0x00, 0x00, 0x00, 0x01]);
    return Buffer.concat([startCode, nal]);
  }

  reset(): void {
    this.sawConfig = false;
    this.fuBuffer = [];
  }
}

// ─── Per-user video burst state ────────────────────────────────────────────

interface VideoBurst {
  userId: string;
  depacketizer: H264Depacketizer;
  /** video SSRC this burst is sourced from (may be camera or screenshare). */
  ssrc: number;
  createdAt: number;
  filePath: string;
  out: WriteStream;
  /** count of AnnexB NAL bytes written (for logging/health). */
  bytesWritten: number;
  lastPacketAt: number;
}

/**
 * Listens for other users' VIDEO RTP (camera + screen share) on the same UDP
 * socket @discordjs/voice receives audio from, decrypts each video packet with
 * the connection's secret key (via receiver.parsePacket), depacketizes H264 to
 * AnnexB, and writes a raw `.h264` elementary stream per user-per-burst.
 *
 * Wraps `receiver.onUdpMessage` like screenShareAudio.ts. Packets with a video
 * payload type are consumed here; ALL other packets (opus mic + screen-share
 * audio) are delegated to the current handler (the existing wrapper chain).
 */
export function hookVideoReceiver(
  receiver: VoiceReceiver,
  client: Client,
  recordingsDir: string,
): void {
  const original = receiver.onUdpMessage;
  const bursts = new Map<string, VideoBurst>();

  // The UDP socket delivers video on SSRCs that are NOT the audioSSRC key of
  // ssrcMap. Build a videoSSRC→userId index from VoiceUserData as it updates so
  // we can attribute packets without SSRC-proximity guessing.
  const videoSsrcToUser = new Map<number, string>();

  receiver.ssrcMap.on("create", (data) => {
    if (data.videoSSRC !== undefined) {
      videoSsrcToUser.set(data.videoSSRC, data.userId);
      logger.info(
        { userId: data.userId, videoSSRC: data.videoSSRC },
        "Video SSRC appeared (camera/screenshare start)",
      );
    }
  });
  receiver.ssrcMap.on("update", (_old, neu) => {
    if (neu.videoSSRC !== undefined) {
      videoSsrcToUser.set(neu.videoSSRC, neu.userId);
    }
  });

  /** Close a burst's file (flush + end) then mux to a playable mp4. */
  const closeBurst = (userId: string): void => {
    const burst = bursts.get(userId);
    if (!burst) return;
    bursts.delete(userId);
    const { ssrc, bytesWritten, createdAt, filePath } = burst;
    // Wait for the write stream to fully flush (file descriptor closed) before
    // ffmpeg reads it — otherwise the mux can read a truncated tail.
    const flushed = new Promise<void>((resolve) => {
      burst.out.once("finish", () => resolve());
      burst.out.end();
    });
    logger.info(
      { userId, ssrc, bytes: bytesWritten, durationMs: Date.now() - createdAt },
      "Video burst closed",
    );
    // Phase B: remux the raw H264 elementary stream into a self-contained,
    // playable MP4 (fast `-c copy`, no re-encode) and drop the raw file.
    void flushed
      .then(() => muxToMp4(filePath))
      .then((mp4) => {
        logger.info({ userId, ssrc, mp4 }, "Video muxed to mp4");
      })
      .catch((err) => {
        logger.warn(
          {
            userId,
            ssrc,
            err: err instanceof Error ? err.message : String(err),
          },
          "Video mux to mp4 failed (keeping raw .h264)",
        );
      });
  };

  const openBurst = (userId: string, ssrc: number): VideoBurst | null => {
    try {
      const userDir = path.join(recordingsDir, userId);
      mkdirSync(userDir, { recursive: true });
      const filePath = path.join(userDir, `video-${ssrc}-${Date.now()}.h264`);
      const out = createWriteStream(filePath);
      const burst: VideoBurst = {
        userId,
        ssrc,
        depacketizer: new H264Depacketizer(),
        createdAt: Date.now(),
        filePath,
        out,
        bytesWritten: 0,
        lastPacketAt: Date.now(),
      };
      bursts.set(userId, burst);
      logger.info({ userId, ssrc, filePath }, "Video burst opened");
      return burst;
    } catch (err) {
      logger.warn(
        { userId, ssrc, err: err instanceof Error ? err.message : String(err) },
        "Failed to open video burst file",
      );
      return null;
    }
  };

  receiver.onUdpMessage = (msg: Buffer) => {
    if (msg.length <= 8) {
      original.call(receiver, msg);
      return;
    }

    const payloadType = msg[1] & 127;
    if (!VIDEO_PAYLOAD_TYPES.has(payloadType)) {
      // Not video — let the existing handler (audio + screen-share audio) take it.
      original.call(receiver, msg);
      return;
    }

    // ── It's a video RTP packet. Decrypt + depacketize + write. ──
    const ssrc = msg.readUInt32BE(8);

    // Attribute to a user.
    let userId = videoSsrcToUser.get(ssrc);
    if (!userId) {
      // Fallback: maybe we registered the SSRC under an audio entry via the
      // screen-share-audio hook, or proximity. Skip bot's own stream.
      const candidate = inferVideoOwner(msg, receiver);
      if (candidate && candidate.userId !== client.user?.id) {
        userId = candidate.userId;
        videoSsrcToUser.set(ssrc, candidate.userId);
      }
    }
    if (!userId || userId === client.user?.id) {
      return; // unknown or self — ignore
    }

    // Decrypt the payload using @discordjs/voice's parser (handles DAVE +
    // encryption the same way it does for audio).
    let decrypted: Buffer;
    try {
      const receiverAny = receiver as unknown as {
        parsePacket: (
          buffer: Buffer,
          mode: string,
          nonce: Buffer,
          secretKey: Uint8Array,
          userId: string,
        ) => Buffer;
        connectionData: {
          encryptionMode?: string;
          nonceBuffer?: Buffer;
          secretKey?: Uint8Array;
        };
      };
      const { encryptionMode, nonceBuffer, secretKey } =
        receiverAny.connectionData;
      if (!encryptionMode || !nonceBuffer || !secretKey) return;
      // decrypted payload = RTP header already stripped by parsePacket
      decrypted = receiverAny.parsePacket(
        msg,
        encryptionMode,
        nonceBuffer,
        secretKey,
        userId,
      );
    } catch {
      // Decryption failed — transient; skip this packet.
      return;
    }

    // Depacketize the (video) RTP payload → AnnexB.
    let burst = bursts.get(userId);
    if (!burst) {
      const opened = openBurst(userId, ssrc);
      if (!opened) return;
      burst = opened;
    }
    burst.lastPacketAt = Date.now();

    let nals: Buffer[];
    try {
      nals = burst.depacketizer.push(decrypted);
    } catch {
      return;
    }
    if (nals.length === 0) return;

    for (const nal of nals) {
      burst.bytesWritten += nal.length;
      if (!burst.out.write(nal)) {
        burst.out.once("drain", () => {});
      }
    }
  };

  // If a user's video SSRC disappears, close their burst after a short grace so
  // the tail flushes.
  setInterval(() => {
    const now = Date.now();
    for (const [userId, burst] of bursts) {
      if (now - burst.lastPacketAt > 5000) {
        closeBurst(userId);
      }
    }
  }, 2000);
  // Prevent the interval from keeping the process alive.
  // (The gateway owns the process; a single 2s timer is negligible.)
}

/**
 * Infer which user owns a video SSRC by proximity to their known audioSSRC
 * (Discord allocates a user's video SSRC near their audio SSRC).
 */
function inferVideoOwner(
  msg: Buffer,
  receiver: VoiceReceiver,
): { userId: string } | null {
  const ssrc = msg.readUInt32BE(8);
  try {
    const map = getSsrcInternalMap(receiver.ssrcMap);
    if (!map) return null;
    for (const [, data] of map.entries()) {
      if (data.audioSSRC && Math.abs(data.audioSSRC - ssrc) < 400_000) {
        return { userId: data.userId };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** Access the private `_map` inside SSRCMap (mirrors screenShareAudio.ts). */
function getSsrcInternalMap(
  ssrcMap: VoiceReceiver["ssrcMap"],
):
  | Map<number, { userId: string; audioSSRC?: number; videoSSRC?: number }>
  | undefined {
  const asAny = ssrcMap as unknown as Record<string, unknown>;
  const m1 = asAny._map;
  if (m1 instanceof Map) return m1 as Map<number, never>;
  return undefined;
}

/**
 * Remux a raw H264 elementary stream into a playable MP4 with `-c copy` (no
 * re-encode, fast). On success the raw `.h264` is removed and the `.mp4` path
 * returned. On any failure the raw file is LEFT in place (caller keeps it).
 */
export async function muxToMp4(rawPath: string): Promise<string> {
  const mp4Path = rawPath.replace(/\.h264$/, ".mp4");

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "h264",
        "-i",
        rawPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-y",
        mp4Path,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code ?? "?"}: ${stderr.trim()}`));
    });
  });

  // Sanity check: only delete the raw file if the mp4 is non-empty.
  const mp4Stat = await stat(mp4Path).catch(() => null);
  if (!mp4Stat || mp4Stat.size === 0) {
    throw new Error("mp4 mux produced an empty file");
  }
  await unlink(rawPath).catch(() => {});
  return mp4Path;
}
