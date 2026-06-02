import fs from "node:fs";
import path from "node:path";
import {
  type DiscordGatewayAdapterCreator,
  EndBehaviorType,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  type VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Client, VoiceChannel } from "discord.js-selfbot-v13";
import { config } from "../../shared/config/config.js";
import { createChildLogger } from "../../shared/logger/logger.js";
import { PacketFilter } from "./packetFilter.js";
import { subscribeToAudioStream } from "./recorder/audioStream.js";
import { OpusDecoder } from "./recorder/decoder.js";
import {
  collectUserMetadata,
  createSegmentMetadata,
} from "./recorder/metadata.js";
import { SegmentManager } from "./recorder/segment.js";
import {
  createRecordingSession,
  finalizeRecordingSession,
  type RecordingSession,
} from "./recorder/sessionRecording.js";
import { uploadRecordingSegment } from "./recorder/uploader.js";
import { retryWithBackoff } from "../../shared/utils/retry.js";
import type { PcmBroadcaster } from "../message-capture/types.js";

const logger = createChildLogger("recorder");

const recordingsDir = config.RECORDINGS_DIR;

// Pastikan folder recordings ada
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

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

  // Tunggu sampai benar-benar terhubung dengan retry logic
  try {
    await retryWithBackoff(
      () =>
        entersState(
          connection,
          VoiceConnectionStatus.Ready,
          config.VOICE_CONNECTION_TIMEOUT_MS,
        ),
      {
        retries: 0,
        minTimeout: 0,
        maxTimeout: 0,
        logger,
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
  const broadcaster = globalThis as typeof globalThis & PcmBroadcaster;

  // Dengarkan siapapun yang mulai bicara
  receiver.speaking.on("start", async (userId) => {
    if (userId === client.user?.id) return;

    const userMetadata = await collectUserMetadata(client, userId, channel);
    if (userMetadata.bot) return;

    logger.debug(
      { userId, username: userMetadata.username },
      "Voice activity detected",
    );

    // Notify webserver
    broadcaster.updateActiveUser?.(userId, {
      username: userMetadata.username,
      avatar: userMetadata.avatarUrl,
      speaking: true,
    });

    // Jangan record kalau sudah ada stream aktif untuk user ini
    if (receiver.subscriptions.has(userId)) return;

    const userDir = path.join(recordingsDir, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    try {
      // --- OGG file recording with segment rotation ---
      const packetFilterForOgg = new PacketFilter(
        config.PACKET_FILTER_MIN_SIZE,
      );
      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: config.AUDIO_STREAM_SILENCE_DURATION_MS,
        },
      });
      const oggPacketStream = audioStream.pipe(packetFilterForOgg);
      const segmentManager = new SegmentManager(
        userDir,
        config.RECORDING_SEGMENT_MS,
      );

      // --- Web broadcast: prism decoder with safe restart and cooldown ---
      const decoder = new OpusDecoder({
        cooldownMs: config.DECODER_COOLDOWN_MS,
        rotateMs: config.DECODER_ROTATE_MS,
        onData: (pcm) => {
          if (!broadcaster.broadcastPcmToWeb) return;
          // Downsample 48kHz stereo → 24kHz mono (left channel, every 2nd sample)
          const outBuf = Buffer.alloc(pcm.length / 4);
          for (let i = 0; i < outBuf.length / 2; i++) {
            outBuf.writeInt16LE(pcm.readInt16LE(i * 8), i * 2);
          }
          broadcaster.broadcastPcmToWeb(outBuf, userId);
        },
      });

      const activeSession = activeSessions.get(channel.guild.id);
      let currentSegment = segmentManager.open(oggPacketStream);
      currentSegment.out.on("finish", () => {
        if (config.VERBOSE) {
          logger.info({ filename: currentSegment.filename }, "Segment saved");
        }
        const endTime = currentSegment.endTime ?? Date.now();
        if (activeSession) {
          activeSession.registerSegment({
            user: userMetadata,
            oggPath: currentSegment.filename,
            jsonPath: currentSegment.jsonFilename,
            startTime: currentSegment.startTime,
            endTime,
          });
        }
        const metadata = createSegmentMetadata(
          userMetadata,
          currentSegment,
          activeSession?.sessionId ?? `${userId}-0`,
          activeSession?.sessionId ?? `${channel.guild.id}-${channel.id}-0`,
          activeSession?.startTime ?? 0,
          config.RECORDING_SEGMENT_MS,
        );
        fs.writeFileSync(
          currentSegment.jsonFilename,
          JSON.stringify(metadata, null, 2),
        );
        if (config.VERBOSE) {
          logger.info(
            { jsonFile: currentSegment.jsonFilename },
            "Metadata saved",
          );
        }

        // Trigger async voice segment upload
        const segmentId = `${userId}-${currentSegment.startTime}`;
        uploadRecordingSegment({
          id: segmentId,
          oggPath: currentSegment.filename,
          userId: userMetadata.userId,
          username: userMetadata.username,
          avatarUrl: userMetadata.avatarUrl,
          guildId: channel.guild.id,
          channelId: channel.id,
          channelName: channel.name,
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(
            { segmentId, error: msg },
            "Upload segment trigger failed",
          );
        });
      });

      currentSegment.out.on("error", (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ userId, error: msg }, "File write error");
      });

      // Feed Opus packets one-by-one
      subscribeToAudioStream(receiver, userId, {
        onPacket: (chunk) => {
          if (chunk.length < 8) return;
          segmentManager.rotateIfNeeded(oggPacketStream);
          if (!broadcaster.broadcastPcmToWeb) return;
          decoder.rotateIfNeeded();
          decoder.write(chunk);
        },
        onEnd: () => {
          segmentManager.close(oggPacketStream);
          decoder.destroy();
          broadcaster.updateActiveUser?.(userId, {
            username: userMetadata.username,
            avatar: userMetadata.avatarUrl,
            speaking: false,
          });
        },
        onError: (error) => {
          segmentManager.close(oggPacketStream);
          decoder.destroy();
          logger.error({ userId, error: error.message }, "Audio stream error");
        },
      });

      packetFilterForOgg.on("error", (err) => {
        segmentManager.close(oggPacketStream);
        logger.error({ userId, error: err.message }, "PacketFilter error");
      });
    } catch (e) {
      logger.error(
        { userId, error: e instanceof Error ? e.message : String(e) },
        "Failed to create stream",
      );
    }
  });

  // Handle disconnect yang tidak disengaja
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
      // Berhasil reconnect
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
 * Hentikan recording dan disconnect dari voice channel.
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
