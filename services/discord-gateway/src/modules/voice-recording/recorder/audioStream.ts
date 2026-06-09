import { createChildLogger } from "@bete/shared/logger";
import { EndBehaviorType, type VoiceReceiver } from "@discordjs/voice";
import { config } from "../../../shared/config/config.js";

const logger = createChildLogger("audio-stream");

export interface AudioStreamHandlers {
  onPacket: (chunk: Buffer) => void;
  onEnd: () => void;
  onError: (error: Error) => void;
}

export function subscribeToAudioStream(
  receiver: VoiceReceiver,
  userId: string,
  handlers: AudioStreamHandlers,
): NodeJS.ReadableStream {
  logger.debug({ userId }, "Subscribing to audio stream");

  const audioStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: config.AUDIO_STREAM_SILENCE_DURATION_MS,
    },
  });

  audioStream.on("data", handlers.onPacket);
  audioStream.on("end", () => {
    logger.debug({ userId }, "Audio stream ended");
    handlers.onEnd();
  });
  audioStream.on("error", (error: Error) => {
    logger.warn({ userId, error: error.message }, "Audio stream error");
    handlers.onError(error);
  });

  return audioStream;
}
