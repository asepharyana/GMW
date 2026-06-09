import {
  COMMAND_MEDIA_QUEUE,
  COMMAND_MEDIA_SKIP,
  COMMAND_MEDIA_STOP,
  COMMAND_MEDIA_VOLUME,
  MEDIA_STATUS_KEY,
} from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import { publishCommand, readRedisStatus } from "../../shared/redis/index.js";

const logger = createChildLogger("media.service");

// ---------------------------------------------------------------------------
// Types — match frontend exactly
// ---------------------------------------------------------------------------

export interface MediaItem {
  id?: string;
  source: string;
  title: string;
  mode?: "music" | "screen";
  durationMs?: number | null;
  thumbnailUrl?: string | null;
}

export interface MediaState {
  playing: boolean;
  musicVolume: number;
  current: MediaItem | null;
  queue: MediaItem[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_COMMAND_TIMEOUT_MS = 5000;

const DEFAULT_STATE: MediaState = {
  playing: false,
  musicVolume: 1.0,
  current: null,
  queue: [],
};

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Read media status from Redis key `media:status` set by discord-gateway.
 */
export async function getStatus(): Promise<MediaState> {
  logger.debug("getStatus called");
  const cached = await readRedisStatus(MEDIA_STATUS_KEY);

  if (cached) {
    const rawPlaying = cached.playing;
    // Handle both boolean (new) and string (legacy from String(discordPlayer.getStatus()))
    const playing =
      rawPlaying === true ||
      rawPlaying === "playing" ||
      rawPlaying === "buffering";
    return {
      playing,
      musicVolume: Number(cached.musicVolume ?? 1.0),
      current: (cached.current as MediaItem | null) ?? null,
      queue: (cached.queue as MediaItem[]) ?? [],
    };
  }

  return DEFAULT_STATE;
}

/**
 * Queue a media source via Redis command to discord-gateway.
 */
export async function queue(
  source: string,
  mode: "music" | "screen" = "music",
): Promise<MediaState> {
  logger.info({ source, mode }, "queue called");
  const reply = await publishCommand<MediaState>(
    COMMAND_MEDIA_QUEUE,
    { source, mode },
    DEFAULT_COMMAND_TIMEOUT_MS,
  );

  if (reply?.success && reply.data) {
    return {
      playing: reply.data.playing,
      musicVolume: reply.data.musicVolume,
      current: reply.data.current ?? null,
      queue: reply.data.queue ?? [],
    };
  }

  logger.warn(
    { source, mode },
    "discord-gateway unreachable, returning current media status",
  );
  return getStatus();
}

/**
 * Skip current track via Redis command to discord-gateway.
 */
export async function skip(): Promise<MediaState> {
  logger.info("skip called");
  const reply = await publishCommand<MediaState>(
    COMMAND_MEDIA_SKIP,
    {},
    DEFAULT_COMMAND_TIMEOUT_MS,
  );

  if (reply?.success && reply.data) {
    return {
      playing: reply.data.playing,
      musicVolume: reply.data.musicVolume,
      current: reply.data.current ?? null,
      queue: reply.data.queue ?? [],
    };
  }

  logger.warn("discord-gateway unreachable, returning current media status");
  return getStatus();
}

/**
 * Stop playback via Redis command to discord-gateway.
 */
export async function stop(): Promise<MediaState> {
  logger.info("stop called");
  const reply = await publishCommand<MediaState>(
    COMMAND_MEDIA_STOP,
    {},
    DEFAULT_COMMAND_TIMEOUT_MS,
  );

  if (reply?.success && reply.data) {
    return {
      playing: reply.data.playing,
      musicVolume: reply.data.musicVolume,
      current: reply.data.current ?? null,
      queue: reply.data.queue ?? [],
    };
  }

  logger.warn("discord-gateway unreachable, returning current media status");
  return getStatus();
}

/**
 * Set volume via Redis command to discord-gateway.
 */
export async function setVolume(volume: number): Promise<MediaState> {
  logger.info({ volume }, "setVolume called");
  const reply = await publishCommand<MediaState>(
    COMMAND_MEDIA_VOLUME,
    { volume },
    DEFAULT_COMMAND_TIMEOUT_MS,
  );

  if (reply?.success && reply.data) {
    return {
      playing: reply.data.playing,
      musicVolume: reply.data.musicVolume,
      current: reply.data.current ?? null,
      queue: reply.data.queue ?? [],
    };
  }

  logger.warn(
    { volume },
    "discord-gateway unreachable, returning current media status",
  );
  return getStatus();
}
