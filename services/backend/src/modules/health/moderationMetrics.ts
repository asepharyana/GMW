/**
 * moderationMetrics.ts
 *
 * Prometheus metrics for AI moderation pipeline.
 * Defined in backend (where prom-client is installed + /api/metrics endpoint).
 */
import { Counter, Histogram } from "prom-client";

// ── LLM Call Metrics ──
export const llmCallsTotal = new Counter({
  name: "moderation_llm_calls_total",
  help: "Total LLM moderation calls",
  labelNames: ["path", "model"] as const,
});

export const llmCallDuration = new Histogram({
  name: "moderation_llm_call_duration_ms",
  help: "LLM moderation call duration (ms)",
  labelNames: ["path", "status"] as const,
  buckets: [500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000],
});

export const llmTokensTotal = new Counter({
  name: "moderation_llm_tokens_total",
  help: "Total tokens consumed by LLM moderation",
  labelNames: ["type"] as const,
});

// ── Cache Metrics ──
export const moderationCacheHits = new Counter({
  name: "moderation_cache_hits_total",
  help: "Moderation cache hits",
  labelNames: ["layer"] as const,
});

export const moderationCacheMisses = new Counter({
  name: "moderation_cache_misses_total",
  help: "Moderation cache misses",
  labelNames: ["layer"] as const,
});

// ── Media Analysis Metrics ──
export const mediaAnalysesTotal = new Counter({
  name: "moderation_media_analyses_total",
  help: "Media analyses performed",
  labelNames: ["type"] as const,
});

export const mediaDownloadDuration = new Histogram({
  name: "moderation_media_download_duration_ms",
  help: "Media download duration (ms)",
  labelNames: ["source"] as const,
  buckets: [100, 500, 1000, 2000, 5000, 10000, 30000],
});

// ── Batch & Error Metrics ──
export const moderationBatchSize = new Histogram({
  name: "moderation_batch_size",
  help: "Messages per batch",
  labelNames: ["path"] as const,
  buckets: [1, 5, 10, 20, 50, 100],
});

export const moderationErrors = new Counter({
  name: "moderation_errors_total",
  help: "Moderation errors",
  labelNames: ["type"] as const,
});

export const searxngCalls = new Counter({
  name: "moderation_searxng_calls_total",
  help: "SearXNG search calls",
  labelNames: ["status"] as const,
});

export const autoDeleteActions = new Counter({
  name: "moderation_auto_delete_total",
  help: "Auto-delete actions",
  labelNames: ["action"] as const,
});
