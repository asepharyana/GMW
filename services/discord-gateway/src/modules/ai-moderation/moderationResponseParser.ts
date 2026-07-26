import { createChildLogger } from "@bete/shared/logger";
import type { AnalysisResult } from "../message-capture/types.js";
import { extractJson } from "./jsonExtractor.js";
import { ModerationResponseSchema } from "./moderationSchemas.js";
import {
  clampScore,
  deriveRecommendedAction,
  deriveSeverity,
  hasDeferralAnalysis,
} from "./severityDeriver.js";

const log = createChildLogger("moderationResponseParser");

/**
 * Re-export deferral patterns for backward compatibility.
 * See severityDeriver.ts for the full regex definitions.
 */
export {
  DEFERRAL_ANALYSIS_PATTERN,
  DEFERRAL_EXCEPTION_PATTERN,
} from "./severityDeriver.js";

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
      analysis: coalescedAnalysis,
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
