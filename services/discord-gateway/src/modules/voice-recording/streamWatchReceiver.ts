/**
 * DAVE-capable stream-watch video receiver for OTHER members (camera + screen
 * share). Replaces the dead selfbot-v13 path (which Discord rejects with WS
 * close 4017 "E2EE/DAVE protocol required" because that lib's voice stack
 * predates DAVE).
 *
 * HOW IT WORKS (verified architecture, 2026-08-31):
 * - Watching a member's stream is a SEPARATE RTC connection, not the guild
 *   audio socket. We send the gateway signal STREAM_WATCH (op 20) with
 *   stream_key `guild:<gid>:<chid>:<uid>`; Discord replies with gateway events
 *   STREAM_CREATE (d.rtc_server_id) + STREAM_SERVER_UPDATE (d.token,
 *   d.endpoint) that together describe a dedicated voice RTC for the watch.
 * - We open a `@discordjs/voice` `Networking` connection pointed at that RTC
 *   (endpoint/token/serverId = rtc_server_id + the bot's sessionId). `Networking`
 *   performs the FULL DAVE handshake (identify with max_dave_protocol_version,
 *   IP discovery, select-protocol, DAVE MLS transitions) — the identical path
 *   that already works for audio. It is a public export.
 * - On Ready, `Networking` exposes `state.udp` (VoiceUDPSocket). We hook its
 *   `message` event. Video RTP (H264) arrives there; we decrypt via the DAVE
 *   session with `MediaType.VIDEO` (the wrapper's default is AUDIO), then feed
 *   the existing `H264Depacketizer` → AnnexB `.h264` → `muxToMp4`.
 *
 * All failures are best-effort and NEVER break the gateway's audio recording.
 */

import crypto from "node:crypto";
import {
  createWriteStream,
  promises as fsPromises,
  type WriteStream,
} from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import {
  getVoiceConnection,
  Networking,
  type NetworkingState,
} from "@discordjs/voice";
import type Davey from "@snazzah/davey";
import { MediaType } from "@snazzah/davey";
import type { Client, VoiceChannel } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import { H264Depacketizer, muxToMp4 } from "./videoReceiver.js";

const logger = createChildLogger("stream-watch");
const _log = createChildLogger("stream-watch-decrypt");

// Faithful ports of @discordjs/voice receive constants (dist/index.mjs).
const AUTH_TAG_LENGTH = 16;
const UNPADDED_NONCE_LENGTH = 4;
const HEADER_EXTENSION_BYTE = Buffer.from([190, 222]); // 0xBE 0xDE
/** Opus RTP payload type (120). Video arrives on non-opus payload types. */
const RTP_OPUS_PAYLOAD_TYPE = 120;

/**
 * Video silence threshold — matches voice recording AfterSilence (4000ms).
 * When no H264 video RTP packets arrive for this long, the current segment
 * is closed and muxed to MP4 (like voice's "end of burst"). A new segment
 * opens when packets resume.
 */
const VIDEO_SILENCE_MS = 4000;
/**
 * Minimum segment duration — skip registering segments shorter than this
 * (avoids creating tiny MP4 files from brief camera flashes).
 */
const VIDEO_MIN_SEGMENT_MS = 1000;

/** A watched user's live DAVE stream connection + file state. */
interface WatchState {
  uid: string;
  guildId: string;
  channelId: string;
  net: Networking;
  depacketizer: H264Depacketizer;
  filePath: string;
  out: WriteStream;
  bytesWritten: number;
  lastPacketAt: number;
  startedAt: number;
  /** Timestamp of the current segment's first packet (for silence detection). */
  segmentStartAt: number;
  /** Per-watch segment counter — makes each segment's filename unique. */
  segmentSeq: number;
  /** True while a segment close is in-flight (rejects new packet writes). */
  closing: boolean;
  _diag?: { video: number; maxLen: number; pts: Set<number> };
  _diagNext?: number;
}

const watches = new Map<string, WatchState>(); // key `${guildId}:${uid}`
const pendingServerId = new Map<string, string>(); // key `${guildId}:${uid}` -> rtc_server_id (from STREAM_CREATE)

let _client: Client | undefined;
let _rawAttached = false;
let _recordingsDir = "/var/lib/gmw/recordings";

export function setStreamWatchRecordingsDir(dir: string): void {
  _recordingsDir = dir;
}

/**
 * Silence detection interval — runs every 2s and checks each active watch for
 * VIDEO_SILENCE_MS of inactivity (no H264 packets). On silence, the current
 * segment is closed, muxed to MP4, registered in the DB, and uploaded.
 * Matches voice recording's AfterSilence behavior.
 */
const _silenceInterval = setInterval(() => {
  const now = Date.now();
  for (const [watchKey, watch] of watches) {
    if (!watch.out || !watch.segmentStartAt) continue;
    const silenceDuration = now - watch.lastPacketAt;
    if (silenceDuration < VIDEO_SILENCE_MS) continue;

    const segmentDuration = now - watch.segmentStartAt;
    logger.info(
      {
        userId: watch.uid,
        watchKey,
        segmentDurationMs: segmentDuration,
        bytes: watch.bytesWritten,
      },
      `Video silence detected (${silenceDuration}ms) — closing segment`,
    );

    // Fire-and-forget: close + finalize the segment.
    void closeCurrentSegment(watch);
  }
}, 2_000);
// Prevent the interval from keeping the process alive.
if (_silenceInterval.unref) _silenceInterval.unref();

/** Test-only reset. */
export function __resetStreamWatchState(): void {
  for (const [, w] of watches) closeWatch(w);
  watches.clear();
  pendingServerId.clear();
  _rawAttached = false;
  _client = undefined;
}

/** Bind the selfbot client (needed for STREAM_WATCH + raw). Idempotent. */
export function setStreamWatchClient(client: Client | undefined): void {
  _client = client;
  if (!client || _rawAttached) return;
  _rawAttached = true;
  client.on("raw", (packet: unknown) => {
    try {
      handleRaw(packet);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "stream-watch raw handler error (ignoring)",
      );
    }
  });
}

const streamKeyFor = (channelId: string, guildId: string, uid: string) =>
  `guild:${guildId}:${channelId}:${uid}`;

/** Parse `guild:<gid>:<chid>:<uid>` back into parts. */
function parseStreamKey(
  key: string,
): { guildId: string; channelId: string; uid: string } | null {
  const m = /^guild:(\d+):(\d+):(\d+)$/.exec(key);
  if (!m) return null;
  return { guildId: m[1], channelId: m[2], uid: m[3] };
}

function handleRaw(packet: unknown): void {
  const p = packet as { t?: string; d?: Record<string, unknown> } | null;
  if (!p?.t || !p?.d) return;
  const t = p.t;
  const streamKey = p.d.stream_key as string | undefined;
  if (!streamKey) return;
  const key = parseStreamKey(streamKey);
  if (!key) return;
  const watchKey = `${key.guildId}:${key.uid}`;

  if (t === "STREAM_CREATE") {
    const rtc = String(p.d.rtc_server_id ?? "");
    pendingServerId.set(watchKey, rtc);
    logger.info(
      { guildId: key.guildId, userId: key.uid, rtcServerId: rtc },
      "STREAM_CREATE received (watch RTC authorized)",
    );
  } else if (t === "STREAM_SERVER_UPDATE") {
    const endpoint = String(p.d.endpoint ?? "");
    const token = String(p.d.token ?? "");
    const rtc =
      pendingServerId.get(watchKey) ?? String(p.d.rtc_server_id ?? "");
    logger.info(
      { guildId: key.guildId, userId: key.uid, endpoint, rtcServerId: rtc },
      "STREAM_SERVER_UPDATE received — connecting DAVE watch",
    );
    connectWatch(key.guildId, key.channelId, key.uid, endpoint, token, rtc);
  } else if (t === "STREAM_DELETE") {
    logger.info(
      { guildId: key.guildId, userId: key.uid },
      "STREAM_DELETE received — closing watch",
    );
    pendingServerId.delete(watchKey);
    closeWatchByKey(watchKey);
  } else if (t === "STREAM_UPDATE") {
    // paused / resumed — ignore
  }
}

/**
 * Initiate watching `userId`'s stream in `channel`. Sends STREAM_WATCH and
 * waits for STREAM_CREATE / STREAM_SERVER_UPDATE (handled by handleRaw) to
 * actually open the DAVE connection. Best-effort.
 */
export async function startStreamWatch(
  channel: VoiceChannel,
  userId: string,
): Promise<void> {
  if (!_client) {
    logger.warn("startStreamWatch: no client set");
    return;
  }
  const watchKey = `${channel.guild.id}:${userId}`;
  if (watches.has(watchKey)) return; // already watching
  // Re-assert the bot is server-undeafened + unmuted BEFORE requesting video.
  // A server-deafened bot is NOT sent the streamer's audiovisual RTP by
  // Discord, so no video would arrive even though the DAVE watch reaches
  // Ready. Server-deaf can silently revert on reconnect/restart, so this is
  // re-invoked on every watch attempt. Dynamic import avoids a static module
  // cycle (recorder ⇄ videoRecorder ⇄ streamWatchReceiver).
  const { forceSelfServerUnmuteUndeafen } = await import("./recorder.js");
  void forceSelfServerUnmuteUndeafen(_client, channel.guild);
  const sk = streamKeyFor(channel.id, channel.guild.id, userId);
  logger.info(
    { userId, guildId: channel.guild.id, channelId: channel.id, streamKey: sk },
    "Sending STREAM_WATCH to authorize video receive",
  );
  try {
    (
      _client as unknown as { ws: { broadcast: (d: unknown) => unknown } }
    ).ws.broadcast({
      op: 20, // STREAM_WATCH
      d: { stream_key: sk },
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Failed to send STREAM_WATCH",
    );
  }
}

function connectWatch(
  guildId: string,
  channelId: string,
  uid: string,
  endpoint: string,
  token: string,
  serverId: string,
): void {
  const watchKey = `${guildId}:${uid}`;
  if (watches.has(watchKey)) return;
  const botId = _client?.user?.id;
  if (!botId) return;

  // The bot's ACTIVE voice-session id, from the guild @discordjs/voice
  // connection (the watch RTC identify must carry the SAME session the bot is
  // joined in with). The gateway's audio connection is the voice session; the
  // selfbot client's voice manager is NOT established anymore.
  const guildConn = getVoiceConnection(guildId);
  const sessionId =
    (
      guildConn as unknown as {
        state?: {
          networking?: {
            state?: { connectionOptions?: { sessionId?: string } };
          };
          connectionOptions?: { sessionId?: string };
        };
      }
    )?.state?.networking?.state?.connectionOptions?.sessionId ??
    (
      guildConn as unknown as {
        state?: { connectionOptions?: { sessionId?: string } };
      }
    )?.state?.connectionOptions?.sessionId;

  logger.info(
    { userId: uid, endpoint, serverId, hasSession: !!sessionId },
    "Opening DAVE Networking to watch RTC",
  );

  // CRITICAL: for a STREAM-WATCH RTC the DAVE MLS group is keyed to
  // `rtc_server_id - 1` (see Discord-RE StreamConnection.daveChannelId =
  // BigInt(serverId)-1n), NOT the guild voice channel id. Passing the guild
  // voice channel id as `connectionOptions.channelId` makes the Davey session
  // derive the wrong MLS group → "WrongGroupId" on proposals → never Ready.
  // `serverId` stays the rtc_server_id (used in the voice identify server_id).
  const daveChannelId = (() => {
    try {
      return (BigInt(serverId) - 1n).toString();
    } catch {
      return channelId; // fallback: non-numeric serverId — use channel id
    }
  })();

  const net = new Networking(
    {
      endpoint,
      serverId,
      userId: botId,
      sessionId: sessionId ?? "none",
      token,
      channelId: daveChannelId,
    },
    { daveEncryption: true, debug: true },
  );

  const uidProps = uid;
  const netAny = net as unknown as {
    state: NetworkingState & {
      udp?: {
        on: (e: string, cb: (m: Buffer) => void) => void;
        off: (e: string, cb: (m: Buffer) => void) => void;
      };
      dave?: { session?: Davey.DAVESession };
      connectionData?: {
        encryptionMode?: string;
        nonceBuffer?: Buffer;
        secretKey?: Buffer | Uint8Array;
        dave?: { session?: Davey.DAVESession };
      };
    };
  };

  const onMessage = (msg: Buffer): void => {
    handleUdpMessage(watchKey, netAny, uidProps, msg);
  };

  net.on("stateChange", (oldState, newState) => {
    const s = newState as { code?: number };
    const code = s?.code;
    const oldCode = (oldState as { code?: number })?.code;
    logger.info(
      { userId: uid, code, oldCode, hasUdp: !!netAny.state.udp },
      `watch-state ${oldCode}->${code}`,
    );
    if (code === 4 /* Ready */) {
      const udp = netAny.state.udp;
      if (udp) {
        udp.on("message", onMessage);
        logger.info(
          { userId: uid },
          "DAVE watch READY — listening for video RTP",
        );
      } else {
        logger.warn({ userId: uid }, "watch ready but no UDP socket");
      }
    }
  });
  net.on("error", (err) => {
    logger.warn(
      { userId: uid, err: err instanceof Error ? err.message : String(err) },
      "watch Networking error",
    );
    closeWatchByKey(watchKey);
  });
  net.on("debug", (msg) => {
    logger.info({ userId: uid, msg }, "watch-djs-debug");
  });
  net.on("close", () => {
    closeWatchByKey(watchKey);
  });

  watches.set(watchKey, {
    uid,
    guildId,
    channelId,
    net,
    depacketizer: new H264Depacketizer(),
    filePath: "",
    out: undefined as unknown as WriteStream,
    bytesWritten: 0,
    lastPacketAt: Date.now(),
    startedAt: Date.now(),
    segmentStartAt: 0,
    segmentSeq: 0,
    closing: false,
  });
}

/**
 * Faithful port of @discordjs/voice `VoiceReceiver.decrypt` (audio path), but
 * applied to a VIDEO packet. Strips the RTP header (12 + CSRC/extension), then
 * legacy-AES-decrypts the wrapped payload, returning the DAVE-encrypted payload
 * (still E2EE — Davey removes the NEXT layer).
 */
function legacyDecryptLayer(
  buffer: Buffer,
  mode: string,
  nonce2: Buffer,
  secretKey: Buffer | Uint8Array,
): Buffer {
  buffer.copy(nonce2, 0, buffer.length - UNPADDED_NONCE_LENGTH);
  let headerSize = 12;
  const first = buffer.readUint8();
  if ((first >> 4) & 1) headerSize += 4;
  const header = buffer.subarray(0, headerSize);
  const encrypted = buffer.subarray(
    headerSize,
    buffer.length - AUTH_TAG_LENGTH - UNPADDED_NONCE_LENGTH,
  );
  const authTag = buffer.subarray(
    buffer.length - AUTH_TAG_LENGTH - UNPADDED_NONCE_LENGTH,
    buffer.length - UNPADDED_NONCE_LENGTH,
  );
  switch (mode) {
    case "aead_aes256_gcm_rtpsize": {
      const decipheriv = crypto.createDecipheriv(
        "aes-256-gcm",
        secretKey,
        nonce2,
      );
      decipheriv.setAAD(header);
      decipheriv.setAuthTag(authTag);
      return Buffer.concat([decipheriv.update(encrypted), decipheriv.final()]);
    }
    case "aead_xchacha20_poly1305_rtpsize": {
      // Not statically importable (sodium-wrappers is an optional peer); the
      // gateway negotiates aead_aes256_gcm_rtpsize in practice. If a server
      // ever selects xchacha20 we log once and skip the burst rather than
      // mis-decrypt.
      return Buffer.alloc(0);
    }
    default: {
      logger.warn(
        { mode },
        "Unsupported video decryption mode (skipping burst)",
      );
      return Buffer.alloc(0);
    }
  }
}

/**
 * Replicates @discordjs/voice `VoiceReceiver.parsePacket` (audio), parameterized
 * for VIDEO: strips header + padding + RTP header-extension, decrypts the legacy
 * AES layer, then DAVE-decrypts with `MediaType.VIDEO` (audio's wrapper hardcodes
 * AUDIO). Returns the clear H264 RTP payload, or null on any failure.
 */
function decryptVideoPacket(
  buffer: Buffer,
  connectionData: {
    encryptionMode?: string;
    nonceBuffer?: Buffer;
    secretKey?: Buffer | Uint8Array;
  },
  daveSession: { session?: Davey.DAVESession } | undefined,
  userId: string,
): Buffer | null {
  const { encryptionMode, nonceBuffer, secretKey } = connectionData;
  if (!encryptionMode || !nonceBuffer || !secretKey || !daveSession?.session)
    return null;
  if (buffer.length < AUTH_TAG_LENGTH + UNPADDED_NONCE_LENGTH + 12) return null;

  let packet: Buffer;
  try {
    packet = legacyDecryptLayer(buffer, encryptionMode, nonceBuffer, secretKey);
  } catch (e) {
    _log.debug(
      { userId, err: String(e), msgLen: buffer.length },
      "legacyDecryptLayer threw",
    );
    return null; // per-packet legacy decrypt failures are transient
  }
  if (!packet || packet.length === 0) {
    _log.debug(
      { userId, msgLen: buffer.length },
      "legacyDecryptLayer returned empty",
    );
    return null;
  }

  // RTP padding (P bit) — strip trailing padding bytes (see parsePacket).
  const hasPadding = buffer[0] !== 0 && Boolean(buffer[0] & 32);
  if (hasPadding) {
    const paddingAmount = packet[packet.length - 1];
    if (paddingAmount < packet.length) {
      packet = packet.subarray(0, packet.length - paddingAmount);
    }
  }
  // RTP header extension (0xBE 0xDE at bytes 12-13) — skip extension words.
  if (buffer.subarray(12, 14).compare(HEADER_EXTENSION_BYTE) === 0) {
    const headerExtensionLength = buffer.subarray(14).readUInt16BE();
    packet = packet.subarray(4 * headerExtensionLength);
  }

  // DAVE layer — decrypt as VIDEO (audio wrapper hardcodes MediaType.AUDIO).
  // If the DAVE video decryptor is missing (e.g. MLS handshake only set up
  // audio decryptors, or the streamer's video stream wasn't part of the
  // welcome/proposals), decrypt() throws / returns empty. We fall back:
  //   1) MediaType.VIDEO
  //   2) MediaType.AUDIO  (some Discord streams tag video packets as AUDIO)
  //   3) passthrough — return the legacy-decrypted payload as-is (GoLive
  //      screen-share bursts are sometimes sent unencrypted above the AES
  //      layer; DAVE passthrough mode permits this).
  try {
    const decrypted = daveSession.session.decrypt(
      userId,
      MediaType.VIDEO,
      packet,
    );
    if (decrypted && decrypted.length > 0) return decrypted;
    _log.debug(
      { userId, decryptedLen: decrypted?.length, pktLen: packet.length },
      "DAVE VIDEO decrypt returned empty/falsy",
    );
  } catch (e) {
    _log.debug({ userId, err: String(e) }, "DAVE VIDEO decrypt threw");
    // fall through to AUDIO attempt
  }
  try {
    const decryptedAudio = daveSession.session.decrypt(
      userId,
      MediaType.AUDIO,
      packet,
    );
    if (decryptedAudio && decryptedAudio.length > 0) return decryptedAudio;
    _log.debug(
      { userId, decryptedLen: decryptedAudio?.length, pktLen: packet.length },
      "DAVE AUDIO decrypt returned empty/falsy",
    );
  } catch (e) {
    _log.debug({ userId, err: String(e) }, "DAVE AUDIO decrypt threw");
    // fall through to passthrough
  }
  // Passthrough: assume unencrypted above AES layer (or decryptor unavailable).
  _log.debug(
    {
      userId,
      passthroughLen: packet.length,
      firstBytes: packet.subarray(0, 8).toString("hex"),
    },
    "VIDEO passthrough (decrypt failed for all modes)",
  );
  return packet.length > 0 ? packet : null;
}

function handleUdpMessage(
  watchKey: string,
  net: {
    state: {
      connectionData?: {
        encryptionMode?: string;
        nonceBuffer?: Buffer;
        secretKey?: Buffer | Uint8Array;
      };
      dave?: { session?: Davey.DAVESession };
    };
  },
  uid: string,
  msg: Buffer,
): void {
  if (msg.length <= 12) return;
  const payloadType = msg[1] & 127;
  // Opus = 120. Anything else on the video/watch socket is video (H264 etc.).
  if (payloadType === RTP_OPUS_PAYLOAD_TYPE) return;
  const watch = watches.get(watchKey);
  if (!watch) return;
  const conn = net.state.connectionData ?? {};
  // Diagnose: is a DAVE session actually attached, and is it ready to decrypt?
  const dave = net.state.dave;
  const s = (dave as { session?: { ready?: boolean } } | undefined)?.session;
  const daveReady = Boolean(s?.ready);
  const haveKey = Boolean(
    conn.encryptionMode && conn.nonceBuffer && conn.secretKey,
  );
  // Aggregate stats — track distinct PTs and max packet size so we can tell
  // whether real H264 (large, PT 96-127) arrives vs only small control packets.
  const now = Date.now();
  const stat =
    watch._diag ??
    ({ video: 0, maxLen: 0, pts: new Set<number>() } as {
      video: number;
      maxLen: number;
      pts: Set<number>;
    });
  stat.video += 1;
  if (msg.length > stat.maxLen) stat.maxLen = msg.length;
  stat.pts.add(payloadType);
  watch._diag = stat;
  const diagCount = stat.video;
  const dueAt = watch._diagNext ?? 0;
  if (diagCount === 1 || now >= dueAt) {
    watch._diagNext = now + 20_000;
    const pts = [...stat.pts].join(",");
    const ssrc = msg.readUInt32BE(8);
    const first = msg[0];
    const flags = msg[1];
    logger.info(
      {
        userId: uid,
        video: stat.video,
        maxLen: stat.maxLen,
        pts,
        haveKey,
        daveAttached: !!dave?.session,
        daveReady,
        ssrc,
        firstByte: first,
        flagsByte: flags,
        seq: msg.readUInt16BE(2),
        hex: msg.subarray(0, 32).toString("hex"),
      },
      `VIDEO-PKT diag video=${stat.video} maxLen=${stat.maxLen} pts=[${pts}] haveKey=${haveKey} dave=${!!dave?.session} ready=${daveReady} ssrc=${ssrc} first=${first} flags=${flags} hex=${msg.subarray(0, 32).toString("hex")}`,
    );
  }
  const decrypted = decryptVideoPacket(
    msg,
    conn,
    // djs/voice stores the DAVESession at net.state.dave (NOT inside
    // connectionData) — look it up at the top-level state so DAVE layer
    // decrypt (MediaType.VIDEO) actually runs.
    net.state.dave,
    uid,
  );
  if (!decrypted) {
    // Log why — no other visibility into per-packet decrypt failures.
    _log.debug(
      {
        videoCount: stat?.video,
        daveAttached: !!net.state.dave?.session,
        msgLen: msg.length,
      },
      "decryptVideoPacket returned NULL — packet dropped",
    );
    return;
  }

  if (!watch.out) {
    // First successful decrypt — open output file.
    void openOutput(watchKey, watch, decrypted);
    return;
  }
  // Reject writes while a segment close is in-flight (silence detected).
  if (watch.closing) return;
  watch.lastPacketAt = Date.now();
  let nals: Buffer[];
  try {
    nals = watch.depacketizer.push(decrypted);
  } catch {
    return;
  }
  for (const nal of nals) {
    watch.bytesWritten += nal.length;
    if (!watch.out.write(nal)) {
      watch.out.once("drain", () => {});
    }
  }
}

async function openOutput(
  _watchKey: string,
  watch: WatchState,
  _first: Buffer,
): Promise<void> {
  if (watch.out) return;
  const dir = path.join(_recordingsDir, watch.uid);
  await fsPromises.mkdir(dir, { recursive: true });
  // Filename includes the per-watch segment counter so a new segment after
  // silence never collides with the (possibly still in-flight) previous one.
  const seq = watch.segmentSeq++;
  const filePath = path.join(
    dir,
    `video-${watch.channelId}-${watch.startedAt}-${seq}.h264`,
  );
  watch.filePath = filePath;
  watch.out = createWriteStream(filePath);
  // Swallow EPIPE / ERR_STREAM_WRITE_AFTER_END on the segment file when a
  // close races an in-flight UDP write — an unhandled stream 'error' here
  // would crash the gateway (same class as the media EPIPE incidents).
  watch.out.on("error", () => {});
  watch.segmentStartAt = Date.now();
  logger.info(
    { userId: watch.uid, path: filePath },
    "Video segment opened (DAVE video RTP received)",
  );
}

/**
 * Close the current segment's write stream, mux the H264 to MP4, and
 * register the recording in the DB + upload. After this, the watch is
 * ready for a new segment (silence ended → packets resume).
 * Mirrors voice recording's finalizeSegment + uploadRecordingSegment flow.
 */
async function closeCurrentSegment(watch: WatchState): Promise<void> {
  if (!watch.out || watch.out.destroyed || watch.closing) return;
  // Mark closing FIRST (synchronously) so the UDP handler stops writing.
  watch.closing = true;
  const filePath = watch.filePath;
  const segmentStart = watch.segmentStartAt;
  const bytes = watch.bytesWritten;

  // Flush the write stream to disk.
  const flushed = new Promise<void>((resolve) => {
    if (!watch.out || watch.out.destroyed) {
      resolve();
      return;
    }
    watch.out.once("finish", () => resolve());
    watch.out.end();
  });
  await flushed;

  // Reset watch state for the next segment.
  watch.out = undefined as unknown as WriteStream;
  watch.filePath = "";
  watch.bytesWritten = 0;
  watch.segmentStartAt = 0;
  watch.closing = false;
  // Reset the depacketizer so a partial FU-A fragment from this segment
  // doesn't bleed into the next segment (it only writes complete NALs).
  watch.depacketizer.reset();

  if (!filePath) return;

  // Discard very short segments (<1s) — avoids creating tiny MP4 files.
  const durationMs = Date.now() - segmentStart;
  if (durationMs < VIDEO_MIN_SEGMENT_MS) {
    logger.debug(
      { userId: watch.uid, durationMs },
      "Video segment too short, discarding",
    );
    fsPromises.unlink(filePath).catch(() => {});
    return;
  }

  // Mux H264 to MP4 and register in DB + upload.
  try {
    const mp4 = await muxToMp4(filePath);
    await finalizeVideoSegment({
      mp4Path: mp4,
      userId: watch.uid,
      guildId: watch.guildId,
      channelId: watch.channelId,
      startTime: segmentStart,
      durationMs,
      bytes,
    });
    logger.info(
      { userId: watch.uid, mp4, durationMs, bytes },
      "Video segment finalized + uploaded",
    );
  } catch (err) {
    logger.warn(
      {
        userId: watch.uid,
        err: err instanceof Error ? err.message : String(err),
      },
      "Video segment finalize failed (raw .h264 kept)",
    );
  }
}

/**
 * Register a completed video MP4 segment in the DB and upload it.
 * Reuses the voice_recordings table (filename indicates video).
 */
async function finalizeVideoSegment(input: {
  mp4Path: string;
  userId: string;
  guildId: string;
  channelId: string;
  startTime: number;
  durationMs: number;
  bytes: number;
}): Promise<void> {
  const { mp4Path, userId, guildId, channelId, startTime, durationMs, bytes } =
    input;
  const segmentId = `video-${userId}-${startTime}`;
  const fileName = path.basename(mp4Path);

  try {
    // Get file size and register in DB.
    const fileStats = await stat(mp4Path);
    const { insertVoiceRecording } = await import(
      "../../shared/database/voiceRecordingRepo.js"
    );
    await insertVoiceRecording({
      id: segmentId,
      user_id: userId,
      username: userId, // Will be enriched by frontend from user_profiles
      avatar_url: null,
      guild_id: guildId,
      channel_id: channelId,
      channel_name: null,
      filename: fileName,
      size_bytes: fileStats.size,
      upload_status: "pending",
      created_at: Date.now(),
    });

    // Upload MP4 to TeleUploader.
    const { uploadToTele } = await import("../../shared/uploader.js");
    const { config } = await import("../../shared/config/config.js");
    const fileBuffer = await fsPromises.readFile(mp4Path);
    const uploadResult = await uploadToTele({
      buffer: fileBuffer,
      filename: fileName,
      contentType: "video/mp4",
      uploadUrl: config.TELE_UPLOAD_URL,
      retries: 3,
    });

    // Update DB with upload URL.
    const { updateVoiceRecordingAsUploaded } = await import(
      "../../shared/database/voiceRecordingRepo.js"
    );
    await updateVoiceRecordingAsUploaded(
      segmentId,
      uploadResult.url,
      Date.now(),
    );
    logger.info(
      { segmentId, url: uploadResult.url, durationMs, bytes },
      "Video segment uploaded successfully",
    );

    // Broadcast via EventBroadcaster.
    const { _eventBroadcaster } = await import("./recorder.js");
    if (_eventBroadcaster) {
      _eventBroadcaster
        .voiceRecordingUploaded({
          id: segmentId,
          user_id: userId,
          username: userId,
          avatar_url: null,
          guild_id: guildId,
          channel_id: channelId,
          channel_name: null,
          filename: fileName,
          size_bytes: fileStats.size,
          download_url: uploadResult.url,
          upload_status: "uploaded",
          created_at: Date.now(),
          uploaded_at: Date.now(),
        })
        .catch(() => {});
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(
      { segmentId, error: errorMsg },
      "Failed to upload video segment",
    );
    // Mark as failed in DB (best-effort).
    const { updateVoiceRecordingAsFailed } = await import(
      "../../shared/database/voiceRecordingRepo.js"
    );
    await updateVoiceRecordingAsFailed(segmentId, errorMsg).catch(() => {});
  }
}

function closeWatch(watch: WatchState): void {
  if (!watch) return;
  try {
    watch.net.destroy();
  } catch {
    /* ignore */
  }
  // Finalize any open segment (mux to MP4 + DB + upload).
  if (watch.out && !watch.out.destroyed) {
    void closeCurrentSegment(watch);
  }
}

export function closeWatchByKey(watchKey: string): void {
  const watch = watches.get(watchKey);
  if (!watch) return;
  watches.delete(watchKey);
  pendingServerId.delete(watchKey);
  closeWatch(watch);
}

/** Stop watching `userId` in `guildId` (streaming stopped / user left). */
export function stopStreamWatch(guildId: string, userId: string): void {
  closeWatchByKey(`${guildId}:${userId}`);
}

/** Stop ALL watches for a guild (voice disconnect / channel untrack). */
export function stopAllStreamWatches(guildId: string): void {
  for (const key of [...watches.keys()]) {
    if (key.startsWith(`${guildId}:`)) closeWatchByKey(key);
  }
}
