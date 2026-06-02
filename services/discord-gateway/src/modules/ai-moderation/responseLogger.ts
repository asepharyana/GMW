/**
 * Comprehensive response logging for vision and moderation analysis.
 *
 * Purpose: Capture ALL responses from:
 * - Vision model (image analysis)
 * - LLM moderation (text analysis)
 * - Cache hits/misses
 * - Errors and retries
 *
 * Enables full audit trail and debugging of moderation decisions.
 */

import { createChildLogger } from "../../shared/logger/logger.js";
import type { AnalysisResult } from "../message-capture/types.js";

const logger = createChildLogger("response-logger");

export interface VisionAnalysisResponse {
  messageId: string;
  cacheKey: string;
  cached: boolean;
  description: string;
  duration_ms: number;
  timestamp: number;
}

export interface ModerationAnalysisResponse {
  messageIds: string[];
  batchSize: number;
  model: string;
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  results: AnalysisResult[];
  duration_ms: number;
  parseErrors: string[];
  timestamp: number;
}

export interface CacheHitEvent {
  type: "hit" | "miss";
  cacheKey: string;
  source: "text" | "media" | "sticker";
  timestamp: number;
}

/**
 * Log a vision model response with full details.
 */
export function logVisionAnalysis(
  messageId: string,
  cacheKey: string,
  cached: boolean,
  description: string,
  duration_ms: number,
): void {
  const response: VisionAnalysisResponse = {
    messageId,
    cacheKey,
    cached,
    description,
    duration_ms,
    timestamp: Date.now(),
  };

  logger.info(
    {
      ...response,
      description_length: description.length,
      description_preview: description.substring(0, 200),
    },
    `Vision analysis complete [${cached ? "CACHED" : "FRESH"}] for message ${messageId}`,
  );
}

/**
 * Log a moderation LLM response with full batch details.
 */
export function logModerationAnalysis(
  messageIds: string[],
  model: string,
  results: AnalysisResult[],
  duration_ms: number,
  tokenUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
  parseErrors: string[] = [],
): void {
  const response: ModerationAnalysisResponse = {
    messageIds,
    batchSize: messageIds.length,
    model,
    tokenUsage,
    results: results.map((r) => ({
      messageId: r.messageId,
      status: r.status,
      flags: r.flags ?? [],
      score: r.score,
      severity: r.severity,
      confidence: r.confidence,
      recommendedAction: r.recommendedAction,
      analysis: r.analysis?.substring(0, 200), // Truncate for logs
    })) as AnalysisResult[],
    duration_ms,
    parseErrors,
    timestamp: Date.now(),
  };

  logger.info(
    {
      batch_size: messageIds.length,
      model,
      token_usage: tokenUsage,
      duration_ms,
      parse_errors: parseErrors.length,
      results_summary: {
        clean: results.filter((r) => r.status === "clean").length,
        warn: results.filter((r) => r.status === "warn").length,
        flagged: results.filter((r) => r.status === "flagged").length,
        error: results.filter((r) => r.status === "error").length,
      },
    },
    `Moderation analysis complete for batch of ${messageIds.length} messages`,
  );

  // Log each result individually for detailed audit trail
  results.forEach((result, idx) => {
    const severity = result.severity ?? "none";
    const confidence = result.confidence ?? 0;
    logger.debug(
      {
        index: idx,
        message_id: result.messageId,
        status: result.status,
        flags: result.flags,
        score: result.score,
        severity,
        confidence,
        categories: result.categories,
        recommended_action: result.recommendedAction,
        analysis: result.analysis?.substring(0, 300),
        evidence: result.evidence?.slice(0, 3), // First 3 evidence items
      },
      `[${idx + 1}/${messageIds.length}] Moderation result for message ${result.messageId}: ${result.status} (severity: ${severity}, confidence: ${confidence})`,
    );
  });
}

/**
 * Log cache hit/miss event.
 */
export function logCacheEvent(
  type: "hit" | "miss",
  cacheKey: string,
  source: "text" | "media" | "sticker",
): void {
  const event: CacheHitEvent = {
    type,
    cacheKey,
    source,
    timestamp: Date.now(),
  };

  logger.debug(
    {
      cache_type: type.toUpperCase(),
      source,
      key_length: cacheKey.length,
      key_preview: cacheKey.substring(0, 50),
    },
    `Cache ${type.toUpperCase()}: ${source}`,
  );
}

/**
 * Log vision API error with context.
 */
export function logVisionError(
  messageId: string,
  error: Error | string,
  context?: Record<string, any>,
): void {
  logger.error(
    {
      message_id: messageId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
    },
    `Vision analysis failed for message ${messageId}`,
  );
}

/**
 * Log LLM API error with request context.
 */
export function logModerationError(
  messageIds: string[],
  model: string,
  error: Error | string,
  context?: Record<string, any>,
): void {
  logger.error(
    {
      message_ids: messageIds,
      batch_size: messageIds.length,
      model,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
    },
    `Moderation analysis failed for batch of ${messageIds.length} messages`,
  );
}

/**
 * Log retry event with attempt details.
 */
export function logRetryAttempt(
  label: string,
  attempt: number,
  maxRetries: number,
  error: Error | string,
  nextDelayMs: number,
): void {
  logger.warn(
    {
      label,
      attempt,
      max_retries: maxRetries,
      error: error instanceof Error ? error.message : String(error),
      next_delay_ms: nextDelayMs,
      remaining_attempts: maxRetries - attempt + 1,
    },
    `Retry attempt ${attempt}/${maxRetries} for ${label} (next retry in ${nextDelayMs}ms)`,
  );
}

/**
 * Log analysis completion summary (for batch end-of-processing).
 */
export function logAnalysisSummary(
  conversationKey: string,
  totalMessages: number,
  successCount: number,
  errorCount: number,
  durationMs: number,
  summary: Record<string, number>,
): void {
  logger.info(
    {
      conversation_key: conversationKey,
      total_messages: totalMessages,
      success_count: successCount,
      error_count: errorCount,
      duration_ms: durationMs,
      per_message_avg_ms: Math.round(durationMs / totalMessages),
      summary,
      success_rate: ((successCount / totalMessages) * 100).toFixed(1) + "%",
    },
    `Analysis batch complete: ${successCount}/${totalMessages} successful in ${durationMs}ms`,
  );
}

/**
 * Log false positive detection (cache version mismatch or incorrect analysis).
 */
export function logFalsePositiveDetected(
  messageId: string,
  currentAnalysis: AnalysisResult,
  reason: string,
  context?: Record<string, any>,
): void {
  logger.warn(
    {
      message_id: messageId,
      status: currentAnalysis.status,
      flags: currentAnalysis.flags,
      score: currentAnalysis.score,
      reason,
      context,
      timestamp: Date.now(),
    },
    `Potential false positive detected: ${reason}`,
  );
}

/**
 * Log model version change.
 */
export function logModelVersionChange(
  oldVersion: string,
  newVersion: string,
  reason: string,
): void {
  logger.info(
    {
      old_version: oldVersion,
      new_version: newVersion,
      reason,
      timestamp: Date.now(),
    },
    `Model version changed: ${oldVersion} → ${newVersion} (${reason})`,
  );
}

/**
 * Log cache invalidation event.
 */
export function logCacheInvalidation(
  source: string,
  oldVersion: string,
  newVersion: string,
  reason: string,
  affectedCount?: number,
): void {
  logger.info(
    {
      source,
      old_version: oldVersion,
      new_version: newVersion,
      reason,
      affected_count: affectedCount,
      timestamp: Date.now(),
    },
    `Cache invalidation: ${source} entries with version ${oldVersion} will be ignored due to ${reason}`,
  );
}
