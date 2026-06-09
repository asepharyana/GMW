import fs, { promises as fsPromises } from "node:fs";
import path from "node:path";
import { createChildLogger } from "@bete/shared/logger";
import type { UserMetadata } from "../../message-capture/types.js";
import {
  buildMuxFfmpegArgs,
  runFfmpeg as defaultRunFfmpeg,
} from "../ffmpegProcess.js";

const logger = createChildLogger("recording-session");

export type SessionRecordingStatus =
  | "pending"
  | "completed"
  | "failed"
  | "empty";

export interface RecordingSessionOptions {
  guildId: string;
  channelId: string;
  channelName: string;
  startTime: number;
  recordingsDir: string;
}

export interface SessionSegmentInput {
  user: UserMetadata;
  oggPath: string;
  jsonPath: string;
  startTime: number;
  endTime: number;
}

export interface SessionParticipant {
  userId: string;
  username: string;
  tag: string;
  displayName: string;
  avatarUrl: string;
}

export interface SessionSegmentRef {
  userId: string;
  oggPath: string;
  jsonPath: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  offsetMs: number;
}

export interface SessionRecordingMetadata {
  sessionId: string;
  guildId: string;
  channelId: string;
  channelName: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  status: SessionRecordingStatus;
  outputFile: string | null;
  participants: SessionParticipant[];
  segments: SessionSegmentRef[];
  error?: string;
}

export interface RecordingSession {
  readonly sessionId: string;
  readonly recordingsDir: string;
  readonly startTime: number;
  registerSegment(input: SessionSegmentInput): void;
  snapshot(endTime: number): SessionRecordingMetadata;
}

export interface FinalizeRecordingSessionDependencies {
  endTime?: number;
  mkdir?: (dir: string) => Promise<void>;
  writeJson?: (
    file: string,
    metadata: SessionRecordingMetadata,
  ) => Promise<void>;
  runFfmpeg?: (args: string[]) => Promise<void>;
}

export function createRecordingSession(
  options: RecordingSessionOptions,
): RecordingSession {
  const sessionId = `${options.guildId}-${options.channelId}-${options.startTime}`;
  const participants = new Map<string, SessionParticipant>();
  const segments: SessionSegmentRef[] = [];

  logger.info(
    {
      sessionId,
      guildId: options.guildId,
      channelId: options.channelId,
      channelName: options.channelName,
    },
    "Recording session created",
  );

  return {
    sessionId,
    recordingsDir: options.recordingsDir,
    startTime: options.startTime,

    registerSegment(input: SessionSegmentInput): void {
      participants.set(input.user.userId, {
        userId: input.user.userId,
        username: input.user.username,
        tag: input.user.tag,
        displayName: input.user.displayName,
        avatarUrl: input.user.avatarUrl,
      });
      segments.push({
        userId: input.user.userId,
        oggPath: input.oggPath,
        jsonPath: input.jsonPath,
        startTime: input.startTime,
        endTime: input.endTime,
        durationMs: input.endTime - input.startTime,
        offsetMs: input.startTime - options.startTime,
      });
      logger.debug(
        { sessionId, userId: input.user.userId, segmentCount: segments.length },
        "Segment registered in session",
      );
    },

    snapshot(endTime: number): SessionRecordingMetadata {
      return {
        sessionId,
        guildId: options.guildId,
        channelId: options.channelId,
        channelName: options.channelName,
        startTime: options.startTime,
        endTime,
        durationMs: endTime - options.startTime,
        status: "pending",
        outputFile: null,
        participants: Array.from(participants.values()),
        segments: [...segments],
      };
    },
  };
}

export function buildSessionMuxFilter(
  segments: Array<{ startTime: number }>,
  sessionStartTime: number,
): string {
  if (segments.length === 0) {
    logger.debug("Building mux filter with no segments");
    return "";
  }

  const filters = segments.map((segment, index) => {
    const delayMs = Math.max(0, segment.startTime - sessionStartTime);
    return `[${index}:a]adelay=${delayMs}|${delayMs}[pad${index}]`;
  });
  const inputs = segments.map((_, index) => `[pad${index}]`).join("");
  filters.push(
    `${inputs}amix=inputs=${segments.length}:dropout_transition=0[out]`,
  );

  logger.debug(
    { segmentCount: segments.length, filter: filters.join(";") },
    "Built mux filter",
  );
  return filters.join(";");
}

export async function finalizeRecordingSession(
  session: RecordingSession,
  dependencies: FinalizeRecordingSessionDependencies = {},
): Promise<void> {
  const endTime = dependencies.endTime ?? Date.now();
  const sessionDir = path.join(
    session.recordingsDir,
    "sessions",
    session.sessionId,
  );
  const outputFile = path.join(sessionDir, "full.ogg");
  const metadataFile = path.join(sessionDir, "session.json");
  const mkdir =
    dependencies.mkdir ?? ((dir) => fsPromises.mkdir(dir, { recursive: true }));
  const writeJson =
    dependencies.writeJson ??
    ((file, metadata) =>
      fsPromises.writeFile(file, JSON.stringify(metadata, null, 2)));
  const runFfmpeg = dependencies.runFfmpeg ?? defaultRunFfmpeg;

  await mkdir(sessionDir);
  const metadata = session.snapshot(endTime);

  logger.info(
    {
      sessionId: session.sessionId,
      segmentCount: metadata.segments.length,
      outputFile,
    },
    "Finalizing recording session",
  );

  if (metadata.segments.length === 0) {
    await writeJson(metadataFile, { ...metadata, status: "empty" });
    logger.info(
      { sessionId: session.sessionId },
      "Recording session finalized with no segments",
    );
    return;
  }

  try {
    const ffmpegArgs = buildMuxFfmpegArgs({
      inputs: metadata.segments.map((segment) => segment.oggPath),
      filter: buildSessionMuxFilter(metadata.segments, metadata.startTime),
      output: outputFile,
      codec: "libopus",
    });

    logger.debug(
      { sessionId: session.sessionId, ffmpegArgs },
      "Running FFmpeg mux for session",
    );

    await runFfmpeg(ffmpegArgs);

    // Get output file size
    let outputSize = 0;
    try {
      const outStat = await fsPromises.stat(outputFile);
      outputSize = outStat.size;
    } catch {
      // File might not exist yet, ignore
    }

    await writeJson(metadataFile, {
      ...metadata,
      status: "completed",
      outputFile,
    });

    logger.info(
      { sessionId: session.sessionId, outputFile, outputSize },
      "Recording session finalized successfully",
    );
  } catch (error) {
    logger.error(
      {
        sessionId: session.sessionId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to finalize recording session via FFmpeg",
    );
    await writeJson(metadataFile, {
      ...metadata,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
