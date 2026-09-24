import type { Logger } from "@/shared/logger/index.js";
import {
  getAnalysisQueueStatus,
  mediaWorkerPool,
  textWorkerPool,
} from "../modules/ai-moderation/index.js";
import {
  registerCollector,
  setGauge,
} from "../modules/gateway-metrics/index.js";
import { config } from "../shared/config/index.js";

/** Piscina exposes its live thread counters on `_poolState`. */
type PoolState = { _poolState?: { size: number; active: number } };

/**
 * Registers the AI-pipeline Prometheus gauges.
 *
 * The collector refreshes on every scrape, so Prometheus sees real queue
 * depth / concurrency / worker-thread state instead of an empty stub.
 * Registered before the metrics server starts.
 */
export function registerPipelineMetrics(logger: Logger): void {
  registerCollector(() => {
    if (!config.AI_ANALYSIS_ENABLED) return;
    try {
      const status = getAnalysisQueueStatus();
      setGauge("ai_analysis_queued_conversations", status.queuedConversations);
      setGauge("ai_analysis_active_batch_requests", status.activeRequests);
      setGauge(
        "ai_analysis_active_text_requests",
        status.activeTextRequests ?? status.activeRequests,
      );
      setGauge(
        "ai_analysis_active_media_requests",
        status.activeMediaRequests ?? 0,
      );
      setGauge(
        "ai_analysis_active_individual_requests",
        status.activeIndividualRequests,
      );
      setGauge(
        "ai_analysis_individual_in_flight",
        status.individualInFlightCount,
      );
      setGauge(
        "ai_analysis_individual_circuit_breaker_active",
        status.individualCircuitBreakerActive ? 1 : 0,
      );
      if (typeof status.lastError === "string") {
        setGauge("ai_analysis_last_error_present", status.lastError ? 1 : 0);
      }

      // Reported per queue (2026-08-31 text/media pool split) so the text
      // and media backlogs are distinguishable in dashboards/alerts instead
      // of one combined "worker threads" number.
      const textPool = textWorkerPool as unknown as PoolState;
      const mediaPool = mediaWorkerPool as unknown as PoolState;
      if (textPool._poolState) {
        setGauge("ai_analysis_worker_threads_text", textPool._poolState.size);
        setGauge(
          "ai_analysis_worker_threads_active_text",
          textPool._poolState.active,
        );
      }
      if (mediaPool._poolState) {
        setGauge("ai_analysis_worker_threads_media", mediaPool._poolState.size);
        setGauge(
          "ai_analysis_worker_threads_active_media",
          mediaPool._poolState.active,
        );
      }
    } catch (err) {
      logger.warn({ error: String(err) }, "AI metrics collector failed");
    }
  });
}
