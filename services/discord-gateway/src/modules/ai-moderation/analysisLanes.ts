/**
 * analysisLanes.ts
 *
 * Pure lane helpers for the AI-analysis queue. Kept free of any import chain
 * that pulls Piscina/worker/DB so they can be unit-tested in isolation (the
 * scheduler's `splitMessagesByLane` used to live in batchScheduler.ts, which
 * transitively imports the worker pool).
 */
import type { MessageRecord } from "../message-capture/types.js";
import type { AnalysisLane } from "./conversationState.js";
import { hasMediaContent } from "./mediaAnalysisClient.js";

export type { AnalysisLane } from "./conversationState.js";

/** True when this message belongs to the media lane (has attachment/sticker/embed). */
export function laneOfMessage(message: MessageRecord): AnalysisLane {
  return hasMediaContent(message) ? "media" : "text";
}

/**
 * Splits an arbitrary message array into per-lane lists. Used when the
 * scheduler runs a conversation-wide pass (lane omitted): each lane gets its
 * own subset so text and media never share a worker job.
 */
export function splitMessagesByLane(messages: MessageRecord[]): {
  text: MessageRecord[];
  media: MessageRecord[];
} {
  const text: MessageRecord[] = [];
  const media: MessageRecord[] = [];
  for (const m of messages) {
    (laneOfMessage(m) === "media" ? media : text).push(m);
  }
  return { text, media };
}
