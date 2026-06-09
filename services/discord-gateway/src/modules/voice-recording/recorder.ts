import { promises as fsPromises } from "node:fs";
import { createChildLogger } from "@bete/shared/logger";
import { retryWithBackoff } from "@bete/shared/utils";
import {
  type DiscordGatewayAdapterCreator,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  type VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Client, VoiceChannel } from "discord.js-selfbot-v13";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js";
import {
  createRecordingSession,
  finalizeRecordingSession,
  type RecordingSession,
} from "./recorder/sessionRecording.js";
import { createSpeakingHandler } from "./recorder/speakingHandler.js";

const logger = createChildLogger("recorder");

let _eventBroadcaster: EventBroadcaster | undefined;

/** @internal Export for uploader.ts to broadcast voice_recording_uploaded events */
export { _eventBroadcaster };

export function setEventBroadcaster(broadcaster: EventBroadcaster | undefined) {
  _eventBroadcaster = broadcaster;
}

const recordingsDir = config.RECORDINGS_DIR;

// Ensure recordings directory exists
(async () => {
  try {
    await fsPromises.mkdir(recordingsDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, that's fine
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      logger.error({ error }, "Failed to create recordings directory");
    }
  }
})();

const activeSessions = new Map<string, RecordingSession>();

export function resetActiveSessions(): void {
  activeSessions.clear();
}

function finalizeActiveRecordingSession(guildId: string): void {
  const session = activeSessions.get(guildId);
  if (!session) return;
  activeSessions.delete(guildId);
  finalizeRecordingSession(session).catch((error: unknown) => {
    logger.error({ error }, "Failed to finalize recording session");
  });
}

/**
 * Join ke voice channel dan mulai merekam semua user yang bicara.
 */
export async function startRecording(
  client: Client,
  channel: VoiceChannel,
): Promise<VoiceConnection | null> {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild
      .voiceAdapterCreator as DiscordGatewayAdapterCreator,
    selfDeaf: false,
    selfMute: false,
    debug: true,
  });

  logger.info({ channelName: channel.name }, "Joining voice channel");

  connection.on("debug", (msg) => {
    if (config.VERBOSE) {
      logger.debug({ message: msg }, "Voice debug");
    }
  });

  connection.on("error", (err) => {
    logger.error({ error: err }, "Voice connection error");
  });

  // Wait until fully connected with retry logic
  try {
    await retryWithBackoff(
      () =>
        entersState(
          connection,
          VoiceConnectionStatus.Ready,
          config.VOICE_CONNECTION_TIMEOUT_MS,
        ),
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
      },
    );
    logger.info("Connected to voice channel. Recording started");

    // Create recording session after connection is ready
    const sessionStartTime = Date.now();
    const session = createRecordingSession({
      guildId: channel.guild.id,
      channelId: channel.id,
      channelName: channel.name,
      startTime: sessionStartTime,
      recordingsDir,
    });
    activeSessions.set(channel.guild.id, session);
  } catch (err) {
    logger.error({ error: err }, "Failed to connect to voice channel");
    connection.destroy();
    return null;
  }

  const receiver = connection.receiver;

  // Use the extracted speaking handler for voice activity
  const speakingHandler = createSpeakingHandler({
    client,
    channel,
    receiver,
    eventBroadcaster: _eventBroadcaster,
    activeSessions,
    recordingsDir,
  });

  receiver.speaking.on("start", speakingHandler);

  // Handle unexpected disconnection
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    if (config.VERBOSE) {
      logger.warn("Disconnected from voice channel. Reconnecting...");
    }
    try {
      await Promise.race([
        entersState(
          connection,
          VoiceConnectionStatus.Signalling,
          config.RECONNECT_TIMEOUT_MS,
        ),
        entersState(
          connection,
          VoiceConnectionStatus.Connecting,
          config.RECONNECT_TIMEOUT_MS,
        ),
      ]);
      // Reconnected successfully
    } catch {
      logger.error("Could not reconnect. Destroying connection");
      connection.destroy();
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    finalizeActiveRecordingSession(channel.guild.id);
    if (config.VERBOSE) {
      logger.info("Voice connection destroyed");
    }
  });

  return connection;
}

/**
 * Stop recording and disconnect from voice channel.
 */
export function stopRecording(guildId: string): void {
  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    if (config.VERBOSE) {
      logger.info("Recording stopped and disconnected");
    }
  } else {
    logger.warn("No active connection to stop");
  }

  finalizeActiveRecordingSession(guildId);
}
