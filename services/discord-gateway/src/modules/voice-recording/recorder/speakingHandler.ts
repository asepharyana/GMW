import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { createChildLogger } from "@bete/shared/logger";
import type { VoiceConnection } from "@discordjs/voice";
import type { Client, VoiceChannel } from "discord.js-selfbot-v13";
import type { EventBroadcaster } from "../../event-broadcaster/eventBroadcaster.js";
import { collectUserMetadata } from "./metadata.js";
import { finalizeSegment } from "./segmentFinalizer.js";
import type { RecordingSession } from "./sessionRecording.js";
import { setupUserStream } from "./streamSetup.js";

const logger = createChildLogger("speaking-handler");

export interface SpeakingHandlerContext {
  client: Client;
  channel: VoiceChannel;
  receiver: VoiceConnection["receiver"];
  eventBroadcaster: EventBroadcaster | undefined;
  activeSessions: Map<string, RecordingSession>;
  recordingsDir: string;
  /** Direct WS sender for real-time PCM — takes priority over Redis if set. */
  pcmSender?: (pcm: Buffer, userId: string) => void;
}

/**
 * Creates the event handler for `receiver.speaking.on("start", handler)`.
 *
 * The returned handler manages the full lifecycle for a user who starts speaking:
 * 1. Validates the user (skip bot self, skip already-subscribed)
 * 2. Collects user metadata and notifies the event broadcaster
 * 3. Sets up the audio stream, decoder, packet filter, and segment manager
 * 4. Attaches stream event handlers (data, end, error) BEFORE piping
 * 5. Pipes audio through the packet filter for OGG recording
 * 6. Handles segment completion (metadata write, upload trigger)
 */
export function createSpeakingHandler(
  ctx: SpeakingHandlerContext,
): (userId: string) => Promise<void> {
  const {
    client,
    channel,
    receiver,
    eventBroadcaster,
    activeSessions,
    recordingsDir,
    pcmSender,
  } = ctx;

  return async (userId: string) => {
    // Skip the bot's own audio
    if (userId === client.user?.id) return;

    const userMetadata = await collectUserMetadata(client, userId, channel);
    if (userMetadata.bot) return;

    logger.debug(
      { userId, username: userMetadata.username },
      "Voice activity detected",
    );

    // Skip if user already has an active stream subscription
    // (check BEFORE broadcast to avoid false positive events)
    if (receiver.subscriptions.has(userId)) return;

    // Notify webserver / WebSocket clients
    eventBroadcaster?.voiceActiveUser(userId, {
      username: userMetadata.username,
      avatar: userMetadata.avatarUrl,
      speaking: true,
    });

    // Ensure per-user recording directory
    const userDir = path.join(recordingsDir, userId);
    await fsPromises.mkdir(userDir, { recursive: true }).catch(() => {
      // Directory already exists, ignore
    });

    try {
      // Step 1: Set up stream components (subscribe, decoder, filter, segment
      // manager). NOTE: pipe() is NOT called here — we attach event handlers
      // first to prevent data loss from race conditions.
      const { audioStream, packetFilter, segmentManager, decoder } =
        setupUserStream({
          userId,
          receiver,
          userDir,
          onPcmData: (pcm) => {
            if (pcmSender) {
              pcmSender(pcm, userId);
            } else {
              eventBroadcaster?.voicePcmData(pcm, userId);
            }
          },
        });

      // Step 2: Attach all audioStream event handlers BEFORE pipe()
      audioStream.on("data", (chunk: Buffer) => {
        if (chunk.length < 8) return;
        segmentManager.rotateIfNeeded(packetFilter);
        decoder.rotateIfNeeded();
        decoder.write(chunk);
      });

      audioStream.on("end", () => {
        segmentManager.close(packetFilter);
        decoder.destroy();
        eventBroadcaster?.voiceActiveUser(userId, {
          username: userMetadata.username,
          avatar: userMetadata.avatarUrl,
          speaking: false,
        });
      });

      audioStream.on("error", (error: Error) => {
        segmentManager.close(packetFilter);
        decoder.destroy();
        logger.error({ userId, error: error.message }, "Audio stream error");
      });

      // Step 3: Now pipe for OGG recording (safe — event handlers attached)
      const oggPacketStream = audioStream.pipe(packetFilter);

      // Step 4: Open the first segment
      const activeSession = activeSessions.get(channel.guild.id);
      const currentSegment = segmentManager.open(oggPacketStream);

      // Step 5: Handle segment file completion
      currentSegment.out.on("finish", () => {
        finalizeSegment({
          currentSegment,
          userMetadata,
          activeSession,
          guildId: channel.guild.id,
          channelId: channel.id,
          channelName: channel.name,
        });
      });

      currentSegment.out.on("error", (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ userId, error: msg }, "File write error");
      });

      // Step 6: Handle packet filter errors
      packetFilter.on("error", (err) => {
        segmentManager.close(oggPacketStream);
        logger.error({ userId, error: err.message }, "PacketFilter error");
      });
    } catch (e) {
      logger.error(
        { userId, error: e instanceof Error ? e.message : String(e) },
        "Failed to create stream",
      );
    }
  };
}
