import type { z } from "zod";
import { createChildLogger } from "@/shared/logger/index";
import type { AnalysisResult } from "../message-capture/types.js";
import type {
  RecommendedActionSchema,
  SeveritySchema,
} from "./moderationSchemas.js";
import { ModerationResponseSchema } from "./moderationSchemas.js";

const log = createChildLogger("moderationResponseParser");

// ---------------------------------------------------------------------------
// JSON extraction (inlined from jsonExtractor.ts)
// ---------------------------------------------------------------------------

/**
 * Helper to extract JSON from a potentially conversational or markdown-wrapped string.
 */
export function extractJson(content: string): unknown {
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
  const matches = content.matchAll(codeBlockRegex);
  for (const match of matches) {
    const codeContent = match[1].trim();
    try {
      const parsed = JSON.parse(codeContent);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (err) {
      log.debug(
        { err: err instanceof Error ? err.message : String(err) },
        "Failed to parse JSON from code block — trying next block",
      );
    }
  }

  for (let start = 0; start < content.length; start++) {
    const firstChar = content[start];
    if (firstChar !== "{" && firstChar !== "[") continue;

    const stack = [firstChar];
    let inString = false;
    let escaped = false;

    for (let i = start + 1; i < content.length; i++) {
      const char = content[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{" || char === "[") {
        stack.push(char);
        continue;
      }

      const last = stack[stack.length - 1];
      if ((char === "}" && last === "{") || (char === "]" && last === "[")) {
        stack.pop();
        if (stack.length === 0) {
          const candidate = content.slice(start, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
          } catch (err) {
            log.debug(
              { err: err instanceof Error ? err.message : String(err) },
              "Failed to parse JSON candidate — trying next position",
            );
          }
          break;
        }
      }
    }
  }

  throw new Error("No JSON object found in response");
}

// ---------------------------------------------------------------------------
// Severity derivation (inlined from severityDeriver.ts)
// ---------------------------------------------------------------------------

/**
 * Enhanced deferral detection pattern (R9).
 */
export const DEFERRAL_ANALYSIS_PATTERN =
  /(?:kurang (?:konteks|bukti|informasi|data) (?:untuk (?:menilai|menentukan|memutuskan)|untuk moderasi)|perlu (?:dicek|diperiksa|ditinjau|dikaji|dievaluasi) (?:oleh )?(?:admin|moderator|manusia|human review)|tidak (?:bisa|dapat|mampu) (?:menentukan|menilai|memastikan|menyimpulkan|memberi keputusan|memoderasi).*(?:karena (?:konteks tidak jelas|informasi tidak cukup|bukti kurang|konteks kurang|tidak cukup konteks)|data tidak cukup|informasi tidak lengkap)|cannot determine|insufficient (?:context|evidence|information) (?:to |for )?(?:moderate|judge|evaluate|decide|classify)|(?:sepertinya|tampaknya) (?:perlu|harus) (?:ditinjau|diperiksa|dicek) (?:oleh )?(?:admin|moderator)|tidak cukup (?:bukti|informasi|konteks) (?:untuk (?:memberikan|membuat|menentukan)|memutuskan))/i;

/**
 * Exceptions: patterns that look like deferral but are actually decisive.
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

/**
 * Sanitize error messages for client-facing output (R10).
 * Internal details are logged but the caller gets a generic message.
 */
export function sanitizeErrorMessage(
  internalMsg: string,
  messageId: string,
): string {
  // Log the full error for debugging
  log.warn(
    { messageId, internalError: internalMsg },
    "Internal moderation error (sanitized for client)",
  );
  // Return generic message without internal details
  return `Analisis gagal dan memerlukan pemeriksaan manual. Error code: MOD_${Date.now().toString(36).slice(0, 6)}`;
}

/**
 * Strip generic clean-verdict closing phrases the LLM sometimes appends
 * ("Tidak ada indikasi pelanggaran.") even when it already described the
 * message content specifically. Keeps the substance, drops the boilerplate.
 * Only matches a TRAILING standalone phrase — never mid-analysis text.
 */
export const GENERIC_CLEAN_CLOSER =
  /\s*(?:(?:tidak ada (?:indikasi|tanda|temuan)(?: adanya)? pelanggaran(?: kebijakan| aturan)?)|(?:tidak ada (?:indikasi|tanda|temuan)(?: konten| pesan)? (?:yang )?melanggar)|(?:pesan (?:dianggap|tergolong|dinilai) bersih)|(?:tidak ditemukan (?:adanya )?pelanggaran))\.?\s*$/i;

export function sanitizeGenericCleanCloser(analysis: string): string {
  if (!analysis) return analysis;
  const cleaned = analysis.replace(GENERIC_CLEAN_CLOSER, "").trim();
  // Drop a dangling separator the removal may have left behind.
  return cleaned.replace(/(\s[.\-–—]\s*)$/, "").trim();
}

export function parseModerationResponse(
  content: string,
  targetIds: string[],
): AnalysisResult[] {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (_e) {
    parsed = extractJson(content);
  }

  if (Array.isArray(parsed)) {
    parsed = { results: parsed };
  } else if (parsed && typeof parsed === "object" && !("results" in parsed)) {
    if ("message_id" in parsed) {
      parsed = { results: [parsed] };
    } else {
      const arrayKey = Object.keys(parsed).find((key) => {
        const val = parsed[key];
        return (
          Array.isArray(val) &&
          val.length > 0 &&
          val.every(
            (item: unknown) =>
              typeof item === "object" &&
              item !== null &&
              "message_id" in (item as Record<string, unknown>),
          )
        );
      });
      if (arrayKey) {
        parsed.results = parsed[arrayKey];
      } else {
        parsed = { results: [parsed] };
      }
    }
  }

  const parseResult = ModerationResponseSchema.safeParse(parsed);
  if (!parseResult.success) {
    throw new Error(`Zod validation failed: ${parseResult.error.message}`);
  }

  const response = parseResult.data;
  const foundIds = new Set<string>();
  const targetIdSet = new Set(targetIds);

  const results: (AnalysisResult | null)[] = response.results.map((result) => {
    const {
      message_id,
      status,
      flags,
      score,
      analysis,
      categories,
      severity,
      confidence,
      recommended_action,
      policy_version,
      evidence,
    } = result;
    const finalId = message_id.trim();

    if (!targetIdSet.has(finalId)) {
      return null;
    }

    if (foundIds.has(finalId)) {
      throw new Error(
        `Duplicate message_id in moderation response: ${finalId}`,
      );
    }

    foundIds.add(finalId);

    const coalescedAnalysis = analysis ?? "";

    if (hasDeferralAnalysis(coalescedAnalysis)) {
      throw new Error(
        `Deferral analysis is not allowed for message ${finalId}; return a direct moderation decision`,
      );
    }

    const normalizedScore = clampScore(score);
    const normalizedConfidence = clampScore(confidence, normalizedScore);
    const normalizedSeverity =
      severity ?? deriveSeverity(status, normalizedScore);

    return {
      messageId: finalId,
      status: status as "clean" | "warn" | "flagged",
      flags: flags ?? [],
      score: normalizedScore,
      analysis: sanitizeGenericCleanCloser(coalescedAnalysis),
      categories: categories ?? flags ?? [],
      severity: normalizedSeverity,
      confidence: normalizedConfidence,
      recommendedAction:
        recommended_action ??
        deriveRecommendedAction(status, normalizedSeverity),
      policyVersion: policy_version ?? "default-2026-05-30",
      evidence: evidence ?? [],
    };
  });

  const filteredResults = results.filter(
    (r): r is AnalysisResult => r !== null,
  );

  const missingIds = targetIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    log.warn(
      { missingIds, foundCount: foundIds.size, totalCount: targetIds.length },
      "Some target IDs missing in response - marking as incomplete",
    );
    for (const missingId of missingIds) {
      filteredResults.push({
        messageId: missingId,
        status: "error",
        flags: ["analysis_incomplete"],
        score: 0,
        analysis: sanitizeErrorMessage(
          "Analysis incomplete - LLM did not process this message",
          missingId,
        ),
        categories: ["analysis_incomplete"],
        severity: "none",
        confidence: 0,
        recommendedAction: "review",
        policyVersion: "default-2026-05-30",
        evidence: [],
      });
    }
  }

  return filteredResults;
}
