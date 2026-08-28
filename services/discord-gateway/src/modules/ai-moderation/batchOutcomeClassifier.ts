/**
 * batchOutcomeClassifier.ts
 *
 * Pure partitioner of the batch worker response.
 */

export interface BatchRowLike {
  id?: string;
  ai_status?: string | null;
  ai_moderation_flags?: string | null;
}

export interface BatchWorkerResponseLike {
  ok?: boolean;
  rows?: BatchRowLike[];
  error?: string;
}

/** One target's per-message disposition after a batch attempt. */
export type BatchTargetKind =
  | "completed"
  | "incomplete"
  | "parse_failed"
  | "api_failed";

function flagsOf(row: { ai_moderation_flags?: string | null }): string[] {
  if (!row.ai_moderation_flags) return [];
  try {
    const parsed = JSON.parse(row.ai_moderation_flags) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Partition the input message ids into per-message dispositions for one batch
 * worker response. Pure: no DB/Piscina/logger — unit-testable directly.
 *
 * Priority per id: completed row → flag-based failure kinds → unexplained
 * missing (treated like incomplete).
 */
export function partitionBatchOutcome(
  messages: ReadonlyArray<{ id: string }>,
  response: BatchWorkerResponseLike,
): Map<string, BatchTargetKind> {
  const rowsById = new Map(
    (response.rows ?? [])
      .filter((r): r is BatchRowLike & { id: string } => Boolean(r?.id))
      .map((r) => [r.id, r]),
  );

  const out = new Map<string, BatchTargetKind>();
  for (const msg of messages) {
    const row = rowsById.get(msg.id);
    if (!row) {
      // Unexplained drop: LLM silently omitted it. Same retryable bucket as
      // analysis_incomplete — never a silent success.
      out.set(msg.id, "incomplete");
      continue;
    }
    if (row.ai_status !== "error") {
      out.set(msg.id, "completed");
      continue;
    }
    const flags = flagsOf(row);
    if (flags.includes("analysis_incomplete")) {
      out.set(msg.id, "incomplete");
    } else if (flags.includes("analysis_parse_failed")) {
      out.set(msg.id, "parse_failed");
    } else if (flags.includes("analysis_api_failed")) {
      out.set(msg.id, "api_failed");
    } else {
      out.set(msg.id, "incomplete");
    }
  }
  return out;
}
