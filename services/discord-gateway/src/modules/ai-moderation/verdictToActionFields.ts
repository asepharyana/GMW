import type { MessageRecord } from "../message-capture/types.js";

/**
 * Map a captured message's persisted AI verdict (the `ai_*` columns on
 * MessageRecord) into the explainability columns of a moderation action.
 *
 * This is READ-ONLY structured data — it never changes any enforcement
 * decision. It exists so the public web view can show *why* a message was
 * moderated, making GMW's automod transparent instead of a black box.
 *
 * All fields are null-safe: manual actions (e.g. command-handler bans) carry
 * no AI verdict, so they simply store nulls and the UI falls back to the
 * free-text `reason`.
 */
export function verdictToActionFields(message?: MessageRecord | null): {
  flags: string | null;
  categories: string | null;
  severity: string | null;
  confidence: number | null;
  score: number | null;
  evidence: string | null;
  policy_version: string | null;
} {
  if (!message) {
    return {
      flags: null,
      categories: null,
      severity: null,
      confidence: null,
      score: null,
      evidence: null,
      policy_version: null,
    };
  }

  // ai_moderation_flags / ai_categories are stored as JSON-stringified TEXT
  // (see messagesAnalysis.buildAIAnalysisSet → stringifyAIList). Pass them
  // through verbatim so the backend can JSON.parse them back into arrays.
  return {
    flags: message.ai_moderation_flags ?? null,
    categories: message.ai_categories ?? null,
    severity: message.ai_severity ?? null,
    confidence: message.ai_confidence ?? null,
    score: message.ai_moderation_score ?? null,
    evidence: null, // not persisted on MessageRecord; reserved for future use
    policy_version: null, // set by caller if a policy version is available
  };
}
