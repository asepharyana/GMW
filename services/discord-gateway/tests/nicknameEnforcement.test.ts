// ═══════════════════════════════════════════════════════════════════════════
// Nickname-only enforcement — offensive username flag handling (pure, no DB)
// ═══════════════════════════════════════════════════════════════════════════
import { describe, expect, it } from "vitest";
import {
  isNicknameOnlyViolation,
  parseModerationFlags,
} from "../src/modules/ai-moderation/autoDeleteEligibility.js";
import type {
  AnalysisResult,
  MessageRecord,
} from "../src/modules/message-capture/types.js";

function msg(flagsJson: string | null): MessageRecord {
  return {
    id: "m1",
    guild_id: "g1",
    channel_id: "c1",
    thread_id: null,
    user_id: "u1",
    username: "user1",
    avatar_url: null,
    content: "halo semua",
    edited_content: null,
    created_at: Date.now(),
    edited_at: null,
    deleted_at: null,
    type: "text",
    is_reply: null,
    is_forward: null,
    is_crosspost: null,
    reference_message_id: null,
    reference_channel_id: null,
    reference_guild_id: null,
    metadata: null,
    ai_moderation_flags: flagsJson,
  };
}

describe("parseModerationFlags", () => {
  it("parses JSON array from stored column", () => {
    expect(parseModerationFlags(msg('["offensive_username","sara"]'))).toEqual([
      "offensive_username",
      "sara",
    ]);
  });

  it("returns [] for null / malformed values", () => {
    expect(parseModerationFlags(msg(null))).toEqual([]);
    expect(parseModerationFlags(msg("not-json"))).toEqual([]);
  });

  it("prefers structured analysisResult flags", () => {
    const result = { flags: ["vulgar_language"] } as AnalysisResult;
    expect(parseModerationFlags(msg('["old_flag"]'), result)).toEqual([
      "vulgar_language",
    ]);
  });
});

describe("isNicknameOnlyViolation", () => {
  it("true when the ONLY flag is offensive_username", () => {
    expect(isNicknameOnlyViolation(msg('["offensive_username"]'))).toBe(true);
  });

  it("false when other flags ride along (message itself violated)", () => {
    expect(isNicknameOnlyViolation(msg('["offensive_username","sara"]'))).toBe(
      false,
    );
    expect(isNicknameOnlyViolation(msg('["harassment"]'))).toBe(false);
  });

  it("false when no flags at all", () => {
    expect(isNicknameOnlyViolation(msg(null))).toBe(false);
    expect(isNicknameOnlyViolation(msg("[]"))).toBe(false);
  });
});
