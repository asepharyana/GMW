/**
 * fallbackResultClassifier.ts
 *
 * Pure classifier for the individual-fallback worker response.
 *
 * Bug history (2026-08-24): the worker's upload-pending race guard returned
 * `{ ok: true, results: [] }` (a legacy "no results yet" signal), but the
 * processor treated ANY `ok:true` as a successful moderation. Empty results
 * meant nothing was written to the DB — the message stayed stuck in
 * `ai_status='processing'` with nobody watching it until the 300s cleanup
 * reverted it. That single gap produced the ~330-400s attachment delay
 * cluster. Classification now happens in ONE pure function so every outcome
 * has an explicit, testable owner.
 */

export type WorkerResultKind =
  | "success"
  | "upload_pending"
  | "incomplete"
  | "error";

export interface ClassifiableWorkerResult {
  ok?: boolean;
  /** Upload-pending marker set by ai-analysis-worker's race guard. */
  uploadPending?: boolean;
  results?: Array<{ status?: string; flags?: string[] | string } | undefined>;
  error?: string;
}

function flagsOf(r: { flags?: string[] | string }): string[] {
  if (!r.flags) return [];
  if (Array.isArray(r.flags)) return r.flags;
  try {
    const parsed = JSON.parse(r.flags) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Classify an individual-fallback worker response:
 * - "upload_pending": explicit race-guard signal — retry shortly, NOT an error.
 * - "success": at least one result and none is analysis_incomplete.
 * - "incomplete": LLM ran but dropped/failed this message after retries
 *   (analysis_incomplete flag) — terminal exhausted path.
 * - "error": anything else (ok:false, or ok:true with NO explainable
 *   results). The old code silently succeeded here — never again.
 */
export function classifyIndividualWorkerResult(
  result: ClassifiableWorkerResult,
): WorkerResultKind {
  if (result.uploadPending === true) return "upload_pending";
  const results = (result.results ?? []).filter(
    (r): r is NonNullable<typeof r> => Boolean(r),
  );
  if (results.length === 0) return "error";
  if (result.ok !== true) return "error";
  for (const r of results) {
    const flags = flagsOf(r);
    if (flags.includes("analysis_incomplete")) return "incomplete";
    if ((r.status ?? "") === "") return "error";
  }
  return "success";
}
