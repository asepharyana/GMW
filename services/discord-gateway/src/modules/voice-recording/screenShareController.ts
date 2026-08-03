import {
  Encoders,
  playStream,
  prepareStream,
  Streamer,
  Utils,
} from "@dank074/discord-video-stream";
import type { Client } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import { getDirectVideoUrl } from "./mediaSource.js";
import type { ScreenSharePlayback } from "./mediaTypes.js";
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
    /** Disconnect the @discordjs/voice connection so the Streamer can take
     *  over the voice channel (Discord allows only ONE voice session per user
     *  — two connections collide and the Streamer never gets VOICE_SERVER_UPDATE). */
    private readonly releaseVoice: (
      status: ScreenShareVoiceStatus,
    ) => void | Promise<void>,
    /** Reconnect the @discordjs/voice connection after the stream ends. */
    private readonly restoreVoice: (
      status: ScreenShareVoiceStatus,
    ) => void | Promise<void>,
  ) {}

  isActive(): boolean {
    return this.active !== null;
  }

  async start(source: string): Promise<ScreenSharePlayback> {
    const status = this.getVoiceStatus();
    if (!status.connected || !status.activeGuildId || !status.activeChannelId) {
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

      const guild = this.client.guilds.cache.get(status.activeGuildId);
      const channel = guild?.channels.cache.get(status.activeChannelId);
      if (
        !channel ||
        (channel.type !== "GUILD_VOICE" && channel.type !== "GUILD_STAGE_VOICE")
      ) {
        throw new Error(
          `Voice channel ${status.activeChannelId} not found for screen share`,
        );
      }

      // Free the @discordjs/voice connection BEFORE the Streamer joins, so
      // the user has only one voice session (Discord requirement).
      await this.releaseVoice(status);

      await Promise.race([
        this.streamer.joinVoiceChannel(channel),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error("Timed out joining voice channel for screen share"),
              ),
            15000,
          ),
        ),
      ]);

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
      // Restore the @discordjs/voice connection after the stream ends (both
      // natural end and failure), so the user can keep using audio/mic.
      const restoreAfter = () => {
        if (!stopped) {
          stopped = true;
          try {
            command.kill("SIGTERM");
          } catch {
            /* already dead */
          }
        }
        try {
          this.streamer?.voiceConnection?.stop();
        } catch {
          /* already gone */
        }
        if (this.restoreVoice) {
          Promise.resolve(this.restoreVoice(status)).catch((err) => {
            this.logger.warn(
              { error: err instanceof Error ? err.message : String(err) },
              "Failed to restore voice connection after screen share",
            );
          });
        }
      };
      const done = playStream(output, this.streamer, {
        type: "go-live",
      })
        .catch((err) => {
          // Never let a stream failure become an unhandledRejection — that
          // crashed the whole gateway. Log + surface via the done promise.
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            { error: message, source },
            "Screen stream failed during playback",
          );
        })
        .finally(() => {
          restoreAfter();
          this.active = null;
        });
      this.active = {
        done,
        stop: () => {
          if (stopped) return;
          stopped = true;
          try {
            command.kill("SIGTERM");
          } catch {
            /* already dead */
          }
          // Leave the voice channel the Streamer joined (its own connection).
          try {
            this.streamer?.voiceConnection?.stop();
          } catch {
            /* already gone */
          }
          this.active = null;
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
