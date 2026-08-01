import {
  Encoders,
  prepareStream,
  playStream,
  Streamer,
  Utils,
} from "@dank074/discord-video-stream";
import type { Client } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import type { ScreenSharePlayback } from "./mediaTypes.js";
import { getDirectVideoUrl } from "./mediaSource.js";
import { discordPlayer } from "./player.js";

const logger = createChildLogger("screen-share");

export interface ScreenShareVoiceStatus {
  connected: boolean;
  activeGuildId: string | null;
  activeChannelId: string | null;
}

/**
 * Discord Go Live (screenshare) via @dank074/discord-video-stream.
 *
 * Pipeline:
 *   URL (YouTube, dll.) → yt-dlp direct video URL → ffmpeg (H264 720p30) →
 *   playStream({ type: "go-live" }) → Discord voice channel as Go Live.
 *
 * Restored from the pre-microservices implementation (commit d50ce86,
 * src/media/screenShareController.ts) — the interface survived in
 * mediaTypes.ts but the implementation was lost during the split.
 */
export class ScreenShareController {
  private logger = createChildLogger("screen-share");
  private streamer: Streamer | null = null;
  private active: ScreenSharePlayback | null = null;

  constructor(
    private readonly client: Client,
    private readonly getVoiceStatus: () => ScreenShareVoiceStatus,
  ) {}

  isActive(): boolean {
    return this.active !== null;
  }

  async start(source: string): Promise<ScreenSharePlayback> {
    const status = this.getVoiceStatus();
    if (
      !status.connected ||
      !status.activeGuildId ||
      !status.activeChannelId
    ) {
      throw new Error("Connect to a voice channel before sharing screen");
    }

    if (this.active || discordPlayer.getOwner() !== "none") {
      throw new Error("Another media mode is active");
    }

    try {
      const directUrl = await getDirectVideoUrl(source);
      if (!this.streamer) {
        this.streamer = new Streamer(this.client);
      }

      const { command, output } = prepareStream(directUrl, {
        encoder: Encoders.software({ x264: { preset: "superfast" } }),
        width: 1280,
        height: 720,
        frameRate: 30,
        bitrateVideo: 2500,
        bitrateVideoMax: 4000,
        includeAudio: true,
        videoCodec: Utils.normalizeVideoCodec("H264"),
      });

      let stopped = false;
      const done = playStream(output, this.streamer, {
        type: "go-live",
      }).finally(() => {
        this.active = null;
      });

      const controller = this;
      this.active = {
        done,
        stop: () => {
          if (stopped) return;
          stopped = true;
          command.kill("SIGTERM");
          controller.active = null;
        },
      };

      logger.info({ source }, "Screen share started");
      return this.active;
    } catch (error) {
      this.active = null;
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, source }, "Screen stream failed");
      throw error;
    }
  }
}
