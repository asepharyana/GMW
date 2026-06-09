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
      // Downsample 48kHz stereo -> 24kHz mono (left channel, every 2nd sample)
      const outBuf = Buffer.alloc(pcm.length / 4);
      for (let i = 0; i < outBuf.length / 2; i++) {
        outBuf.writeInt16LE(pcm.readInt16LE(i * 8), i * 2);
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
