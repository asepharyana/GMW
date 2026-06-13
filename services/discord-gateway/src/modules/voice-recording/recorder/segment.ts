import fs, { promises as fsPromises } from "node:fs";
import path from "node:path";
import { createChildLogger } from "@bete/shared/logger";
import type { Client, VoiceChannel } from "discord.js-selfbot-v13";
import * as prism from "prism-media";
import { config } from "../../../shared/config/config.js";
import type {
  SegmentMetadata,
  SegmentState,
  UserMetadata,
} from "../../message-capture/types.js";
import type { RecordingSession } from "./sessionRecording.js";
import { uploadRecordingSegment } from "./uploader.js";

// ---------------------------------------------------------------------------
// Logger & metadata cache
// ---------------------------------------------------------------------------

const logger = createChildLogger("voice-segment");

/** LRU-ish cache: userId -> UserMetadata. Avoids Discord API calls in hotpath. */
const metadataCache = new Map<string, UserMetadata>();
const METADATA_CACHE_MAX = 200;

// ---------------------------------------------------------------------------
// collectUserMetadata (was metadata.ts)
// ---------------------------------------------------------------------------

export async function collectUserMetadata(
  client: Client,
  userId: string,
  channel: VoiceChannel,
): Promise<UserMetadata> {
  const cached = metadataCache.get(userId);
  if (cached) return cached;

  const user =
    client.users.cache.get(userId) ||
    (await client.users.fetch(userId).catch(() => {
      logger.warn({ userId }, "Failed to fetch user");
      return null;
    }));
  const member =
    channel.guild.members.cache.get(userId) ||
    (await channel.guild.members.fetch(userId).catch(() => {
      logger.warn({ userId }, "Failed to fetch guild member");
      return null;
    }));
  const username = user?.username ?? "Unknown User";
  const roles =
    member?.roles.cache
      .filter((role) => role.id !== channel.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
      })) ?? [];

  const result: UserMetadata = {
    userId,
    username,
    tag: user?.tag ?? "Unknown#0000",
    displayName: member?.displayName ?? username,
    avatarUrl:
      user?.displayAvatarURL({
        format: "png",
        size: config.AVATAR_SIZE as
          | 16
          | 32
          | 64
          | 128
          | 256
          | 512
          | 1024
          | 2048
          | 4096,
      }) ?? "https://cdn.discordapp.com/embed/avatars/0.png",
    bot: user?.bot ?? false,
    roles,
    highestRole: roles[0] ?? null,
    joinedTimestamp: member?.joinedTimestamp ?? null,
  };

  cacheMetadata(userId, result);
  return result;
}

function cacheMetadata(userId: string, metadata: UserMetadata): void {
  if (metadataCache.size >= METADATA_CACHE_MAX) {
    // Evict oldest entry via Map iteration (Map preserves insertion order)
    const firstKey = metadataCache.keys().next().value;
    if (firstKey) metadataCache.delete(firstKey);
  }
  metadataCache.set(userId, metadata);
}

// ---------------------------------------------------------------------------
// Path helpers (was segment.ts)
// ---------------------------------------------------------------------------

export function buildSegmentPaths(
  userDir: string,
  startTime: number,
): { filename: string; jsonFilename: string } {
  return {
    filename: path.join(userDir, `${startTime}.ogg`),
    jsonFilename: path.join(userDir, `${startTime}.json`),
  };
}

export function shouldRotateSegment(
  startTime: number,
  now: number,
  recordingSegmentMs: number,
): boolean {
  return recordingSegmentMs > 0 && now - startTime >= recordingSegmentMs;
}

// ---------------------------------------------------------------------------
// SegmentManager (was segment.ts)
// ---------------------------------------------------------------------------

export class SegmentManager {
  private currentSegment: SegmentState | null = null;
  private segmentIndex = 0;

  constructor(
    private readonly userDir: string,
    private readonly recordingSegmentMs: number,
  ) {}

  open(oggPacketStream: NodeJS.ReadableStream): SegmentState {
    const index = this.segmentIndex++;
    const startTime = Date.now();
    const { filename, jsonFilename } = buildSegmentPaths(
      this.userDir,
      startTime,
    );
    const oggStream = new prism.opus.OggLogicalBitstream({
      opusHead: new prism.opus.OpusHead({ channelCount: 2, sampleRate: 48000 }),
      pageSizeControl: { maxPackets: 10 },
      crc: false,
    });
    const out = fs.createWriteStream(filename);
    oggPacketStream.pipe(oggStream).pipe(out);

    this.currentSegment = {
      index,
      startTime,
      endTime: null,
      filename,
      jsonFilename,
      oggStream,
      out,
    };

    logger.debug(
      { index, startTime, filename, userDir: this.userDir },
      "Segment opened",
    );
    return this.currentSegment;
  }

  close(oggPacketStream: NodeJS.ReadableStream): SegmentState | null {
    if (!this.currentSegment) return null;
    const segment = this.currentSegment;
    segment.endTime = Date.now();
    oggPacketStream.unpipe(segment.oggStream);
    segment.oggStream.end();
    this.currentSegment = null;

    // Get file size after closing
    let fileSize = 0;
    try {
      const stat = fs.statSync(segment.filename);
      fileSize = stat.size;
    } catch {
      // File might not exist yet
    }

    logger.debug(
      {
        index: segment.index,
        filename: segment.filename,
        fileSize,
        durationMs: (segment.endTime ?? 0) - segment.startTime,
      },
      "Segment closed",
    );
    return segment;
  }

  rotateIfNeeded(oggPacketStream: NodeJS.ReadableStream): SegmentState | null {
    if (!this.currentSegment) return null;
    if (
      !shouldRotateSegment(
        this.currentSegment.startTime,
        Date.now(),
        this.recordingSegmentMs,
      )
    )
      return null;

    logger.debug(
      {
        index: this.currentSegment.index,
        filename: this.currentSegment.filename,
        durationMs: Date.now() - this.currentSegment.startTime,
      },
      "Segment rotating",
    );
    this.close(oggPacketStream);
    return this.open(oggPacketStream);
  }

  getCurrent(): SegmentState | null {
    return this.currentSegment;
  }
}

// ---------------------------------------------------------------------------
// createSegmentMetadata (was metadata.ts)
// ---------------------------------------------------------------------------

export function createSegmentMetadata(
  user: UserMetadata,
  segment: SegmentState,
  sessionId: string,
  recordingSessionId: string,
  sessionStartTime: number,
  recordingSegmentMs: number,
): SegmentMetadata {
  const endTime = segment.endTime ?? Date.now();
  return {
    ...user,
    sessionId,
    recordingSessionId,
    sessionStartTime,
    segmentIndex: segment.index,
    segmentMs: recordingSegmentMs,
    startTime: segment.startTime,
    endTime,
    durationMs: endTime - segment.startTime,
    filename: path.basename(segment.filename),
  };
}

// ---------------------------------------------------------------------------
// SegmentFinalizerInput (was segmentFinalizer.ts)
// ---------------------------------------------------------------------------

export interface SegmentFinalizerInput {
  currentSegment: SegmentState;
  userMetadata: UserMetadata;
  activeSession: RecordingSession | undefined;
  guildId: string;
  channelId: string;
  channelName: string;
}

// ---------------------------------------------------------------------------
// finalizeSegment (was segmentFinalizer.ts)
// ---------------------------------------------------------------------------

/**
 * Handles the completion of an OGG segment:
 * - Logs the saved segment (if VERBOSE)
 * - Registers the segment with the active recording session
 * - Writes the metadata JSON file alongside the OGG file
 * - Triggers async upload of the segment to external storage
 *
 * This function is fire-and-forget for the metadata write and upload;
 * errors are caught and logged without throwing.
 */
export function finalizeSegment(input: SegmentFinalizerInput): void {
  const {
    currentSegment,
    userMetadata,
    activeSession,
    guildId,
    channelId,
    channelName,
  } = input;

  const endTime = currentSegment.endTime ?? Date.now();

  if (config.VERBOSE) {
    logger.info({ filename: currentSegment.filename }, "Segment saved");
  }

  // Register segment with the active recording session
  if (activeSession) {
    activeSession.registerSegment({
      user: userMetadata,
      oggPath: currentSegment.filename,
      jsonPath: currentSegment.jsonFilename,
      startTime: currentSegment.startTime,
      endTime,
    });
  }

  // Write metadata JSON (async, fire-and-forget)
  const metadata = createSegmentMetadata(
    userMetadata,
    currentSegment,
    activeSession?.sessionId ?? `${userMetadata.userId}-0`,
    activeSession?.sessionId ?? `${guildId}-${channelId}-0`,
    activeSession?.startTime ?? 0,
    config.RECORDING_SEGMENT_MS,
  );

  fsPromises
    .writeFile(currentSegment.jsonFilename, JSON.stringify(metadata, null, 2))
    .then(() => {
      if (config.VERBOSE) {
        logger.info(
          { jsonFile: currentSegment.jsonFilename },
          "Metadata saved",
        );
      }
    })
    .catch((err: unknown) => {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Failed to write segment metadata",
      );
    });

  // Trigger async voice segment upload (fire-and-forget)
  const segmentId = `${userMetadata.userId}-${currentSegment.startTime}`;
  uploadRecordingSegment({
    id: segmentId,
    oggPath: currentSegment.filename,
    userId: userMetadata.userId,
    username: userMetadata.username,
    avatarUrl: userMetadata.avatarUrl,
    guildId,
    channelId,
    channelName,
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ segmentId, error: msg }, "Upload segment trigger failed");
  });
}
