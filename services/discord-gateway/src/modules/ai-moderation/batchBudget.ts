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

/**
 * Returns the messages that were fetched/claimed but did NOT make it into the
 * trimmed batch (i.e. the tail past the token budget).
 *
 * The DB claim step flips every fetched pending row to `processing`; the batch
 * trim may then stop early on the token budget. Those tail rows would stay
 * stuck in `processing` forever unless the caller explicitly un-claims them —
 * this helper identifies exactly which rows that is, so the caller can write
 * them back to `pending` for the next wave.
 */
export function computeBudgetOverflowMessages(
  claimed: MessageRecord[],
  trimmed: MessageRecord[],
): MessageRecord[] {
  if (trimmed.length === 0) return claimed;
  const trimmedIds = new Set(trimmed.map((m) => m.id));
  return claimed.filter((m) => !trimmedIds.has(m.id));
}
