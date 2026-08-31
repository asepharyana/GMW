import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { Piscina } from "piscina";
import { config } from "../../shared/config/config.js";
import type { MessageRecord } from "../message-capture/types.js";

// ---------------------------------------------------------------------------
// Piscina worker pools (2026-08-31: split text vs media)
//
// Both the batch and individual-fallback pipelines used to share ONE pool.
// A conversation batch containing images/stickers/embeds routes through
// runMediaBatch (download + vision + LLM — tens of seconds per batch), and
// Piscina hands each worker thread exactly one task at a time. With a small
// fixed thread count, a handful of slow media batches could occupy every
// thread and leave fast text-only batches for OTHER conversations queued
// behind them for the whole media duration. Text and media now get their
// own dedicated pools so a media backlog can never starve text analysis.
// ---------------------------------------------------------------------------

function getAnalysisWorkerUrl(): URL {
  const candidates = [
    new URL("./ai-analysis-worker.js", import.meta.url),
    new URL("../ai-analysis-worker.js", import.meta.url),
    new URL("./ai-analysis-worker.ts", import.meta.url),
  ];

  for (const candidate of candidates) {
    if (existsSync(fileURLToPath(candidate))) {
      return candidate;
    }
  }

  return candidates[2];
}

const analysisWorkerFilename = fileURLToPath(getAnalysisWorkerUrl());

/** Dedicated pool for text-only batch/individual analysis jobs. */
export const textWorkerPool = new Piscina({
  filename: analysisWorkerFilename,
  execArgv: process.execArgv,
  maxThreads: config.PISCINA_MAX_THREADS ?? availableParallelism(),
});

/**
 * Dedicated pool for jobs whose batch contains at least one message with
 * media (attachments/stickers/embeds). Kept separate so slow image/vision
 * analysis never blocks the text pool above.
 */
export const mediaWorkerPool = new Piscina({
  filename: analysisWorkerFilename,
  execArgv: process.execArgv,
  maxThreads: config.PISCINA_MEDIA_MAX_THREADS ?? 2,
});

/**
 * @deprecated Use `textWorkerPool` or `mediaWorkerPool` directly. Kept as an
 * alias to the text pool only for anything not yet migrated.
 */
export const workerPool = textWorkerPool;

/**
 * Gets the conversation key for a message (thread_id or channel_id).
 */
export function getConversationKey(message: MessageRecord): string {
  return message.thread_id || message.channel_id;
}
