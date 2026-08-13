import { rmSync } from "node:fs";
import { dirname } from "node:path";
import type { Client } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import {
  Encoders,
  normalizeVideoCodec,
  playStream,
  prepareStream,
  Streamer,
} from "../../goLive/index.js";
import {
  downloadScreenInput,
  INVIDIOUS_INSTANCES,
  isYoutubeWatchUrl,
  toInvidiousUrl,
} from "./mediaSource.js";
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

  /**
   * Resolve the screen-share input with retry (downloads the FULL media to a
   * temp file; returns the file path).
   *
   * Transient YouTube 403s kill a download BEFORE completion; we validate
   * the finished file and retry with a FRESH yt-dlp run (signed DASH URLs
   * expire quickly). Downloading to a file (instead of streaming the merge
   * pipe) gives the encoder a monotonic-PTS input, so ffmpeg `-re` pacing
   * in prepareStream actually works (it does NOT on live pipes — the root
   * of the ~1fps video).
   */
  private async resolveInputWithRetry(source: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    let lastError: Error | null = null;

    // YouTube may 403 even with account cookies (IP-bound session / bot check
    // on VPS IP). When the source is a YouTube URL and cookies fail, fall back
    // to anon Invidious mirror instances — no auth needed.
    const isYt = isYoutubeWatchUrl(source);
    let invidiousIdx = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // On a 403 against YouTube, try the next Invidious instance for this attempt.
      if (
        isYt &&
        lastError &&
        /403|bot|Sign in|not a bot|access denied|permission|EACCES|cookie/i.test(
          lastError.message,
        ) &&
        invidiousIdx < INVIDIOUS_INSTANCES.length
      ) {
        const inst = INVIDIOUS_INSTANCES[invidiousIdx];
        this.logger.warn(
          { attempt, instance: inst, error: lastError.message },
          "YouTube blocked (403); falling back to Invidious mirror",
        );
        source = toInvidiousUrl(source, inst);
        invidiousIdx++;
      }

      try {
        const mediaPath = await downloadScreenInput(source);
        this.logger.info(
          { mediaPath, attempt },
          "Screen input downloaded to file",
        );
        return mediaPath;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          {
            attempt,
            maxAttempts: MAX_ATTEMPTS,
            error: lastError.message,
          },
          "Screen input download failed; retrying with fresh yt-dlp",
        );
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }

    throw (
      lastError ??
      new Error("Screen input resolution failed after multiple attempts")
    );
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
      const input = await this.resolveInputWithRetry(source);
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

      const prepared = prepareStream(input, {
        encoder: Encoders.software({ x264: { preset: "superfast" } }),
        width: 1280,
        height: 720,
        frameRate: 30,
        bitrateVideo: 2500,
        bitrateVideoMax: 4000,
        // GoLive with audio: the encoder muxes to NUT (video h264 + opus
        // audio) so the audio SSRC carries RTP too. Discord's GoLive
        // pipeline expects audio — a video-only stream shows a static
        // tile/thumbnail instead of live video. When the source has no
        // audio track, the encoder's `-map 0:a:0?` yields no audio stream
        // and the demuxer simply reports none (video still flows).
        includeAudio: true,
        videoCodec: normalizeVideoCodec("H264"),
      });
      const { command } = prepared;

      // The downloaded temp media lives in a per-run tmpdir; remove it once
      // playback is done (natural end, failure, or user stop). The tmpdir is
      // the parent of the media file, so deleting it removes the file too.
      const cleanupTempMedia = () => {
        try {
          if (typeof input === "string") {
            rmSync(dirname(input), { recursive: true, force: true });
          }
        } catch {
          /* best-effort — tmp dirs are world-writable, leak is bounded */
        }
      };

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
        cleanupTempMedia();
        try {
          this.streamer?.voiceConnection?.stop();
        } catch {
          /* already gone */
        }
        if (this.restoreVoice) {
          // Best-effort restore after a short delay. Discord often needs the
          // Streamer's session fully torn down before @discordjs/voice can
          // re-join; if that races, the reconnect times out — the FE shows
          // disconnected and the user just clicks Connect again. This is an
          // accepted UX tradeoff for GoLive (single voice session per user).
          setTimeout(() => {
            Promise.resolve(this.restoreVoice(status)).catch((err) => {
              this.logger.warn(
                { error: err instanceof Error ? err.message : String(err) },
                "Failed to restore voice connection after screen share (user can reconnect manually)",
              );
            });
          }, 5000);
        }
      };
      const done = playStream(prepared, this.streamer, {
        type: "go-live",
        width: 1280,
        height: 720,
        frameRate: 30,
      })
        .catch((err: unknown) => {
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
          cleanupTempMedia();
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
