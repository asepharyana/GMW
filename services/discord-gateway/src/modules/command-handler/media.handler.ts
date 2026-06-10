import { type CommandMessage, type CommandReply } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import { StreamType } from "@discordjs/voice";
import { resolveMediaUrl } from "../voice-recording/mediaSource.js";
import { discordPlayer } from "../voice-recording/player.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CurrentTrack {
  title: string;
  url: string;
  duration?: number;
}

export interface MediaStatusPayload {
  playing: boolean;
  musicVolume: number;
  current: CurrentTrack | null;
  queue: unknown[];
}

// ---------------------------------------------------------------------------
// MediaHandler
// ---------------------------------------------------------------------------

export class MediaHandler {
  private logger = createChildLogger("media-handler");
  private currentTrack: CurrentTrack | null = null;

  getCurrentMediaStatus(): MediaStatusPayload {
    return {
      playing: discordPlayer.getStatus() === "playing",
      musicVolume: discordPlayer.getMusicVolume(),
      current: this.currentTrack,
      queue: [],
    };
  }

  async handleMediaQueue(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    const url = String(cmd.payload.url ?? "").trim();

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
      this.logger.warn(
        "media:queue attempted without an active voice connection",
      );
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Not connected to a voice channel. Connect to voice first.",
      };
    }

    try {
      this.logger.info({ url }, "Resolving media URL");

      const resolution = await resolveMediaUrl(url);

      this.currentTrack = {
        title: resolution.title ?? url,
        url,
        duration: resolution.duration,
      };

      discordPlayer.playStream(resolution.stream, "music", {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
        volume: discordPlayer.getMusicVolume(),
      });

      this.logger.info(
        { url, title: resolution.title },
        "Media queued and playback started",
      );

      return {
        id: cmd.id,
        success: true,
        data: this.getCurrentMediaStatus(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ error: message, url }, "Failed to queue media");
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: message,
      };
    }
  }

  async handleMediaSkip(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    discordPlayer.stop("music");
    this.currentTrack = null;
    return {
      id: cmd.id,
      success: true,
      data: this.getCurrentMediaStatus(),
    };
  }

  async handleMediaStop(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    discordPlayer.stop("music");
    this.currentTrack = null;
    return {
      id: cmd.id,
      success: true,
      data: this.getCurrentMediaStatus(),
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
      data: this.getCurrentMediaStatus(),
    };
  }
}
