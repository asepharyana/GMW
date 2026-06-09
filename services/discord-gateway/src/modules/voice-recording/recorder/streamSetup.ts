import { createChildLogger } from "@bete/shared/logger";
import type { VoiceConnection } from "@discordjs/voice";
import { EndBehaviorType } from "@discordjs/voice";
import { config } from "../../../shared/config/config.js";
import { PacketFilter } from "../packetFilter.js";
import { OpusDecoder } from "./decoder.js";
import { SegmentManager } from "./segment.js";

const logger = createChildLogger("stream-setup");

export interface StreamSetupInput {
  userId: string;
  receiver: VoiceConnection["receiver"];
  userDir: string;
  onPcmData: (pcm: Buffer) => void;
}

export interface StreamSetupResult {
  audioStream: NodeJS.ReadableStream;
  packetFilter: PacketFilter;
  segmentManager: SegmentManager;
  decoder: OpusDecoder;
}

/**
 * Creates the audio stream subscription, decoder, packet filter, and segment
 * manager for a user who started speaking.
 *
 * NOTE: This function does NOT pipe the audio stream through the packet filter.
 * The caller must attach event handlers to `audioStream` BEFORE calling
 * `audioStream.pipe(packetFilter)` to prevent data loss from race conditions.
 */
export function setupUserStream(input: StreamSetupInput): StreamSetupResult {
  const { userId, receiver, userDir, onPcmData } = input;

  logger.debug({ userId }, "Setting up user audio stream");

  // Subscribe to the audio stream from the Discord voice receiver
  const audioStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: config.AUDIO_STREAM_SILENCE_DURATION_MS,
    },
  });

  const packetFilter = new PacketFilter(config.PACKET_FILTER_MIN_SIZE);
  const segmentManager = new SegmentManager(
    userDir,
    config.RECORDING_SEGMENT_MS,
  );

  // Create decoder for web broadcast (PCM downsampling)
  const decoder = new OpusDecoder({
    cooldownMs: config.DECODER_COOLDOWN_MS,
    rotateMs: config.DECODER_ROTATE_MS,
    onData: (pcm: Buffer) => {
      // Downsample 48kHz stereo -> 24kHz mono (left channel, every 2nd frame)
      // Use typed array views for efficient access instead of read/writeInt16LE
      const inputView = new Int16Array(
        pcm.buffer,
        pcm.byteOffset,
        pcm.byteLength / 2,
      );
      const outBuf = Buffer.alloc(inputView.length / 2); // 48k stereo -> 24k mono = 1/4 size
      const outputView = new Int16Array(
        outBuf.buffer,
        outBuf.byteOffset,
        outBuf.byteLength / 2,
      );
      for (let i = 0; i < outputView.length; i++) {
        outputView[i] = inputView[i * 4]; // left channel, every 2nd stereo frame
      }
      onPcmData(outBuf);
    },
  });

  logger.debug({ userId }, "User audio stream setup complete");

  return {
    audioStream,
    packetFilter,
    segmentManager,
    decoder,
  };
}
