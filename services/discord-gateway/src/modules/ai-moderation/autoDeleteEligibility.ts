import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import type {
  AnalysisResult,
  MessageRecord,
} from "../message-capture/types.js";

const logger = createChildLogger("auto-delete-eligibility");

/** Parse a config value that may be a JSON array string or a comma-separated list. */
export function parseStringList(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

/** Derive severity from legacy messages that lack structured AI fields. */
export function deriveSeverity(msg: MessageRecord): string {
  if (msg.ai_severity) return msg.ai_severity;
  const score = msg.ai_confidence ?? msg.ai_moderation_score ?? 0;
  if (msg.ai_status === "flagged")
    return score >= 0.9 ? "critical" : score >= 0.7 ? "high" : "medium";
  if (msg.ai_status === "warn") return score >= 0.6 ? "medium" : "low";
  return "none";
}

/** Derive recommended action from legacy messages that lack structured AI fields. */
export function deriveRecommendedAction(msg: MessageRecord): string {
  if (msg.ai_recommended_action) return msg.ai_recommended_action;
  const severity = deriveSeverity(msg);
  if (
    msg.ai_status === "flagged" &&
    (severity === "critical" || severity === "high")
  )
    return "delete";
  if (msg.ai_status === "flagged") return "review";
  if (msg.ai_status === "warn") return "warn";
  return "none";
}

/**
 * Check whether a message qualifies for auto-deletion.
 * Uses the structured `analysisResult` fields when provided, falling back
 * to legacy message-level AI fields otherwise.
 */
export function isEligibleForAutoDelete(
  message: MessageRecord,
  analysisResult?: AnalysisResult,
): boolean {
  // If analysisResult is provided, use its status field; otherwise use message.ai_status
  const status = analysisResult?.status ?? message.ai_status;

  if (status !== "flagged" && status !== "warn") {
    logger.debug(
      { messageId: message.id, status },
      "Message not eligible for auto-delete: status is not flagged or warn",
    );
    return false;
  }

  // Confidence check
  const confidence =
    analysisResult?.confidence ??
    message.ai_confidence ??
    message.ai_moderation_score ??
    0;
  if (confidence < config.AUTO_DELETE_MIN_CONFIDENCE) {
    logger.debug(
      {
        messageId: message.id,
        confidence,
        threshold: config.AUTO_DELETE_MIN_CONFIDENCE,
      },
      "Message not eligible for auto-delete: confidence below threshold",
    );
    return false;
  }

  // Severity check
  const severity = analysisResult?.severity ?? deriveSeverity(message);
  const allowedSeverities = parseStringList(
    config.AUTO_DELETE_ALLOWED_SEVERITIES,
  );
  if (allowedSeverities.length > 0 && !allowedSeverities.includes(severity)) {
    logger.debug(
      { messageId: message.id, severity, allowed: allowedSeverities },
      "Message not eligible for auto-delete: severity not in allowed list",
    );
    return false;
  }

  // Recommended action check
  const recommendedAction =
    analysisResult?.recommendedAction ?? deriveRecommendedAction(message);
  if (recommendedAction !== "delete" && recommendedAction !== "escalate") {
    logger.debug(
      { messageId: message.id, recommendedAction },
      "Message not eligible for auto-delete: recommended action is not delete/escalate",
    );
    return false;
  }

  // Categories check
  const allowedCategories = parseStringList(
    config.AUTO_DELETE_ALLOWED_CATEGORIES,
  );
  if (allowedCategories.length > 0) {
    const messageCategories =
      analysisResult?.categories ??
      parseStringList(message.ai_categories ?? message.ai_moderation_flags);
    const hasAllowedCategory = messageCategories.some((cat) =>
      allowedCategories.includes(cat),
    );
    if (!hasAllowedCategory) {
      logger.debug(
        {
          messageId: message.id,
          categories: messageCategories,
          allowed: allowedCategories,
        },
        "Message not eligible for auto-delete: no allowed categories match",
      );
      return false;
    }
  }

  // Excluded channels check
  const excludedChannels = parseStringList(
    config.AUTO_DELETE_EXCLUDED_CHANNEL_IDS,
  );
  if (excludedChannels.length > 0) {
    const channelId = message.thread_id ?? message.channel_id;
    if (excludedChannels.includes(channelId)) {
      logger.debug(
        { messageId: message.id, channelId },
        "Message not eligible for auto-delete: channel excluded",
      );
      return false;
    }
  }

  // Excluded users check
  const excludedUsers = parseStringList(config.AUTO_DELETE_EXCLUDED_USER_IDS);
  if (excludedUsers.length > 0 && excludedUsers.includes(message.user_id)) {
    logger.debug(
      { messageId: message.id, userId: message.user_id },
      "Message not eligible for auto-delete: user excluded",
    );
    return false;
  }

  return true;
}
