/**
 * Video recorder (camera + screen share) for OTHER members.
 *
 * WHY THIS EXISTS (root cause, 2026-08-31):
 * Phase A/B hooked @discordjs/voice's UDP socket and depacketized H264 RTP
 * directly. It captured ZERO video because @discordjs/voice is audio-only and
 * NEVER sends the gateway `STREAM_WATCH` signal — so Discord never forwards a
 * member's video RTP to the bot. The raw-UDP approach can't work for receive.
 *
 * The correct, native path lives in discord.js-selfbot-v13's own voice stack:
 *   - Join a selfbot `VoiceConnection` that shares the bot's single voice
 *     session (ClientVoiceManager.onVoiceStateUpdate feeds BOTH the
 *     @discordjs/voice adapter and the selfbot connection from the same
 *     VOICE_STATE_UPDATE — the two stacks are designed to coexist).
 *   - Detect a member started streaming via voiceState.streaming
 *     (= data.self_stream).
 *   - `joinStreamConnection(userId)` → sends STREAM_WATCH (op 20) so Discord
 *     authorizes video RTP to us.
 *   - `receiver.createVideoStream(userId, filepath)` → PacketHandler routes the
 *     member's H264+Opus RTP to a `Recorder` (ffmpeg over UDP) which muxes to
 *     Matroska (.mkv).
 *
 * All of this is best-effort: any failure is logged and NEVER breaks the
 * gateway's existing audio/voice recording.
 */

import { promises as fsPromises } from "node:fs";
import path from "node:path";
import type { Client, VoiceChannel, VoiceState } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";

const logger = createChildLogger("video-recorder");

interface WatchHandle {
  guildId: string;
  userId: string;
  recorder: unknown;
  path: string;
}

/** Recorders keyed by `${guildId}:${userId}`. */
const activeRecorders = new Map<string, WatchHandle>();

/** Channels currently under audio recording, keyed by guildId. */
const watchedChannels = new Map<string, VoiceChannel>();

let _client: Client | undefined;
let _listenerAttached = false;

/** Resolved at runtime from config (kept default as fallback). */
let _recordingsDir = "/var/lib/gmw/recordings";

export function setVideoRecordingsDir(dir: string) {
  _recordingsDir = dir;
}

/**
 * Set the selfbot client and register the singleton voiceStateUpdate listener
 * (idempotent). Called once at gateway bootstrap.
 */
export function setVideoRecorderClient(client: Client | undefined) {
  _client = client;
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
}

/** Unregister a channel (voice stopped). Tear down any video recorders. */
export function untrackChannel(guildId: string) {
  watchedChannels.delete(guildId);
  stopAllVideoRecordings(guildId);
}

async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  try {
    const selfId = _client?.user?.id;
    if (selfId && newState.id === selfId) return; // never record bot's own video
    if (_client && oldState.id === selfId) return;

    const guildId = newState.guild?.id;
    const channel = guildId ? watchedChannels.get(guildId) : undefined;
    if (!channel) return; // not an actively-recorded channel

    const streaming = Boolean(newState.streaming);
    const inChannel = newState.channelId === channel.id;

    if (streaming && inChannel) {
      await startVideoRecording(channel, newState.id);
    } else if (!inChannel) {
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
 * Begin recording the video (camera / screen share) of `userId` in `channel`.
 * Returns the watch handle on success, or null on any failure.
 */
export async function startVideoRecording(
  channel: VoiceChannel,
  userId: string,
): Promise<WatchHandle | null> {
  try {
    if (!_client) {
      logger.warn("Video recorder: no client set, skipping");
      return null;
    }
    const selfId = _client.user?.id;
    if (selfId && userId === selfId) return null;

    const key = `${channel.guild.id}:${userId}`;
    if (activeRecorders.has(key)) return activeRecorders.get(key) ?? null;

    const voiceManager = (_client as unknown as { voice?: unknown }).voice as
      | {
          joinChannel?: (
            ch: unknown,
            cfg?: {
              selfMute?: boolean;
              selfDeaf?: boolean;
              selfVideo?: boolean;
            },
          ) => Promise<unknown>;
        }
      | undefined;

    if (!voiceManager?.joinChannel) {
      logger.warn("Video recorder: selfbot voice manager unavailable");
      return null;
    }

    // 1. Selfbot voice connection — joinChannel is idempotent (reuses
    //    ClientVoiceManager.connection, re-confirms the same session).
    const voiceConn = await voiceManager.joinChannel(channel, {
      selfMute: false,
      selfDeaf: false,
      selfVideo: false,
    });
    if (!voiceConn) return null;

    // 2. STREAM_WATCH handshake.
    const watchConn = await (
      voiceConn as unknown as {
        joinStreamConnection?: (u: string) => Promise<unknown>;
      }
    ).joinStreamConnection?.(userId);
    if (!watchConn) {
      logger.warn(
        { userId, guildId: channel.guild.id },
        "joinStreamConnection returned no connection — is the user streaming?",
      );
      return null;
    }
    await (
      watchConn as unknown as { sendSignalScreenshare?: () => unknown }
    ).sendSignalScreenshare?.();

    // 3. Recorder → .mkv
    const dir = path.join(_recordingsDir, userId);
    await fsPromises.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, `video-${channel.id}-${Date.now()}.mkv`);

    const receiver = (voiceConn as unknown as { receiver?: unknown })
      .receiver as
      | { createVideoStream?: (u: string, out: string) => unknown }
      | undefined;
    if (!receiver?.createVideoStream) {
      logger.warn("Video recorder: receiver.createVideoStream unavailable");
      return null;
    }
    const recorder = receiver.createVideoStream(userId, outPath);

    const handle: WatchHandle = {
      guildId: channel.guild.id,
      userId,
      recorder,
      path: outPath,
    };

    activeRecorders.set(key, handle);

    const rec = recorder as unknown as {
      on?: (e: string, cb: () => void) => void;
    };
    if (typeof rec.on === "function") {
      rec.on("ready", () => {
        logger.info(
          { userId, path: outPath, guildId: channel.guild.id },
          "Video recorder ready (ffmpeg muxing started)",
        );
      });
      rec.on("closed", () => {
        logger.info(
          { userId, path: outPath, guildId: channel.guild.id },
          "Video recorder closed",
        );
        activeRecorders.delete(key);
      });
    }

    logger.info(
      { userId, path: outPath, guildId: channel.guild.id },
      "Started video recording via STREAM_WATCH",
    );
    return handle;
  } catch (err) {
    logger.warn(
      {
        userId,
        guildId: channel.guild.id,
        err: err instanceof Error ? err.message : String(err),
      },
      "Video recording failed (best-effort, ignoring)",
    );
    return null;
  }
}

/** Stop and tear down the video recorder for userId in guildId. */
export function stopVideoRecording(guildId: string, userId: string): void {
  const key = `${guildId}:${userId}`;
  const handle = activeRecorders.get(key);
  if (!handle) return;
  try {
    const rec = handle.recorder as unknown as {
      destroy?: () => void;
      close?: () => void;
    };
    rec.destroy?.();
    activeRecorders.delete(key);
    logger.info({ userId, path: handle.path }, "Stopped video recording");
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "Error stopping video recording",
    );
  }
}

/** Tear down ALL video recorders for a guild (e.g. on voice disconnect). */
export function stopAllVideoRecordings(guildId: string): void {
  for (const [key, handle] of activeRecorders) {
    if (handle?.guildId === guildId) {
      stopVideoRecording(handle.guildId, handle.userId);
      activeRecorders.delete(key);
    }
  }
}

export type { WatchHandle };
