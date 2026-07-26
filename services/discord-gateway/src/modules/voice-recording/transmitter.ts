import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { BACKEND_VOICE_TRANSMIT } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import { StreamType } from "@discordjs/voice";
import type Redis from "ioredis";
import { discordPlayer } from "./player.js";

const logger = createChildLogger("transmitter");

/**
 * Handles real-time PCM audio transmission from browser to Discord voice channel.
 *
 * Pipeline:
 *   Browser Mic → base64 PCM (24kHz mono s16le) → Redis →
 *   FFmpeg (encode to OggOpus) → discordPlayer (StreamType.OggOpus) → Discord Voice
 */
export class VoiceTransmitter {
  private redisSub: Redis | null = null;
  private pcmStream: PassThrough | null = null;
  private ffmpegProcess: ReturnType<typeof spawn> | null = null;
  private isActive = false;
  private readonly TRANSMIT_CHANNEL = BACKEND_VOICE_TRANSMIT;
  /** Queue for PCM chunks when backpressure is active */
  private backpressureQueue: Buffer[] = [];
  /** Serialise start/stop to prevent races between rapid toggle commands */
  private gate = Promise.resolve();
  /** Set true before sending SIGTERM so exit handler knows it's intentional */
  private _expectedExit = false;

  /**
   * Start listening for PCM audio data from Redis and stream to Discord
   */
  async start(redis: Redis): Promise<void> {
    logger.info("Transmitter start requested");

    // Serialise with stop() so concurrent start+stop don't tear each other down
    const prev = this.gate;
    let release: () => void = () => {};
    this.gate = new Promise<void>((r) => {
      release = r;
    });
    await prev;

    try {
      if (this.isActive) {
        logger.warn("Voice transmitter already active");
        return;
      }

      this.redisSub = redis;
      this.isActive = true;

      // Create PCM input stream
      this.pcmStream = new PassThrough();
      this.pcmStream.setMaxListeners(32); // drain listeners accumulate during backpressure

      // Spawn FFmpeg to encode 24kHz mono PCM → OggOpus
      // Input: 24kHz mono s16le (raw PCM)
      // Output: OGG container with Opus audio
      this.ffmpegProcess = spawn(
        "ffmpeg",
        [
          "-f",
          "s16le", // Input format: signed 16-bit little-endian
          "-ar",
          "24000", // Input sample rate: 24kHz
          "-ac",
          "1", // Input channels: mono
          "-i",
          "pipe:0", // Read from stdin
          "-f",
          "ogg", // Output format: OGG
          "-c:a",
          "libopus", // Codec: Opus
          "-b:a",
          "96k", // Bitrate: 96kbps
          "-ar",
          "48000", // Output sample rate: 48kHz
          "-ac",
          "2", // Output channels: stereo
          "-application",
          "lowdelay", // Low delay mode for real-time
          "-frame_duration",
          "20", // 20ms frames
          "-packet_loss",
          "0", // No packet loss expected
          "pipe:1", // Write to stdout
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      // Pipe PCM data to FFmpeg stdin
      if (this.ffmpegProcess.stdin) {
        this.pcmStream.pipe(this.ffmpegProcess.stdin);
      }

      // Log FFmpeg stderr for debugging
      const stderrChunks: Buffer[] = [];
      this.ffmpegProcess.stderr?.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      this.ffmpegProcess.on("error", (err) => {
        const msg =
          err.message === "spawn ffmpeg ENOENT"
            ? "FFmpeg/avconv not found! Install ffmpeg in the container."
            : err.message;
        logger.error({ error: msg }, "FFmpeg process error");
      });

      this.ffmpegProcess.on("exit", (code) => {
        // SIGTERM from stop() is expected — don't log as error
        if (code !== 0 && !this._expectedExit) {
          const stderr = Buffer.concat(stderrChunks).toString();
          logger.error(
            { code, stderr: stderr.slice(-500) },
            "FFmpeg exited with error",
          );
        } else {
          logger.debug({ code }, "FFmpeg process exited");
        }
      });

      // Play FFmpeg stdout (OggOpus) to Discord
      if (this.ffmpegProcess.stdout) {
        discordPlayer.playStream(this.ffmpegProcess.stdout, "browser-bridge", {
          inputType: StreamType.OggOpus,
          inlineVolume: true,
        });
      }

      logger.info(
        "Voice transmitter pipeline ready (PCM → FFmpeg → OggOpus → Discord)",
      );

      // Subscribe to Redis channel for PCM data
      await this.redisSub.subscribe(this.TRANSMIT_CHANNEL);
      logger.info(
        { channel: this.TRANSMIT_CHANNEL },
        "Subscribed to transmit channel",
      );

      this.redisSub.on("message", (channel, message) => {
        if (channel !== this.TRANSMIT_CHANNEL || !this.pcmStream) return;

        try {
          const data = JSON.parse(message);
          if (data.type === "pcm" && data.buffer) {
            const pcmBuffer = Buffer.from(data.buffer, "base64");
            const stream = this.pcmStream;
            const canContinue = stream.write(pcmBuffer);
            // Backpressure: queue until drain
            if (!canContinue) {
              this.draining = true;
              stream.once("drain", () => {
                this.draining = false;
                // Re-acquire stream reference (could have been replaced by restart)
                const currentStream = this.pcmStream;
                if (!currentStream) return;
                // Flush queued chunks
                while (this.backpressureQueue.length > 0) {
                  const queued = this.backpressureQueue.shift()!;
                  if (!currentStream.write(queued)) break;
                }
              });
            }
          }
        } catch (err) {
          logger.error({ error: err }, "Failed to process PCM data");
        }
      });

      logger.info("Voice transmitter started");
    } finally {
      release?.();
    }
  }

  /**
   * Stop transmitting and clean up resources
   */
  async stop(): Promise<void> {
    logger.info("Transmitter stop requested");

    // Serialise with start() so concurrent start+stop don't tear each other down
    const prev = this.gate;
    let release: () => void = () => {};
    this.gate = new Promise<void>((r) => {
      release = r;
    });
    await prev;

    try {
      if (!this.isActive) {
        logger.debug("Voice transmitter already stopped");
        return;
      }

      this.isActive = false;

      this.backpressureQueue = [];
      this.draining = false;

      if (this.pcmStream) {
        this.pcmStream.removeAllListeners("drain");
        this.pcmStream.end();
        this.pcmStream = null;
      }

      // Flag FFmpeg exit as expected so the exit handler doesn't log it as error
      this._expectedExit = true;
      if (this.ffmpegProcess) {
        this.ffmpegProcess.kill("SIGTERM");
        this.ffmpegProcess = null;
      }

      if (this.redisSub) {
        await this.redisSub.unsubscribe(this.TRANSMIT_CHANNEL);
        this.redisSub.quit().catch(() => {});
        this.redisSub = null;
      }

      discordPlayer.stop("browser-bridge");
      logger.info("Voice transmitter stopped");
    } finally {
      release?.();
    }
  }

  /**
   * Check if transmitter is currently active
   */
  getStatus(): { active: boolean; channel: string } {
    return {
      active: this.isActive,
      channel: this.TRANSMIT_CHANNEL,
    };
  }
}

export const voiceTransmitter = new VoiceTransmitter();
