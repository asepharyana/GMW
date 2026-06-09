import { type CommandMessage, type CommandReply } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import { discordPlayer } from "../voice-recording/player.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaStatusPayload {
  playing: boolean;
  musicVolume: number;
  current: unknown;
  queue: unknown[];
}

// ---------------------------------------------------------------------------
// MediaHandler
// ---------------------------------------------------------------------------

export class MediaHandler {
  private logger = createChildLogger("media-handler");

  getCurrentMediaStatus(): MediaStatusPayload {
    return {
      playing: discordPlayer.getStatus() === "playing",
      musicVolume: discordPlayer.getMusicVolume(),
      current: null,
      queue: [],
    };
  }

  async handleMediaQueue(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    this.logger.info(
      "media:queue received — media queueing is handled externally",
    );
    return {
      id: cmd.id,
      success: true,
      data: this.getCurrentMediaStatus(),
    };
  }

  async handleMediaSkip(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    discordPlayer.stop("music");
    return {
      id: cmd.id,
      success: true,
      data: this.getCurrentMediaStatus(),
    };
  }

  async handleMediaStop(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    discordPlayer.stop("music");
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
