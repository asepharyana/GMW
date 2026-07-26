import { createChildLogger } from "@bete/shared/logger";
import type { z } from "zod";
import type {
  RecommendedActionSchema,
  SeveritySchema,
} from "./moderationSchemas.js";

const log = createChildLogger("severityDeriver");

/**
 * Enhanced deferral detection pattern (R9).
 *
 * Only matches patterns where the model explicitly states it cannot make
 * a decision and needs human review. Removed overly broad patterns that
 * caused false positives:
 * - "admin (perlu|harus|sebaiknya)" → common in regular sentences
 * - "bisa (berpotensi|mengandung)" → decisive statements, not deferral
 * - "maaf|sorry" → opinions/apologies, not deferral
 * - "saya tidak yakin|tahu|paham" → expressing uncertainty, not deferral
 */
export const DEFERRAL_ANALYSIS_PATTERN =
  /(?:kurang (?:konteks|bukti|informasi|data) (?:untuk (?:menilai|menentukan|memutuskan)|untuk moderasi)|perlu (?:dicek|diperiksa|ditinjau|dikaji|dievaluasi) (?:oleh )?(?:admin|moderator|manusia|human review)|tidak (?:bisa|dapat|mampu) (?:menentukan|menilai|memastikan|menyimpulkan|memberi keputusan|memoderasi).*(?:karena (?:konteks tidak jelas|informasi tidak cukup|bukti kurang|konteks kurang|tidak cukup konteks)|data tidak cukup|informasi tidak lengkap)|cannot determine|insufficient (?:context|evidence|information) (?:to |for )?(?:moderate|judge|evaluate|decide|classify)|(?:sepertinya|tampaknya) (?:perlu|harus) (?:ditinjau|diperiksa|dicek) (?:oleh )?(?:admin|moderator)|tidak cukup (?:bukti|informasi|konteks) (?:untuk (?:memberikan|membuat|menentukan)|memutuskan))/i;

/**
 * Exceptions: patterns that look like deferral but are actually decisive.
 * Expanded to catch more variations where the model gives a clear verdict.
 */
export const DEFERRAL_EXCEPTION_PATTERN =
  /tidak bisa menentukan.*(?:karena|sebab|dengan alasan|sebab tidak ada).*(?:clean|tidak (?:ada|terdapat|menunjukkan).*(?:pelanggaran|masalah|indikasi|konten)|aman|bersih|normal)/i;

export function hasDeferralAnalysis(analysis: string): boolean {
  if (DEFERRAL_EXCEPTION_PATTERN.test(analysis)) return false;
  return DEFERRAL_ANALYSIS_PATTERN.test(analysis);
}

export function clampScore(value: number | undefined, fallback = 0): number {
  return Math.max(
    0,
    Math.min(1, Number.isFinite(value) ? (value as number) : fallback),
  );
}

export function deriveSeverity(
  status: "clean" | "warn" | "flagged",
  score: number,
): z.infer<typeof SeveritySchema> {
  if (status === "clean") return "none";
  if (status === "warn") return score >= 0.65 ? "medium" : "low";
  if (score >= 0.9) return "critical";
  return score >= 0.75 ? "high" : "medium";
}

export function deriveRecommendedAction(
  status: "clean" | "warn" | "flagged",
  severity: z.infer<typeof SeveritySchema>,
): z.infer<typeof RecommendedActionSchema> {
  if (status === "clean") return "none";
  if (status === "warn") return severity === "medium" ? "review" : "warn";
  if (severity === "critical") return "escalate";
  if (severity === "high") return "delete";
  return "review";
}

log.debug("severityDeriver loaded");
