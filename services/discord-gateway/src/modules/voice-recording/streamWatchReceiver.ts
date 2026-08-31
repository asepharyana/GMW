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
import {
  createWriteStream,
  promises as fsPromises,
  type WriteStream,
} from "node:fs";
import path from "node:path";
import { Networking, type NetworkingState } from "@discordjs/voice";
import type Davey from "@snazzah/davey";
import { MediaType } from "@snazzah/davey";
import type { Client, VoiceChannel } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import { H264Depacketizer, muxToMp4 } from "./videoReceiver.js";

const logger = createChildLogger("stream-watch");

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
}

const watches = new Map<string, WatchState>(); // key `${guildId}:${uid}`
const pendingServerId = new Map<string, string>(); // key `${guildId}:${uid}` -> rtc_server_id (from STREAM_CREATE)

let _client: Client | undefined;
let _rawAttached = false;
let _recordingsDir = "/var/lib/gmw/recordings";

export function setStreamWatchRecordingsDir(dir: string): void {
  _recordingsDir = dir;
}

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
export function startStreamWatch(channel: VoiceChannel, userId: string): void {
  if (!_client) {
    logger.warn("startStreamWatch: no client set");
    return;
  }
  const watchKey = `${channel.guild.id}:${userId}`;
  if (watches.has(watchKey)) return; // already watching
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

  // The bot's ACTIVE voice-session id (from the selfbot client's voice manager —
  // the same session the guild @discordjs/voice connection rides).
  const voiceManager = (
    _client as unknown as {
      voice?: { connection?: { authentication?: { sessionId?: string } } };
    }
  ).voice;
  const sessionId = voiceManager?.connection?.authentication?.sessionId;

  logger.info(
    { userId: uid, endpoint, serverId, hasSession: !!sessionId },
    "Opening DAVE Networking to watch RTC",
  );

  const net = new Networking(
    {
      endpoint,
      serverId,
      userId: botId,
      sessionId: sessionId ?? "none",
      token,
      channelId,
    },
    { daveEncryption: true },
  );

  const uidProps = uid;
  const netAny = net as unknown as {
    state: NetworkingState & {
      udp?: {
        on: (e: string, cb: (m: Buffer) => void) => void;
        off: (e: string, cb: (m: Buffer) => void) => void;
      };
      dave?: { session?: Davey.DAVESession };
    };
  };

  const onMessage = (msg: Buffer): void => {
    handleUdpMessage(watchKey, netAny, uidProps, msg);
  };

  net.on("stateChange", (newState: unknown) => {
    const s = newState as { code?: number };
    const code = s?.code;
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
  });
}

function handleUdpMessage(
  watchKey: string,
  net: { state: { dave?: { session?: Davey.DAVESession } } },
  uid: string,
  msg: Buffer,
): void {
  if (msg.length <= 12) return;
  const payloadType = msg[1] & 127;
  // Opus = 120. Anything else on the video/watch socket is video (H264 etc.).
  // (We only watch a stream, so deliver everything non-opus to the video path.)
  if (payloadType === 120) return;
  const watch = watches.get(watchKey);
  if (!watch) return;
  // RTP header (12 bytes) + optional CSRC/extensions. For DAVE video we pass the
  // RTP payload (after the header) to the session, matching audio's parsePacket.
  // Minimal header parse: assume 12-byte header (Discord video RTP uses no header
  // extension for this stream, matching the Discord-RE reference SDP).
  const rtpPayload = msg.subarray(12);
  const dave = net.state.dave;
  if (!dave?.session) return;
  let decrypted: Buffer;
  try {
    decrypted = dave.session.decrypt(uid, MediaType.VIDEO, rtpPayload);
  } catch {
    return; // per-packet decrypt failures are transient; skip
  }
  if (!decrypted || decrypted.length === 0) return;

  if (!watch.out) {
    // First successful decrypt — open output file.
    void openOutput(watchKey, watch, decrypted);
    return;
  }
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
  const filePath = path.join(
    dir,
    `video-${watch.channelId}-${watch.startedAt}.h264`,
  );
  watch.filePath = filePath;
  watch.out = createWriteStream(filePath);
  logger.info(
    { userId: watch.uid, path: filePath },
    "Video burst opened (DAVE video RTP received)",
  );
}

function closeWatch(watch: WatchState): void {
  if (!watch) return;
  try {
    watch.net.destroy();
  } catch {
    /* ignore */
  }
  if (watch.out && !watch.out.destroyed) {
    const flushed = new Promise<void>((resolve) => {
      watch.out.once("finish", () => resolve());
      watch.out.end();
    });
    void flushed
      .then(() => muxToMp4(watch.filePath))
      .then((mp4) =>
        logger.info(
          { userId: watch.uid, mp4, bytes: watch.bytesWritten },
          "Video muxed to mp4",
        ),
      )
      .catch((err) =>
        logger.warn(
          {
            userId: watch.uid,
            err: err instanceof Error ? err.message : String(err),
          },
          "Video mux failed (raw .h264 kept)",
        ),
      );
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
