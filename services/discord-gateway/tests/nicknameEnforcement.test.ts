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

function msg(
  flagsJson: string | null,
  analysis?: string | null,
): MessageRecord {
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
    ai_analysis: analysis ?? null,
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

  // ── Safety-net: content-level flags mis-applied to a username-only offense ──

  it("true: partial flags sara/conflict + analysis attributes violation to username with clean content (matikanetanyahu case)", () => {
    const analysis =
      "Pengirim menggunakan username 'matikanetanyahu' yang menyerang tokoh politik terkait konflik Israel-Palestina. Meskipun isi pesan membahas alasan hilangnya tugas, keberadaan username tersebut tetap melanggar aturan server.";
    expect(
      isNicknameOnlyViolation(msg('["sara","conflict_instigation"]', analysis)),
    ).toBe(true);
  });

  it("true: sara-only flag + analysis clearly attributes to username with clean content", () => {
    const analysis =
      "Username mengandung referensi politik (Netanyahu), tapi isi pesan hanya obrolan biasa tanpa diskusi politik. Warning ringan untuk username saja.";
    expect(isNicknameOnlyViolation(msg('["sara"]', analysis))).toBe(true);
  });

  it("false: username-attributable flags but analysis lacks clean-content signal", () => {
    const analysis =
      "Pengirim mengkritik kebijakan luar negeri Israel secara eksplisit di dalam pesan. Pelanggaran diskusi topik terlarang.";
    expect(
      isNicknameOnlyViolation(msg('["sara","conflict_instigation"]', analysis)),
    ).toBe(false);
  });

  it("false: mixed flags including a real content violation, even with clean analysis", () => {
    const analysis =
      "Username ofensif dan isi pesan berisi ancaman kekerasan terarah.";
    expect(isNicknameOnlyViolation(msg('["sara","violence"]', analysis))).toBe(
      false,
    );
  });

  it("false: username-attributable flags but no analysis text available", () => {
    expect(isNicknameOnlyViolation(msg('["sara"]', null))).toBe(false);
  });
});
