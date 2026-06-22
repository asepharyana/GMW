/**
 * llmModerationClient.ts — BRIDGE FILE
 *
 * Re-exports all symbols from the refactored sub-modules for backward compat.
 * Original (2103 lines) was split into:
 *   - moderationBuilders.ts   (shared: escapeXml, getAnalysisContent, buildReferenceXml)
 *   - mediaAnalysisClient.ts  (vision analysis, image download, prepareMediaMessage)
 *   - moderationOrchestrator.ts (orchestration: callModerationLLM, runTextOnlyBatch,
 *                                runMediaBatch, runModerationAnalysis, runSimpleTextFallback)
 */
export { sniffImageMimeType } from "./imageMimeSniffer.js";
export { extractJson } from "./jsonExtractor.js";
export {
  parseModerationResponse,
  sanitizeErrorMessage,
} from "./moderationResponseParser.js";
export {
  ModerationResponseSchema,
  RecommendedActionSchema,
  ResultItemSchema,
  SeveritySchema,
} from "./moderationSchemas.js";
export {
  clampScore,
  DEFERRAL_ANALYSIS_PATTERN,
  DEFERRAL_EXCEPTION_PATTERN,
  deriveRecommendedAction,
  deriveSeverity,
  hasDeferralAnalysis,
} from "./severityDeriver.js";
export {
  runModerationAnalysis,
  runSimpleTextFallback,
} from "./moderationOrchestrator.js";
