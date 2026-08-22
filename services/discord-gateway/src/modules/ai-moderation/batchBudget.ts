/**
 * batchBudget.ts
 *
 * Pure batch-sizing helper extracted from batchProcessor.ts so it can be
 * unit-tested without pulling in the Piscina worker pool, message store,
 * or any other side-effectful import chain.
 */
import type { MessageRecord } from "../message-capture/types.js";

/** Token estimator contract (satisfied by conversationContext.estimateTokens). */
export type TokenEstimator = (text: string) => number;

/**
 * Picks a batch of messages within a token budget.
 * `tokensPerMessage` accounts for JSON structure overhead around each entry.
 * The estimator is injected so this stays a pure function — callers in the
 * batch pipeline pass the tiktoken-based estimateTokens.
 */
export function pickBatchWithinBudget(
  messages: MessageRecord[],
  maxTokens: number,
  tokensPerMessage: number,
  estimateTokens: TokenEstimator,
): MessageRecord[] {
  const batch: MessageRecord[] = [];
  let usedTokens = 0;

  for (const msg of messages) {
    const content = msg.edited_content ?? msg.content;
    const msgTokens = estimateTokens(content) + tokensPerMessage;

    // Stop at the first overflow instead of skipping: input is ordered
    // created_at ASC, so a contiguous chronological prefix keeps the batch
    // gap-free. Skipped-over messages would leave unanalyzed holes mid-
    // timeline; anything past the budget is picked up by the next wave
    // (processBatch always re-schedules after success).
    if (usedTokens + msgTokens > maxTokens) {
      break;
    }
    batch.push(msg);
    usedTokens += msgTokens;
  }

  return batch;
}
