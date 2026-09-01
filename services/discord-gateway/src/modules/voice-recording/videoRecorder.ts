/**
 * Video recorder (camera + screen share) for OTHER members.
 *
 * ARCHITECTURE (2026-08-31, Phase D — DAVE-capable stream-watch):
 *
 * The previous selfbot-v13 path (discord.js-selfbot-v13 `joinStreamConnection`)
 * is DEAD because Discord now mandates DAVE (E2EE) on all voice RTC connections.
 * The selfbot's voice stack identifies with NO `max_dave_protocol_version` →
 * Discord closes the WS with code 4017 ("E2EE/DAVE protocol required") on
 * every attempt, making selfbot-based video-receive impossible.
 *
 * The working path:
 * 1. `voiceStateUpdate` detects `streaming` on a member in a tracked channel.
 * 2. `streamWatchReceiver.startStreamWatch(channel, userId)` is called.
 *    - It sends `STREAM_WATCH` (op 20) via the gateway WS.
 *    - Discord replies with `STREAM_CREATE` + `STREAM_SERVER_UPDATE` containing
 *      the stream's RTC endpoint/token/serverId.
 *    - `streamWatchReceiver` builds a `@discordjs/voice` `Networking` connection
 *      to the stream RTC with DAVE (the same class that handles guild audio).
 *    - It hooks the UDP `message` event, decrypts H264 video via Davey
 *      `MediaType.VIDEO`, and writes to `.h264` → muxed to `.mp4`.
 * 3. `streamWatchReceiver.stopStreamWatch(guildId, userId)` tears everything down.
 *
 * This module is the thin orchestration layer: detect → delegate → teardown.
 * All failures are best-effort and NEVER break the gateway's audio recording.
 */

import type { Client, VoiceChannel, VoiceState } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import {
  setStreamWatchClient,
  setStreamWatchRecordingsDir,
  startStreamWatch,
  stopAllStreamWatches,
  stopStreamWatch,
} from "./streamWatchReceiver.js";

const logger = createChildLogger("video-recorder");

/** Channels currently under audio recording, keyed by guildId. */
const watchedChannels = new Map<string, VoiceChannel>();

/**
 * GUILD_CREATE.voice_states captured at gateway WS connect (the selfbot lib
 * drops them), keyed by guildId.  Consumed by scanExistingStreamers when the
 * channel is tracked (voice join happens AFTER GUILD_CREATE, so we must store
 * these until trackChannel runs).
 */
const pendingGuildCreateVoiceStates = new Map<
  string,
  Array<{
    user_id?: unknown;
    channel_id?: unknown;
    self_video?: boolean;
    self_stream?: boolean;
  }>
>();

let _client: Client | undefined;
let _listenerAttached = false;
// DIAG: collect all raw event types for ~10s after first raw event
const _allRawTypes = new Set<string>();
let _rawDiagLogged = false;
/** Resolved at runtime from config (kept default as fallback). */
let _recordingsDir = "/var/lib/gmw/recordings";

export function setVideoRecordingsDir(dir: string) {
  _recordingsDir = dir;
  setStreamWatchRecordingsDir(dir);
}

/** Test-only: clear all module-level state. */
export function __resetVideoRecorderState(): void {
  watchedChannels.clear();
  pendingGuildCreateVoiceStates.clear();
  _listenerAttached = false;
  _client = undefined;
  _allRawTypes.clear();
  _rawDiagLogged = false;
}

/**
 * Set the selfbot client and register the singleton voiceStateUpdate listener
 * (idempotent). Called once at gateway bootstrap. Also passes the client to
 * streamWatchReceiver for raw event handling (STREAM_CREATE/SERVER_UPDATE).
 */
export function setVideoRecorderClient(client: Client | undefined) {
  _client = client;
  setStreamWatchClient(client);
  if (!client || _listenerAttached) return;
  _listenerAttached = true;
  client.on(
    "voiceStateUpdate",
    (oldState: VoiceState, newState: VoiceState) => {
      void handleVoiceStateUpdate(oldState, newState);
    },
  );
  // THE selfbot-v13 GUILD_CREATE handler DROPS `d.voice_states` (it only sends
  // GUILD_SUBSCRIPTIONS_BULK, never parses the initial voice-state list), so
  // `channel.members` is empty on gateway restart and users who were ALREADY
  // in voice (camera/screen on) are never detected.  Hook the raw GUILD_CREATE
  // payload ourselves and scan the voice_states array — this is the only
  // user-token-compatible source of "who is in the channel right now".
  client.on("raw", (packet: unknown) => {
    const p = packet as {
      t?: string;
      d?: { voice_states?: unknown; id?: unknown };
    } | null;
    if (!p?.t) return;
    // DIAG: log all event types seen after READY (belt-and-suspenders)
    if (_allRawTypes.size < 50) _allRawTypes.add(p.t);
    // DIAG: after 10s, dump all raw types seen
    if (!_rawDiagLogged) {
      _rawDiagLogged = true;
      setTimeout(() => {
        logger.info(
          { rawEventTypes: [..._allRawTypes].sort() },
          "RAW DIAG: all WS raw event types (10s snapshot)",
        );
      }, 10_000);
    }
    // Log significant events
    if (
      p.t === "GUILD_CREATE" ||
      p.t === "READY" ||
      p.t === "GUILD_MEMBERS_CHUNK" ||
      (p.t.startsWith("GUILD") && !p.t.includes("UPDATE"))
    ) {
      const d = p.d as Record<string, unknown>;
      const dAny = d as unknown as {
        broadcaster_user_ids?: unknown;
        sessions?: unknown;
      };
      logger.info(
        {
          rawType: p.t,
          hasVoiceStates: Array.isArray(d?.voice_states),
          voiceStatesCount: Array.isArray(d?.voice_states)
            ? (d.voice_states as unknown[]).length
            : -1,
          broadcasterUserIds: dAny.broadcaster_user_ids,
          sessionVoice: Array.isArray(dAny.sessions)
            ? (
                dAny.sessions as Array<{
                  voice?: unknown;
                  session_id?: unknown;
                }>
              )
                .map((s) => s.voice)
                .filter(Boolean)
                .slice(0, 5)
            : undefined,
          dKeys: Object.keys(d ?? {}).slice(0, 10),
        },
        "RAW diag: GUILD_CREATE/READY/GUILD_MEMBERS_CHUNK",
      );
    }
    if (p.t !== "GUILD_CREATE") return;
    const vs = p.d?.voice_states;
    handleGuildCreateVoiceStates(p.d as Record<string, unknown>, vs);
  });
}

/** Register a channel whose audio recording is active (video should follow). */
export function trackChannel(guildId: string, channel: VoiceChannel) {
  watchedChannels.set(guildId, channel);
  // When the bot joins a channel that ALREADY has people streaming (screen
  // share / camera on BEFORE the bot joined), no voiceStateUpdate with
  // streaming:true fires for them. Scan every member now and start watching
  // anyone already streaming, so we don't miss a live stream in progress.
  // Fire-and-forget: REST fallback may be needed if guild cache is cold.
  void scanExistingStreamers(channel);
}

/**
 * Scan all members currently in `channel` and start watching anyone whose
 * voice state has `streaming` or `self_video` set (screen share / camera
 * already on when the bot joined). Fire-and-forget per member — idempotent
 * (startVideoRecording is a no-op if a watch already exists for that user).
 *
 * BUG FIX (2026-09-02 — user report "tidak mendeteksi user yg sudah ada"):
 * `channel.members` is empty after a gateway restart because (a) the selfbot
 * library's GUILD_CREATE handler DROPS `d.voice_states` (it only sends
 * GUILD_SUBSCRIPTIONS_BULK, never parses the initial voice state list), and
 * (b) guild member cache isn't populated yet. We now capture voice_states
 * raw (Path C, the reliable selfbot-compatible source), fall back to
 * guild.members.fetch() (Path D, may 403 for user tokens), then cache.
 */
export async function scanExistingStreamers(
  channel: VoiceChannel,
): Promise<void> {
  const selfId = _client?.user?.id;
  const videoUsers: { userId: string; source: string }[] = [];

  // ── Path A: guild cache has members ────────────────────────────────────
  const members = channel.members;
  if (members && members.size > 0) {
    for (const [, member] of members) {
      if (member.id === selfId) continue;
      const vs = member.voice;
      const hasVideo = Boolean(vs?.streaming || vs?.selfVideo);
      if (hasVideo) {
        videoUsers.push({ userId: member.id, source: "cache" });
      }
    }
  }

  // ── Path C: GUILD_CREATE.voice_states (buffered at WS connect) ─────────
  // The selfbot lib drops `d.voice_states` from GUILD_CREATE, but we capture
  // it in the raw listener. This is the ONLY selfbot-compatible source of
  // "who is already in voice with video" — not gated by REST permissions.
  if (videoUsers.length === 0) {
    const vsList = pendingGuildCreateVoiceStates.get(channel.guild.id);
    if (Array.isArray(vsList) && vsList.length > 0) {
      for (const vs of vsList) {
        const uid = String(vs.user_id ?? "");
        if (!uid || uid === selfId) continue;
        if (String(vs.channel_id ?? "") !== channel.id) continue;
        const hasVideo = Boolean(vs.self_video || vs.self_stream);
        if (!hasVideo) continue;
        videoUsers.push({ userId: uid, source: "guild-create-voice-states" });
      }
    }
  }

  // ── Path D: cache empty → fetch guild members via REST ────────────────
  // GET /channels/{id}/voice-states is BOT-ONLY since 2023 — user tokens get
  // 404. The user-token-compatible way to discover who is in the voice
  // channel: fetch the guild member list (GET /guilds/{id}/members — used
  // elsewhere by the selfbot) which populates member.voice states, then scan
  // `channel.members` again.  NOTE: user tokens may also get 403 on this REST
  // path (verified 2026-09-02) — Path C is the reliable one; Path D is a
  // best-effort fallback for real bot tokens.
  if (videoUsers.length === 0 && members && members.size === 0 && _client) {
    try {
      await channel.guild.members.fetch();
      // Re-read members now that cache is warm.
      const warmMembers = channel.members;
      if (warmMembers && warmMembers.size > 0) {
        for (const [, member] of warmMembers) {
          if (member.id === selfId) continue;
          const vs = member.voice;
          const hasVideo = Boolean(vs?.streaming || vs?.selfVideo);
          if (hasVideo) {
            videoUsers.push({ userId: member.id, source: "rest-members" });
          }
        }
      }
      logger.info(
        {
          channelId: channel.id,
          fetchedMembers: warmMembers?.size ?? 0,
          foundVideo: videoUsers.length,
        },
        "Fetched guild members via REST for pre-existing video detection",
      );
    } catch (err) {
      logger.warn(
        {
          channelId: channel.id,
          err: err instanceof Error ? err.message : String(err),
        },
        "Failed to fetch guild members via REST — video detection may miss pre-existing users",
      );
    }
  }

  // ── Start watching detected video users ────────────────────────────────
  let watched = 0;
  for (const { userId, source } of videoUsers) {
    startVideoRecording(channel, userId);
    watched++;
    logger.info({ userId, source }, "Detected pre-existing video user on join");
  }
  if (watched > 0) {
    logger.info(
      { guildId: channel.guild.id, watched },
      "Scanned pre-existing streamers on join",
    );
  }
}

/** Unregister a channel (voice stopped). Tear down any video watches. */
export function untrackChannel(guildId: string) {
  watchedChannels.delete(guildId);
  stopAllStreamWatches(guildId);
}

/**
 * Parse `GUILD_CREATE.d.voice_states` and buffer them for when trackChannel
 * runs.  This is the authoritative, user-token-friendly list of everyone
 * already in voice when the gateway connects — but GUILD_CREATE arrives BEFORE
 * the voice join, so we can't start watches yet.  Store per-guild and consume
 * in scanExistingStreamers.
 */
function handleGuildCreateVoiceStates(
  data: Record<string, unknown>,
  voiceStates: unknown,
): void {
  try {
    const guildId = String(data.id ?? data.guild_id ?? "");
    if (!guildId) return;
    if (!Array.isArray(voiceStates)) return;
    const list = voiceStates as Array<{
      user_id?: unknown;
      channel_id?: unknown;
      self_video?: boolean;
      self_stream?: boolean;
    }>;
    pendingGuildCreateVoiceStates.set(guildId, list);
    logger.info(
      { guildId, voiceStates: list.length },
      "Buffered GUILD_CREATE.voice_states for pre-existing video detection",
    );
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "GUILD_CREATE voice_states parse error (ignoring)",
    );
  }
}

async function handleVoiceStateUpdate(
  _oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  try {
    const selfId = _client?.user?.id;
    if (selfId && newState.id === selfId) return; // never record bot's own video

    const guildId = newState.guild?.id;
    const channel = guildId ? watchedChannels.get(guildId) : undefined;
    if (!channel) return; // not an actively-recorded channel

    const streaming = Boolean(newState.streaming);
    const cameraOn = Boolean(newState.selfVideo);
    const hasVideo = streaming || cameraOn;
    const inChannel = newState.channelId === channel.id;

    if (hasVideo && inChannel) {
      startVideoRecording(channel, newState.id);
    } else if (!inChannel || !hasVideo) {
      stopVideoRecording(channel.guild.id, newState.id);
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Video voice-state handler error (ignoring)",
    );
  }
}

/**
 * Begin watching the video (camera / screen share) of `userId` in `channel`.
 * Delegates to `streamWatchReceiver` which handles STREAM_WATCH + DAVE connection.
 */
export function startVideoRecording(
  channel: VoiceChannel,
  userId: string,
): void {
  try {
    const selfId = _client?.user?.id;
    if (selfId && userId === selfId) return;
    void startStreamWatch(channel, userId);
  } catch (err) {
    logger.warn(
      {
        userId,
        guildId: channel.guild.id,
        err: err instanceof Error ? err.message : String(err),
      },
      "startVideoRecording error (best-effort, ignoring)",
    );
  }
}

/** Stop watching `userId`'s video in `guildId`. */
export function stopVideoRecording(guildId: string, userId: string): void {
  stopStreamWatch(guildId, userId);
}

/** Tear down ALL video watches for a guild (e.g. on voice disconnect). */
export function stopAllVideoRecordings(guildId: string): void {
  stopAllStreamWatches(guildId);
}
