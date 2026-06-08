import { PassThrough, Readable } from "node:stream";
import { createChildLogger } from "@bete/shared/logger";
import { StreamType } from "@discordjs/voice";
import type Redis from "ioredis";
import prism from "prism-media";
import { discordPlayer } from "./player.js";

const logger = createChildLogger("transmitter");

/**
 * Handles real-time PCM audio transmission from backend/browser to Discord.
 * Receives 24kHz mono PCM data, upsamples to 48kHz stereo, encodes to Opus, and plays to Discord.
 */
export class VoiceTransmitter {
  private redisSub: Redis | null = null;
  private pcmStream: PassThrough | null = null;
  private opusEncoder: any | null = null;
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

    // Upsample 24kHz mono → 48kHz stereo
    const upsampledStream = this.upsampleTo48kStereo(this.pcmStream);

    // Encode to Opus and wrap in OGG container
    this.opusEncoder = new prism.opus.Encoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
    });

    const oggDemuxer = new prism.opus.OggDemuxer();
    const opusStream = upsampledStream
      .pipe(this.opusEncoder)
      .pipe(oggDemuxer);

    // Play to Discord with Opus format (raw Opus packets)
    discordPlayer.playStream(opusStream, "browser-bridge", {
      inputType: StreamType.Opus,
      inlineVolume: true,
    });

    // Subscribe to Redis channel for PCM data
    await this.redisSub.subscribe(this.TRANSMIT_CHANNEL);

    this.redisSub.on("message", (channel, message) => {
      if (channel !== this.TRANSMIT_CHANNEL || !this.pcmStream) return;

      try {
        const data = JSON.parse(message);
        if (data.type === "pcm" && data.buffer) {
          const pcmBuffer = Buffer.from(data.buffer, "base64");
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

    if (this.opusEncoder) {
      this.opusEncoder.destroy();
      this.opusEncoder = null;
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

  /**
   * Upsample 24kHz mono PCM to 48kHz stereo
   * Input: 24kHz mono s16le (2 bytes per sample)
   * Output: 48kHz stereo s16le (4 bytes per sample)
   */
  private upsampleTo48kStereo(input: Readable): Readable {
    const output = new PassThrough();

    input.on("data", (chunk: Buffer) => {
      // 24kHz mono → 48kHz stereo means we need to:
      // 1. Duplicate each sample (mono → stereo)
      // 2. Interpolate samples (24kHz → 48kHz)

      const inputSamples = chunk.length / 2; // 16-bit samples
      const outputBuffer = Buffer.alloc(inputSamples * 4 * 2); // 2x rate, 2x channels

      for (let i = 0; i < inputSamples; i++) {
        const sample = chunk.readInt16LE(i * 2);

        // Write to output at 2x rate with simple duplication
        // Sample i → output[i*2] and output[i*2+1]
        const outIdx = i * 2;

        // Left channel
        outputBuffer.writeInt16LE(sample, outIdx * 4);
        // Right channel
        outputBuffer.writeInt16LE(sample, outIdx * 4 + 2);

        // Interpolated sample (simple average for smoothing)
        if (i < inputSamples - 1) {
          const nextSample = chunk.readInt16LE((i + 1) * 2);
          const interpolated = Math.floor((sample + nextSample) / 2);

          // Left channel
          outputBuffer.writeInt16LE(interpolated, (outIdx + 1) * 4);
          // Right channel
          outputBuffer.writeInt16LE(interpolated, (outIdx + 1) * 4 + 2);
        }
      }

      output.write(outputBuffer);
    });

    input.on("end", () => {
      output.end();
    });

    input.on("error", (err) => {
      logger.error({ error: err }, "Upsample input stream error");
      output.destroy(err);
    });

    return output;
  }
}

export const voiceTransmitter = new VoiceTransmitter();
