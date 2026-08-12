import { PassThrough, type Readable } from "node:stream";
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
  getDirectScreenInput,
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
   * Resolve the screen-share input with retry + first-byte validation.
   *
   * Transient YouTube 403s kill the merge ffmpeg BEFORE it produces any
   * output; without validation the stream would "start" with a dead input
   * and show a black tile forever. So after getDirectScreenInput resolves we
   * tee the stream through a PassThrough and wait for the FIRST readable
   * byte (or an error / early EOF). On failure the whole resolution is
   * retried with a FRESH yt-dlp run (signed DASH URLs expire quickly — the
   * old URLs cannot simply be re-fetched).
   */
  private async resolveInputWithRetry(source: string): Promise<Readable> {
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
        /403|bot|Sign in|not a bot|access denied/i.test(lastError.message) &&
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
        const input = await getDirectScreenInput(source);

        const tee = new PassThrough();
        input.on("error", (err) => tee.destroy(err));
        input.on("end", () => tee.end());
        input.pipe(tee);
        // If the merge process is stuck (no data, no exit) destroy the raw
        // stream too so ffmpeg gets EPIPE on its next write and dies —
        // otherwise every failed attempt leaks a merge process.
        const destroyInput = () => {
          try {
            input.destroy();
          } catch {
            /* already gone */
          }
        };

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            cleanup();
            destroyInput();
            // Listeners were just removed by cleanup() — destroying tee WITH
            // an error would emit "error" on an unlistened PassThrough and
            // surface as an unhandled 'error' event (crash). Destroy
            // silently; the error lives in the rejection only.
            tee.destroy();
            reject(
              new Error(
                "Screen input produced no data within 12s — merge likely failed",
              ),
            );
          }, 12000);
          const onReadable = () => {
            if (tee.readableLength > 0) {
              cleanup();
              resolve();
            }
            // readableLength === 0 can mean "EOF reached" — handled by onEnd.
          };
          const onError = (err: Error) => {
            cleanup();
            reject(err);
          };
          const onEnd = () => {
            cleanup();
            destroyInput();
            reject(new Error("Screen input ended before producing any data"));
          };
          const cleanup = () => {
            clearTimeout(timer);
            tee.removeListener("readable", onReadable);
            tee.removeListener("error", onError);
            tee.removeListener("end", onEnd);
          };
          tee.once("readable", onReadable);
          tee.once("error", onError);
          tee.once("end", onEnd);
        });

        // Safety net: cleanup() removes the once() listeners on timeout/error,
        // but a late error event from input.pipe(tee) can still fire on an
        // unlistened PassThrough and crash the gateway (unhandled 'error').
        // A permanent no-op listener guarantees the event is always swallowed.
        tee.on("error", () => {});
        // Pass the tee onward — the encoder consumes the same buffered
        // stream, so no data from the merge is lost.
        return tee;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          {
            attempt,
            maxAttempts: MAX_ATTEMPTS,
            error: lastError.message,
          },
          "Screen input resolution failed; retrying with fresh yt-dlp",
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
