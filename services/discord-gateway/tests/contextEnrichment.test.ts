// ═══════════════════════════════════════════════════════════════════════════
// Context enrichment builders — rich <user_reputation> attrs, <user_history>,
// <user_profiles> as_of, bot/edited detection (pure, no DB)
// ═══════════════════════════════════════════════════════════════════════════
import { describe, expect, it } from "vitest";
import {
  buildUserHistoryXml,
  buildUserProfilesBlock,
  formatReputationAttrs,
  resolveIsBot,
  resolveIsEdited,
} from "../src/modules/ai-moderation/moderationBuilders.js";
import type { MessageRecord } from "../src/modules/message-capture/types.js";

const NOW = 1_800_000_000_000;

function msg(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "m1",
    guild_id: "g1",
    channel_id: "c1",
    thread_id: null,
    user_id: "u1",
    username: "user1",
    avatar_url: null,
    content: "hai",
    edited_content: null,
    created_at: NOW,
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
    ...overrides,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe("formatReputationAttrs — rich reputation signal", () => {
  it("emits trust, infraction count and clean streak", () => {
    const attrs = formatReputationAttrs({
      trust_score: 62,
      total_infractions: 3,
      clean_message_streak: 45,
      last_infraction_at: null,
    });
    expect(attrs).toContain('trust_score="62"');
    expect(attrs).toContain('total_infractions="3"');
    expect(attrs).toContain('clean_streak="45"');
  });

  it("derives last_offense_days_ago and marks repeat offenders (7-day window)", () => {
    const attrs = formatReputationAttrs(
      {
        trust_score: 50,
        total_infractions: 2,
        clean_message_streak: 0,
        last_infraction_at: NOW - 2 * DAY_MS,
      },
      NOW,
    );
    expect(attrs).toContain('last_offense_days_ago="2"');
    expect(attrs).toContain('repeat_offender="true"');
  });

  it("does NOT mark repeat offender when the last offense is older than 7 days", () => {
    const attrs = formatReputationAttrs(
      {
        trust_score: 50,
        total_infractions: 2,
        clean_message_streak: 10,
        last_infraction_at: NOW - 30 * DAY_MS,
      },
      NOW,
    );
    expect(attrs).toContain('last_offense_days_ago="30"');
    expect(attrs).not.toContain("repeat_offender");
  });

  it("omits offense-derived attrs when the user has no recorded infraction date", () => {
    const attrs = formatReputationAttrs({
      trust_score: 85,
      total_infractions: 0,
      clean_message_streak: 120,
      last_infraction_at: null,
    });
    expect(attrs).not.toContain("last_offense_days_ago");
    expect(attrs).not.toContain("repeat_offender");
  });

  it("clamps a future/skewed timestamp to days_ago=0", () => {
    const attrs = formatReputationAttrs(
      {
        trust_score: 50,
        total_infractions: 1,
        clean_message_streak: 0,
        last_infraction_at: NOW + 5 * DAY_MS,
      },
      NOW,
    );
    expect(attrs).toContain('last_offense_days_ago="0"');
  });
});

describe("buildUserHistoryXml — last flagged messages for repeat offenders", () => {
  it("returns empty when there is no real history", () => {
    expect(buildUserHistoryXml([])).toBe("");
    expect(
      buildUserHistoryXml([{ content: "   ", severity: "low", created_at: 1 }]),
    ).toBe("");
  });

  it("renders <infraction> rows with severity and recency", () => {
    const xml = buildUserHistoryXml(
      [
        {
          content: "beli barang murah disini https://scam.example",
          severity: "high",
          created_at: NOW - 3 * DAY_MS,
        },
      ],
      NOW,
    );
    expect(xml).toContain("<user_history>");
    expect(xml).toContain('severity="high"');
    expect(xml).toContain('time_ago_days="3"');
    expect(xml).toContain("beli barang murah disini");
  });

  it("caps long snippets and XML-escapes content", () => {
    const xml = buildUserHistoryXml(
      [
        {
          content: "x".repeat(300),
          severity: "low",
          created_at: NOW - DAY_MS,
        },
      ],
      NOW,
    );
    expect(xml.length).toBeLessThan(250);
  });
});

describe("buildUserProfilesBlock — deduplicated map with staleness", () => {
  it("emits as_of when the profile has a last-generated timestamp", () => {
    const block = buildUserProfilesBlock(
      new Map([
        [
          "u1",
          {
            text: "Developer teknis, bahasa Indonesia",
            asOf: NOW - 3 * DAY_MS,
          },
        ],
      ]),
    );
    expect(block).toContain('<user_profile user_id="u1"');
    expect(block).toContain(
      `as_of="${new Date(NOW - 3 * DAY_MS).toISOString()}"`,
    );
    expect(block).toContain("Developer teknis");
  });

  it("omits as_of when absent, and drops empty profiles", () => {
    const block = buildUserProfilesBlock(
      new Map([
        ["u1", { text: "profil aktif", asOf: null }],
        ["u2", { text: "   " }],
      ]),
    );
    expect(block).toContain('user_id="u1"');
    expect(block).not.toContain("as_of");
    expect(block).not.toContain("u2");
  });

  it("returns empty for no profiles", () => {
    expect(buildUserProfilesBlock(new Map())).toBe("");
  });
});

describe("resolveIsBot / resolveIsEdited — message flags", () => {
  it("reads author.bot from captured metadata", () => {
    const bot = msg({
      metadata: JSON.stringify({
        author: { id: "x", username: "bot", bot: true },
      }),
    });
    const human = msg({
      metadata: JSON.stringify({
        author: { id: "y", username: "user", bot: false },
      }),
    });
    expect(resolveIsBot(bot)).toBe(true);
    expect(resolveIsBot(human)).toBe(false);
    expect(resolveIsBot(msg())).toBe(false);
  });

  it("flags edited content only when edited_content is present (the edit path)", () => {
    expect(resolveIsEdited(msg({ edited_content: "versi baru" }))).toBe(true);
    expect(resolveIsEdited(msg())).toBe(false);
  });
});
