import { createRequire } from "node:module";
import * as prism from "prism-media";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../../shared/config/config.js";

const require = createRequire(import.meta.url);
const logger = createChildLogger("opus-decoder");

interface OpusDecoderRuntime {
  isBun: boolean;
  canLoadNativeOpus: boolean;
}

export function shouldEnableDefaultOpusDecoder(
  runtime: OpusDecoderRuntime,
): boolean {
  return !runtime.isBun || runtime.canLoadNativeOpus;
}

function canLoadNativeOpus(): boolean {
  try {
    require("@discordjs/opus");
    return true;
  } catch {
    return false;
  }
}

const defaultDecoderEnabled = shouldEnableDefaultOpusDecoder({
  isBun: Boolean(process.versions.bun),
  canLoadNativeOpus: canLoadNativeOpus(),
});

export interface OpusDecoderOptions {
  cooldownMs: number;
  rotateMs: number;
  createDecoder?: () => prism.opus.Decoder;
  onData: (pcm: Buffer) => void;
}

export class OpusDecoder {
  private decoder: prism.opus.Decoder | null = null;
  private disabledUntil = 0;
  private createdAt = 0;
  private readonly cooldownMs: number;
  private readonly rotateMs: number;
  private readonly createDecoderFn: () => prism.opus.Decoder;
  private readonly onData: (pcm: Buffer) => void;

  constructor(options: OpusDecoderOptions) {
    this.cooldownMs = options.cooldownMs;
    this.rotateMs = options.rotateMs;
    this.onData = options.onData;
    this.createDecoderFn =
      options.createDecoder ??
      (() => {
        if (!defaultDecoderEnabled) {
          throw new Error(
            "Native @discordjs/opus is unavailable under Bun; web PCM decode disabled to avoid opusscript aborts",
          );
        }

        return new prism.opus.Decoder({
          frameSize: config.OPUS_FRAME_SIZE,
          channels: config.AUDIO_CHANNELS as 1 | 2,
          rate: config.AUDIO_SAMPLE_RATE as
            | 8000
            | 12000
            | 16000
            | 24000
            | 48000,
        });
      });
  }

  rotateIfNeeded(): void {
    if (!this.decoder || this.rotateMs <= 0) return;
    if (Date.now() - this.createdAt < this.rotateMs) return;
    this.destroy();
    this.ensureDecoder();
  }

  write(chunk: Buffer): void {
    const decoder = this.ensureDecoder();
    if (!decoder) return;
    try {
      decoder.write(chunk);
    } catch (error) {
      logger.warn({ error }, "Opus decoder write failed, cooling down");
      this.coolDown();
    }
  }

  destroy(): void {
    if (!this.decoder) return;
    this.decoder.removeAllListeners();
    this.decoder.destroy();
    this.decoder = null;
    this.createdAt = 0;
  }

  private ensureDecoder(): prism.opus.Decoder | null {
    if (this.decoder) return this.decoder;
    if (Date.now() < this.disabledUntil) return null;
    try {
      const decoder = this.createDecoderFn();
      decoder.on("data", this.onData);
      decoder.on("error", (error) => {
        logger.warn({ error }, "Opus decoder error, cooling down");
        this.coolDown();
      });
      this.decoder = decoder;
      this.createdAt = Date.now();
      return decoder;
    } catch (error) {
      logger.warn({ error }, "Opus decoder init failed, cooling down");
      this.disabledUntil = Date.now() + this.cooldownMs;
      return null;
    }
  }

  private coolDown(): void {
    this.disabledUntil = Date.now() + this.cooldownMs;
    this.destroy();
  }
}
