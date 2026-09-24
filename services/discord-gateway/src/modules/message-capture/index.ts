/**
 * Public surface of the message-capture module.
 *
 * Callers outside this module import from here instead of reaching into
 * messageCapture.ts / moderationActionsDb.ts / messageStore.ts directly, so
 * the internal file layout can change without touching call sites.
 *
 * Deep imports remain valid inside the module itself.
 */

// ── Discord listener registration (called from app/lifecycle.ts) ───────────
export {
  registerMessageCapture,
  setEventBroadcaster,
} from "./messageCapture.js";
// ── Message persistence facade ────────────────────────────────────────────
export { messageStore } from "./messageStore.js";
// ── Live moderation-action publishing ─────────────────────────────────────
export { setModerationEventBroadcaster } from "./moderationActionsDb.js";

// ── Domain types ──────────────────────────────────────────────────────────
export type {
  AIRecommendedAction,
  AISeverity,
  AIStatus,
  AnalysisQueueStatus,
  AnalysisResult,
  AttachmentRecord,
  DashboardMessage,
  MessageQuery,
  MessageRecord,
  MessageReview,
  ModerationAction,
  ModerationActionType,
  ModerationWsEvent,
  PageResult,
  RetentionPolicy,
  ReviewStatus,
  RoleMetadata,
  UserMetadata,
} from "./types.js";
