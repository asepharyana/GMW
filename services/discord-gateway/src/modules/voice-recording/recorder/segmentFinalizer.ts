import { promises as fsPromises } from "node:fs";
import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../../shared/config/config.js";
import type {
  SegmentState,
  UserMetadata,
} from "../../message-capture/types.js";
import { createSegmentMetadata } from "./metadata.js";
import type { RecordingSession } from "./sessionRecording.js";
import { uploadRecordingSegment } from "./uploader.js";

const logger = createChildLogger("voice-segment-finalizer");

// ---------------------------------------------------------------------------
// SegmentFinalizerInput
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
// finalizeSegment
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
