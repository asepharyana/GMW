/**
 * Public surface of the AI-moderation module.
 *
 * The module has ~50 internal files; callers outside it (app/, tests, other
 * modules) should import from THIS barrel so internal files can be moved
 * without touching call sites.
 *
 * Deep imports remain valid inside the module itself.
 */

export type {
  AIRecommendedAction,
  AISeverity,
  AIStatus,
  AnalysisQueueStatus,
  AnalysisResult,
} from "../../shared/moderation-types.js";
// ── Entry API: queueing, status, recovery worker ──────────────────────────
export {
  getAnalysisQueueStatus,
  queueConversationAnalysis,
  queueMessageAnalysis,
  startPendingAIAnalysisWorker,
} from "./aiAnalyzer.js";
// ── Worker pools (app/metrics-collector reads their live thread counters) ──
export {
  getConversationKey,
  mediaWorkerPool,
  textWorkerPool,
} from "./circuitBreaker.js";
// ── Pipeline state hooks the bootstrap injects into ───────────────────────
export {
  setModerationClient,
  setSharedEventBroadcaster,
} from "./moderationState.js";
