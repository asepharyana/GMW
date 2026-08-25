/**
 * batchOutcomeClassifier.ts
 *
 * Pure partitioner of the batch worker response (2026-08-25).
 *
 * Bug history: the batch race guard returned `{ok:true, rows:[]}` when every
 * target's attachment upload was still in-flight. The processor classified all
 * of them as "incomplete" and fanned out to the individual queue, where the
 * guard there requeued + rescheduled at the 250ms debounce — a hot ~300ms loop
 * for the entire upload duration (~10 cycles in 3s in prod logs). Root fix:
 * the worker now reports `uploadPendingIds` explicitly and this pure function
 * partitions the outcome so upload-pending targets NEVER enter the fanout.
 */

export interface BatchRowLike {
  id?: string;
  ai_status?: string | null;
  ai_moderation_flags?: string | null;
}

export interface BatchWorkerResponseLike {
  ok?: boolean;
  rows?: BatchRowLike[];
  /** Explicit race-guard signal from the worker (2026-08-25). */
  uploadPendingIds?: string[];
  error?: string;
}

/** One target's per-message disposition after a batch attempt. */
export type BatchTargetKind =
  | "completed"
  | "upload_pending"
  | "incomplete"
  | "parse_failed"
  | "api_failed";

function flagsOf(row: { ai_moderation_flags?: string | null }): string[] {
  if (!row.ai_moderation_flags) return [];
  try {
    const parsed = JSON.parse(row.ai_moderation_flags) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [] as string[];
  }
}

/**
 * Partition the input message ids into per-message dispositions for one batch
 * worker response. Pure: no DB/Piscina/logger — unit-testable directly.
 *
 * Priority per id: explicit uploadPendingIds → completed row → flag-based
 * failure kinds → unexplained missing (treated like incomplete).
 */
export function partitionBatchOutcome(
  messages: ReadonlyArray<{ id: string }>,
  response: BatchWorkerResponseLike,
): Map<string, BatchTargetKind> {
  const pendingSet = new Set(response.uploadPendingIds ?? []);
  const rowsById = new Map(
    (response.rows ?? [])
      .filter((r): r is BatchRowLike & { id: string } => Boolean(r?.id))
      .map((r) => [r.id, r]),
  );

  const out = new Map<string, BatchTargetKind>();
  for (const msg of messages) {
    if (pendingSet.has(msg.id)) {
      out.set(msg.id, "upload_pending");
      continue;
    }
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

/**
 * Linear backoff ramp for consecutive upload-pending polls:
 * poll N (1-based) waits min(base × N, cap). Keeps latency low for fast
 * uploads while bounding total polling cost for long uploads.
 */
export function computeUploadPollDelayMs(
  consecutivePolls: number,
  baseMs: number,
  capMs: number,
): number {
  const n = Math.max(1, Math.floor(consecutivePolls));
  return Math.min(Math.round(baseMs * n), Math.round(capMs));
}
