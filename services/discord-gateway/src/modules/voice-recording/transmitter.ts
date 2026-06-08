import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
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
  private readonly TRANSMIT_CHANNEL = "backend:voice:transmit";

  /**
   * Start listening for PCM audio data from Redis and stream to Discord
   */
  async start(redis: Redis): Promise<void> {
    if (this.isActive) {
      logger.warn("Voice transmitter already active");
      return;
    }

    this.redisSub = redis;
    this.isActive = true;

    // Create PCM input stream
    this.pcmStream = new PassThrough();

    // Spawn FFmpeg to encode 24kHz mono PCM → OggOpus
    // Input: 24kHz mono s16le (raw PCM)
    // Output: OGG container with Opus audio
    this.ffmpegProcess = spawn("ffmpeg", [
      "-f", "s16le",           // Input format: signed 16-bit little-endian
      "-ar", "24000",          // Input sample rate: 24kHz
      "-ac", "1",              // Input channels: mono
      "-i", "pipe:0",          // Read from stdin
      "-f", "ogg",             // Output format: OGG
      "-c:a", "libopus",       // Codec: Opus
      "-b:a", "96k",           // Bitrate: 96kbps
      "-ar", "48000",          // Output sample rate: 48kHz
      "-ac", "2",              // Output channels: stereo
      "-application", "lowdelay", // Low delay mode for real-time
      "-frame_duration", "20", // 20ms frames
      "-packet_loss", "0",     // No packet loss expected
      "pipe:1",                // Write to stdout
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

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
      logger.error({ error: err.message }, "FFmpeg process error");
    });

    this.ffmpegProcess.on("exit", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString();
        logger.error({ code, stderr: stderr.slice(-500) }, "FFmpeg exited with error");
      }
    });

    // Play FFmpeg stdout (OggOpus) to Discord
    if (this.ffmpegProcess.stdout) {
      discordPlayer.playStream(this.ffmpegProcess.stdout, "browser-bridge", {
        inputType: StreamType.OggOpus,
        inlineVolume: true,
      });
    }

    logger.info("Voice transmitter pipeline ready (PCM → FFmpeg → OggOpus → Discord)");

    // Subscribe to Redis channel for PCM data
    await this.redisSub.subscribe(this.TRANSMIT_CHANNEL);
    logger.info({ channel: this.TRANSMIT_CHANNEL }, "Subscribed to transmit channel");

    this.redisSub.on("message", (channel, message) => {
      if (channel !== this.TRANSMIT_CHANNEL || !this.pcmStream) return;

      try {
        const data = JSON.parse(message);
        if (data.type === "pcm" && data.buffer) {
          const pcmBuffer = Buffer.from(data.buffer, "base64");
          logger.debug({ bytes: pcmBuffer.length }, "Received PCM chunk");
          this.pcmStream.write(pcmBuffer);
        }
      } catch (err) {
        logger.error({ error: err }, "Failed to process PCM data");
      }
    });

    logger.info("Voice transmitter started");
  }

  /**
   * Stop transmitting and clean up resources
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.pcmStream) {
      this.pcmStream.end();
      this.pcmStream = null;
    }

    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill("SIGTERM");
      this.ffmpegProcess = null;
    }

    if (this.redisSub) {
      await this.redisSub.unsubscribe(this.TRANSMIT_CHANNEL);
      this.redisSub = null;
    }

    discordPlayer.stop("browser-bridge");
    logger.info("Voice transmitter stopped");
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
