import {
  createChildLogger,
  tryCommandThenFallback,
} from "../../shared/commandHelper.js";
import {
  COMMAND_MEDIA_LOOP,
  COMMAND_MEDIA_QUEUE,
  COMMAND_MEDIA_SKIP,
  COMMAND_MEDIA_STOP,
  MEDIA_STATUS_KEY,
} from "../../shared/index.js";
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
  /** null/absent when idle; "music" | "screen" while a track is active. */
  activeMode?: "music" | "screen" | null;
  musicVolume: number;
  loop: boolean;
  current: MediaItem | null;
  queue: MediaItem[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_COMMAND_TIMEOUT_MS = 5000;

const DEFAULT_STATE: MediaState = {
  playing: false,
  activeMode: null,
  musicVolume: 0.3,
  loop: false,
  current: null,
  queue: [],
};

// ---------------------------------------------------------------------------
// Normalisation — handle both boolean (new) and string (legacy) playing values
// ---------------------------------------------------------------------------

function normalizeMediaState(raw: Record<string, unknown>): MediaState {
  const rawPlaying = raw.playing;
  const playing =
    rawPlaying === true ||
    rawPlaying === "playing" ||
    rawPlaying === "buffering";
  const mode = raw.activeMode;
  const activeMode: "music" | "screen" | null =
    mode === "music" || mode === "screen" ? mode : null;
  return {
    playing,
    activeMode,
    musicVolume: Number(raw.musicVolume ?? 0.3),
    loop: Boolean(raw.loop ?? false),
    current: (raw.current as MediaItem | null) ?? null,
    queue: (raw.queue as MediaItem[]) ?? [],
  };
}

type MediaReplyData = Record<string, unknown> | MediaState;

function _fromReply(data: MediaReplyData): MediaState {
  return normalizeMediaState(data as Record<string, unknown>);
}

async function readStatusFallback(): Promise<MediaState> {
  const cached = await readRedisStatus(MEDIA_STATUS_KEY);
  return cached ? normalizeMediaState(cached) : DEFAULT_STATE;
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Read media status from Redis key `media:status` set by discord-gateway.
 */
export async function getStatus(): Promise<MediaState> {
  logger.debug("getStatus called");
  return readStatusFallback();
}

/**
 * Queue a media source via Redis command to discord-gateway.
 */
export async function queue(
  source: string,
  mode: "music" | "screen" = "music",
): Promise<MediaState> {
  logger.info({ source, mode }, "queue called");
  return tryCommandThenFallback(
    () =>
      publishCommand<MediaState>(
        COMMAND_MEDIA_QUEUE,
        // NOTE: gateway MediaHandler reads `payload.url` (not `source`) —
        // keep the field name aligned or playback silently no-ops.
        { url: source, mode },
        DEFAULT_COMMAND_TIMEOUT_MS,
      ),
    () => readStatusFallback(),
    "queue",
  );
}

/**
 * Skip current track via Redis command to discord-gateway.
 */
export async function skip(): Promise<MediaState> {
  logger.info("skip called");
  return tryCommandThenFallback(
    () =>
      publishCommand<MediaState>(
        COMMAND_MEDIA_SKIP,
        {},
        DEFAULT_COMMAND_TIMEOUT_MS,
      ),
    () => readStatusFallback(),
    "skip",
  );
}

/**
 * Stop playback via Redis command to discord-gateway.
 */
export async function stop(): Promise<MediaState> {
  logger.info("stop called");
  return tryCommandThenFallback(
    () =>
      publishCommand<MediaState>(
        COMMAND_MEDIA_STOP,
        {},
        DEFAULT_COMMAND_TIMEOUT_MS,
      ),
    () => readStatusFallback(),
    "stop",
  );
}

/**
 * Toggle loop mode (replay current track on natural end) via Redis command.
 */
export async function setLoop(loop: boolean): Promise<MediaState> {
  logger.info({ loop }, "setLoop called");
  return tryCommandThenFallback(
    () =>
      publishCommand<MediaState>(
        COMMAND_MEDIA_LOOP,
        { loop },
        DEFAULT_COMMAND_TIMEOUT_MS,
      ),
    () => readStatusFallback(),
    "setLoop",
  );
}
