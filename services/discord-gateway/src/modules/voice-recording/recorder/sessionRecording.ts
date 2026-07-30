import { createChildLogger } from "@/shared/logger/index";
import type { UserMetadata } from "../../message-capture/types.js";

const logger = createChildLogger("recording-session");

export interface RecordingSessionOptions {
  guildId: string;
  channelId: string;
  channelName: string;
  startTime: number;
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
  status: "pending" | "completed" | "failed" | "empty";
  outputFile: string | null;
  participants: SessionParticipant[];
  segments: SessionSegmentRef[];
  error?: string;
}

export interface RecordingSession {
  readonly sessionId: string;
  readonly startTime: number;
  registerSegment(input: {
    user: UserMetadata;
    oggPath: string;
    jsonPath: string;
    startTime: number;
    endTime: number;
  }): void;
  snapshot(endTime: number): SessionRecordingMetadata;
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
    startTime: options.startTime,

    registerSegment(input) {
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
