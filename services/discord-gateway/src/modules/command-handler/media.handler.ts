import { randomUUID } from "node:crypto";
import { StreamType } from "@discordjs/voice";
import type { CommandMessage, CommandReply } from "../../shared/index.js";
import { createChildLogger } from "../../shared/logger/index.js";
import {
  extractMediaInfo,
  resolveMediaUrl,
  transcodeToHighQualityOgg,
} from "../voice-recording/mediaSource.js";
import type {
  MediaMode,
  MediaQueueItem,
} from "../voice-recording/mediaTypes.js";
import { discordPlayer } from "../voice-recording/player.js";
import { setMediaStatusKey } from "./mediaStatusSink.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MediaStatusItem {
  id: string;
  source: string;
  title: string;
  mode: MediaMode;
  durationMs?: number | null;
  thumbnailUrl?: string | null;
}

export interface MediaStatusPayload {
  playing: boolean;
  activeMode: MediaMode | null;
  musicVolume: number;
  loop: boolean;
  current: MediaStatusItem | null;
  queue: MediaStatusItem[];
}

// ---------------------------------------------------------------------------
// Module-level queue
// ---------------------------------------------------------------------------

const mediaQueue: MediaQueueItem[] = [];
let currentTrackItem: MediaQueueItem | null = null;
let loopEnabled = false;
/** Active ffmpeg transcode (killed on stop/skip). */
let currentTranscodeCleanup: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapToStatusItem(item: MediaQueueItem): MediaStatusItem {
  return {
    id: item.id,
    source: item.source,
    title: item.title,
    mode: item.mode,
    durationMs: item.duration != null ? item.duration * 1000 : null,
    thumbnailUrl: item.thumbnailUrl ?? null,
  };
}

function buildStatusPayload(): MediaStatusPayload {
  return {
    playing:
      currentTrackItem !== null && discordPlayer.getStatus() === "playing",
    activeMode: currentTrackItem?.mode ?? null,
    musicVolume: discordPlayer.getMusicVolume(),
    loop: loopEnabled,
    current: currentTrackItem ? mapToStatusItem(currentTrackItem) : null,
    queue: mediaQueue.map(mapToStatusItem),
  };
}

// ---------------------------------------------------------------------------
// MediaHandler
// ---------------------------------------------------------------------------

export class MediaHandler {
  private logger = createChildLogger("media-handler");

  constructor() {
    // Register auto-advance on natural track end. advanceQueue mutates the
    // module-level currentTrackItem/queue, so we must re-publish the status
    // key afterward: otherwise the backend's Redis `media:status` cache (and
    // the frontend's 10s polling) stays stuck on the finished track.
    discordPlayer.onIdle(() => {
      this.advanceQueue()
        .then(() => this.publishStatus())
        .catch((err) => {
          this.logger.error({ err }, "Auto-advance failed");
        });
    });
  }

  /**
   * Persist the latest media state to Redis so the backend/frontend see queue
   * advances that happen outside a command (natural track end). CommandHandler
   * owns the Redis status-key writes for command-triggered changes; this
   * covers the side-effect-only path.
   */
  private publishStatus(): void {
    try {
      setMediaStatusKey(this.getCurrentMediaStatus());
    } catch (err: unknown) {
      this.logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "Failed to publish media status on track end",
      );
    }
  }

  getCurrentMediaStatus(): MediaStatusPayload {
    return buildStatusPayload();
  }

  async handleMediaQueue(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    // Accept both `url` (canonical) and `source` (legacy FE) for resilience.
    const url = String(cmd.payload.url ?? cmd.payload.source ?? "").trim();
    const requestedBy = String(cmd.payload.requestedBy ?? "unknown");

    if (!url) {
      this.logger.warn("media:queue received without a URL");
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "url is required",
      };
    }

    if (!discordPlayer.isConnected()) {
      this.logger.warn("media:queue attempted without active voice connection");
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Not connected to a voice channel. Connect to voice first.",
      };
    }

    // Lightweight metadata fetch for display — the full resolve happens in playNext
    let title: string = url;
    let duration: number | undefined;
    let thumbnailUrl: string | undefined;
    try {
      const info = await extractMediaInfo(url);
      title = info.title ?? url;
      duration = info.duration;
      thumbnailUrl = info.thumbnail;
    } catch {
      this.logger.warn(
        { url },
        "Could not pre-resolve media metadata, queueing blind",
      );
    }

    const item: MediaQueueItem = {
      id: randomUUID(),
      source: url,
      title,
      kind: "url" as const,
      mode: "music",
      requestedBy,
      addedAt: Date.now(),
      status: "queued",
      duration,
      thumbnailUrl,
    };

    mediaQueue.push(item);
    this.logger.info(
      { url, title, queueLength: mediaQueue.length },
      "Media queued",
    );

    // If nothing is playing, start immediately (next tick so status publishes)
    if (currentTrackItem === null) {
      setImmediate(() => {
        this.playNext().catch((err) => {
          this.logger.error({ err }, "playNext after queue failed");
        });
      });
    }

    return {
      id: cmd.id,
      success: true,
      data: buildStatusPayload(),
    };
  }

  async handleMediaSkip(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    if (currentTrackItem) {
      discordPlayer.stop("music");
      currentTrackItem = null;
    }
    await this.playNext();
    return {
      id: cmd.id,
      success: true,
      data: buildStatusPayload(),
    };
  }

  async handleMediaStop(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    discordPlayer.stop("music");
    currentTrackItem = null;
    mediaQueue.length = 0; // Clear entire queue
    return {
      id: cmd.id,
      success: true,
      data: buildStatusPayload(),
    };
  }

  async handleMediaVolume(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    const volume = Number(cmd.payload.volume);
    if (!Number.isFinite(volume)) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "volume must be a number",
      };
    }
    discordPlayer.setMusicVolume(volume);
    return {
      id: cmd.id,
      success: true,
      data: buildStatusPayload(),
    };
  }

  async handleMediaLoop(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    loopEnabled = Boolean(cmd.payload.loop);
    this.logger.info({ loop: loopEnabled }, "Media loop toggled");
    this.publishStatus();
    return {
      id: cmd.id,
      success: true,
      data: buildStatusPayload(),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Advance to the next item in the queue. Called after natural track end
   * (via onIdle) or after manual skip.
   */
  private async playNext(): Promise<void> {
    // Stop any currently playing track (without triggering idle callback)
    if (currentTrackItem) {
      discordPlayer.stop("music");
      currentTrackItem = null;
    }
    currentTranscodeCleanup?.();
    currentTranscodeCleanup = null;

    const next = mediaQueue.shift();
    if (!next) {
      this.logger.info("Queue empty — nothing to play");
      return;
    }

    currentTrackItem = next;
    next.status = "playing";

    try {
      this.logger.info(
        { url: next.source, title: next.title },
        "Playing next from queue",
      );

      const resolution = await resolveMediaUrl(next.source);

      // Update title/duration with actual resolved values
      next.title = resolution.title ?? next.title;
      next.duration = resolution.duration ?? next.duration;

      // Music playback: transcode once to high-quality OggOpus (48kHz stereo,
      // 192kbps) with volume baked into the encode. This avoids the double
      // lossy encode that inlineVolume would cause and gives Discord the
      // cleanest possible stream.
      const transcoded = transcodeToHighQualityOgg(
        resolution.stream,
        discordPlayer.getMusicVolume(),
      );

      discordPlayer.playStream(transcoded.stream, "music", {
        inputType: StreamType.OggOpus,
        inlineVolume: false,
      });
      currentTranscodeCleanup = transcoded.cleanup;

      this.logger.info({ title: next.title }, "Playback started");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { error: message, url: next.source, title: next.title },
        "Failed to play queued item, skipping to next",
      );

      currentTrackItem = null;
      next.status = "failed";

      // Try the next item in the queue
      setImmediate(() => {
        this.playNext().catch((err2) => {
          this.logger.error(
            { err: err2 },
            "playNext after error recovery failed",
          );
        });
      });
    }
  }

  /**
   * Called by the idle callback — delegates to playNext since the player is
   * already idle and currentTrackItem is already null. When loop mode is
   * enabled and a music track ended naturally, requeue it so it plays again.
   */
  private async advanceQueue(): Promise<void> {
    const finished = currentTrackItem;
    currentTrackItem = null;

    if (loopEnabled && finished && finished.mode === "music") {
      mediaQueue.unshift(finished);
      this.logger.info(
        { title: finished.title },
        "Loop enabled — replaying finished track",
      );
    }

    await this.playNext();
  }
}
