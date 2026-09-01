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

let _client: Client | undefined;
let _listenerAttached = false;
/** Resolved at runtime from config (kept default as fallback). */
let _recordingsDir = "/var/lib/gmw/recordings";

export function setVideoRecordingsDir(dir: string) {
  _recordingsDir = dir;
  setStreamWatchRecordingsDir(dir);
}

/** Test-only: clear all module-level state. */
export function __resetVideoRecorderState(): void {
  watchedChannels.clear();
  _listenerAttached = false;
  _client = undefined;
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
 * BUG FIX (2026-09-02): `channel.members` is often EMPTY after a gateway
 * restart because the selfbot's guild member cache hasn't been populated yet.
 * When that happens, fall back to the Discord REST voice-states endpoint which
 * returns all users currently in the voice channel with their live voice state
 * (self_video, self_stream, etc.).  This ensures we detect pre-existing
 * camera/screen-share users even on a cold start.
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

  // ── Path B: cache empty → fetch guild members via REST ────────────────
  // GET /channels/{id}/voice-states is BOT-ONLY since 2023 — user tokens get
  // 404. The user-token-compatible way to discover who is in the voice
  // channel: fetch the guild member list (GET /guilds/{id}/members — used
  // elsewhere by the selfbot) which populates member.voice states, then scan
  // `channel.members` again.  Fire-and-forget retry: if it still looks empty
  // after one fetch, we give up quietly (voiceStateUpdate will catch anyone
  // who toggles later).
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
