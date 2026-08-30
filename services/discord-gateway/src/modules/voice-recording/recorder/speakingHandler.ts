import { promises as fsPromises } from "node:fs";
import path from "node:path";
import type { VoiceConnection } from "@discordjs/voice";
import type { Client, VoiceChannel } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import type { EventBroadcaster } from "../../event-broadcaster/eventBroadcaster.js";
import type {
  SegmentState,
  UserMetadata,
} from "../../message-capture/types.js";
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
 * # Why this is structured the way it is (recording-completeness)
 *
 * `receiver.speaking"start"` fires from `onUdpMessage` the moment the FIRST
 * Opus packet for a user arrives, and the opus bytes are forwarded to the
 * subscription stream **only if a subscription already exists** — otherwise
 * they are dropped (`subscriptions.get(userId)` is undefined → `return`).
 *
 * That means the subscription MUST be created synchronously (no `await` before
 * it): every frame between "start" and the subscribe call is otherwise silently
 * discarded → the START of a burst is MISSING (the user's core complaint).
 * The previous code `await`ed `collectUserMetadata` (a Discord REST roundtrip,
 * slow on cache miss) BEFORE subscribing — that was the main source of misses.
 *
 * Metadata is now fetched in the background. If the speaker turns out to be a
 * bot, the just-started burst is discarded (unlinked, never uploaded).
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
    // Skip the bot's own audio.
    if (userId === client.user?.id) return;

    // Synchronous guard BEFORE any await. Two "start" events can race during a
    // subscription; guard here so we never create a second subscription.
    if (receiver.subscriptions.has(userId)) return;

    logger.debug({ userId }, "Voice activity detected");

    // Optimistic speaking:true (real metadata arrives async).
    eventBroadcaster?.voiceActiveUser(userId, {
      username: userId,
      avatar: "",
      speaking: true,
    });

    // Subscribe IMMEDIATELY (synchronously — guard is already done above, no
    // `await` since then), so the subscription exists before any Opus frame
    // arrives. Frames are then buffered by the AudioReceiveStream while we
    // finish setup below (mkdir is non-network and fast).
    const userDir = path.join(recordingsDir, userId);
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

    // Ensure per-user recording directory (subscription is already live, so
    // this await does NOT drop audio — frames buffer in the subscription).
    await fsPromises.mkdir(userDir, { recursive: true }).catch(() => {
      // Directory already exists, ignore.
    });

    const activeSession = activeSessions.get(channel.guild.id);

    // Mutable per-burst state.
    let userMetadata: UserMetadata | null = null;
    let accepted = true; // false once we learn it's a bot → discard burst
    let finalized = false;

    /** Unlink the given segment's files (bot/error discard path). */
    const discardSegmentFiles = (seg: SegmentState | null): void => {
      if (!seg) return;
      fsPromises.unlink(seg.filename).catch(() => {});
      fsPromises.unlink(seg.jsonFilename).catch(() => {});
    };

    const emitSpeakingFalse = (): void => {
      eventBroadcaster?.voiceActiveUser(userId, {
        username: userMetadata?.username ?? userId,
        avatar: userMetadata?.avatarUrl ?? "",
        speaking: false,
      });
    };

    /**
     * Close the current (per-burst) segment and — once the underlying file has
     * finished flushing to disk — finalize it (or discard it if bot/error).
     * Safe to call multiple times (guarded by `finalized`).
     */
    const finishBurst = (): void => {
      if (finalized) return;
      finalized = true;
      const seg = segmentManager.close(oggPacketStream);
      decoder.destroy();

      const doFinalize = (): void => {
        Promise.resolve(userMetadata).then((meta) => {
          if (meta && accepted && seg) {
            try {
              finalizeSegment({
                currentSegment: seg,
                userMetadata: meta,
                activeSession,
                guildId: channel.guild.id,
                channelId: channel.id,
                channelName: channel.name,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.error({ userId, error: msg }, "Segment finalize failed");
            }
          } else {
            // Bot audio, metadata failure, or no segment opened — discard.
            discardSegmentFiles(seg);
          }
        });
      };

      // finalizeSegment reads the OGG file, so wait for the write stream to
      // flush before touching it.
      if (seg?.out.writableFinished) {
        doFinalize();
      } else {
        seg?.out.once("finish", doFinalize);
      }
    };

    // Attach audioStream handlers BEFORE pipe() (prevents data loss).
    audioStream.on("data", (chunk: Buffer) => {
      if (chunk.length < 8) return;
      // One segment per burst — no time-based rotation here. Only rotate the
      // web-PCM broadcast decoder to bound its memory.
      decoder.rotateIfNeeded();
      decoder.write(chunk);
    });

    audioStream.on("end", () => {
      finishBurst();
      emitSpeakingFalse();
    });

    audioStream.on("error", (error: Error) => {
      logger.error({ userId, error: error.message }, "Audio stream error");
      finishBurst();
      emitSpeakingFalse();
    });

    // Pipe for OGG recording (handlers already attached).
    const oggPacketStream = audioStream.pipe(packetFilter);

    // Open the (single, per-burst) segment.
    const currentSegment = segmentManager.open(oggPacketStream);

    // Handle file-write errors on the underlying write stream.
    currentSegment.out.on("error", (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ userId, error: msg }, "File write error");
    });

    // Handle packet-filter errors (rare) by closing the burst.
    packetFilter.on("error", (err: Error) => {
      logger.error({ userId, error: err.message }, "PacketFilter error");
      finishBurst();
      emitSpeakingFalse();
    });

    // Fetch user metadata in the background; reject bots by discarding burst.
    collectUserMetadata(client, userId, channel)
      .then((meta) => {
        if (meta.bot) {
          accepted = false;
          finishBurst();
          emitSpeakingFalse();
          return;
        }
        userMetadata = meta;
        eventBroadcaster?.voiceActiveUser(userId, {
          username: meta.username,
          avatar: meta.avatarUrl,
          speaking: true,
        });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(
          { userId, error: msg },
          "Metadata fetch failed, dropping burst",
        );
        accepted = false;
        finishBurst();
        emitSpeakingFalse();
      });
  };
}
