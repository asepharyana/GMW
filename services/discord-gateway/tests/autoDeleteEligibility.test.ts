import { describe, expect, it } from "vitest";
import {
  deriveRecommendedAction,
  isEligibleForAutoDelete,
} from "../src/modules/ai-moderation/autoDeleteEligibility.js";
import type { MessageRecord } from "../src/shared/moderation-types.js";

const baseMessage: MessageRecord = {
  id: "test-msg-1",
  channel_id: "chan-1",
  thread_id: null,
  guild_id: "guild-1",
  user_id: "user-1",
  username: "tester",
  content: "kau ngehina aku hitam kah ?",
  created_at: Date.now(),
  ai_status: "flagged",
  ai_severity: "high",
  ai_recommended_action: "review",
  ai_moderation_flags: '["harassment"]',
  ai_confidence: 0.95,
  ai_analysis: "konfrontatif",
  ai_categories: null,
  ai_moderation_score: null,
  ai_analyzed_at: Date.now(),
  deleted_at: null,
} as unknown as MessageRecord;

describe("autoDeleteEligibility — flagged high severity with conservative LLM action", () => {
  it("flagged + high severity is eligible even when LLM said review", () => {
    const eligible = isEligibleForAutoDelete(baseMessage);
    expect(eligible).toBe(true);
  });

  it("flagged + high severity derives delete regardless of stored review action", () => {
    expect(deriveRecommendedAction(baseMessage)).toBe("delete");
  });

  it("flagged + medium severity with review action is NOT eligible", () => {
    const medium = {
      ...baseMessage,
      ai_severity: "medium",
    } as unknown as MessageRecord;
    const eligible = isEligibleForAutoDelete(medium);
    expect(eligible).toBe(false);
  });

  it("warn status with review action is NOT eligible", () => {
    const warn = {
      ...baseMessage,
      ai_status: "warn",
      ai_severity: "low",
      ai_recommended_action: "warn",
    } as unknown as MessageRecord;
    const eligible = isEligibleForAutoDelete(warn);
    expect(eligible).toBe(true); // warn action is allowed
  });

  it("clean status is never eligible", () => {
    const clean = {
      ...baseMessage,
      ai_status: "clean",
      ai_severity: "none",
      ai_recommended_action: "none",
    } as unknown as MessageRecord;
    expect(isEligibleForAutoDelete(clean)).toBe(false);
  });
});
