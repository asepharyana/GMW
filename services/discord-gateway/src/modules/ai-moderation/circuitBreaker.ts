import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { Piscina } from "piscina";
import { config } from "../../shared/config/config.js";
import type { MessageRecord } from "../message-capture/types.js";

// ---------------------------------------------------------------------------
// Piscina worker pool (shared by batch + individual pipelines)
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

export const workerPool = new Piscina({
  filename: fileURLToPath(getAnalysisWorkerUrl()),
  execArgv: process.execArgv,
  maxThreads: config.PISCINA_MAX_THREADS ?? availableParallelism(),
});

/**
 * Gets the conversation key for a message (thread_id or channel_id).
 */
export function getConversationKey(message: MessageRecord): string {
  return message.thread_id || message.channel_id;
}
