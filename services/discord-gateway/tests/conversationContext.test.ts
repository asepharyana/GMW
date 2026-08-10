// ═══════════════════════════════════════════════════════════════════════════
// Conversation context v2 — recency gating + location context (pure, no DB)
// ═══════════════════════════════════════════════════════════════════════════
import { describe, expect, it } from "vitest";
import {
  buildConversationContext,
  buildLocationContext,
} from "../src/modules/ai-moderation/conversationContext.js";
import { extractOgMeta } from "../src/modules/ai-moderation/urlFetcher.js";
import type { MessageRecord } from "../src/modules/message-capture/types.js";

const NOW = 1_800_000_000_000;

function msg(id: string, createdAt: number, content = "hai"): MessageRecord {
  return {
    id,
    guild_id: "g1",
    channel_id: "c1",
    thread_id: null,
    user_id: `u_${id}`,
    username: `user_${id}`,
    avatar_url: null,
    content,
    edited_content: null,
    created_at: createdAt,
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
  };
}

function target(id = "t1", createdAt = NOW): MessageRecord {
  return {
    ...msg(id, createdAt),
    content: "pesan yang dianalisis",
  };
}

const MIN = 60_000;

describe("buildConversationContext — recency gating", () => {
  it("keeps an ONGOING conversation — recent messages, small gaps", () => {
    const context = [
      msg("a", NOW - 8 * MIN),
      msg("b", NOW - 6 * MIN),
      msg("c", NOW - 4 * MIN),
      msg("d", NOW - 2 * MIN),
    ];
    const { lines, descriptor, dropped } = buildConversationContext({
      contextBefore: context,
      targets: [target()],
      maxTokens: 8000,
      gapMs: 12 * MIN,
      maxAgeMs: 45 * MIN,
    });
    expect(lines).toHaveLength(4);
    expect(dropped).toBe(0);
    expect(descriptor).toContain("status=ongoing");
  });

  it("drops messages before a silence gap — conversation RESTARTED", () => {
    const context = [
      msg("old1", NOW - 40 * MIN),
      msg("old2", NOW - 38 * MIN),
      msg("fresh", NOW - 5 * MIN),
    ];
    const { lines, descriptor, dropped } = buildConversationContext({
      contextBefore: context,
      targets: [target()],
      maxTokens: 8000,
      gapMs: 12 * MIN,
      maxAgeMs: 45 * MIN,
    });
    // 40min-old messages are within maxAge but 33min before "fresh" → gap gate
    expect(lines.some((l) => l.includes("old1"))).toBe(false);
    expect(lines.some((l) => l.includes("fresh"))).toBe(true);
    expect(dropped).toBe(2);
    expect(descriptor).toContain("status=sparse");
    expect(descriptor).toContain("gap_before_min=");
  });

  it("drops everything older than maxAge — stale noise, cold_start anchor kept", () => {
    const context = [
      msg("ancient", NOW - 120 * MIN),
      msg("stale", NOW - 60 * MIN),
    ];
    const { lines, descriptor, dropped } = buildConversationContext({
      contextBefore: context,
      targets: [target()],
      maxTokens: 8000,
      gapMs: 12 * MIN,
      maxAgeMs: 45 * MIN,
    });
    // Age gate drops both from the real context block, but the cold-start
    // anchor keeps the nearest 2 so the LLM still senses the channel.
    expect(dropped).toBe(2);
    expect(descriptor).toContain("status=cold_start");
    expect(lines).toHaveLength(2);
  });

  it("keeps a 2-message anchor on cold start so the LLM senses the channel", () => {
    const context = [
      msg("far1", NOW - 100 * MIN),
      msg("far2", NOW - 99 * MIN),
      msg("near1", NOW - 50 * MIN),
    ];
    const { lines, descriptor } = buildConversationContext({
      contextBefore: context,
      targets: [target()],
      maxTokens: 8000,
      gapMs: 12 * MIN,
      maxAgeMs: 45 * MIN,
    });
    expect(lines).toHaveLength(2); // nearest 2 kept as anchor
    expect(lines.some((l) => l.includes("near1"))).toBe(true);
    expect(descriptor).toContain("status=cold_start");
  });

  it("respects the token budget (older lines dropped first)", () => {
    const context = Array.from({ length: 20 }, (_, i) =>
      msg(`m${i}`, NOW - (i + 1) * MIN),
    );
    const { lines } = buildConversationContext({
      contextBefore: context,
      targets: [target()],
      maxTokens: 600,
      gapMs: 12 * MIN,
      maxAgeMs: 45 * MIN,
    });
    expect(lines.length).toBeLessThan(20);
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe("buildLocationContext — channel/thread/nsfw enrichment", () => {
  it("renders channel name + thread name from captured metadata", () => {
    const t = target();
    t.metadata = JSON.stringify({
      channel: {
        channelName: "general",
        threadName: "tanya coding",
        nsfw: false,
        ageRestricted: false,
      },
    });
    const line = buildLocationContext([t]);
    expect(line).toContain("[location]");
    expect(line).toContain('name="general"');
    expect(line).toContain('thread_name="tanya coding"');
    expect(line).toContain("nsfw=false");
  });

  it("returns empty when no metadata", () => {
    expect(buildLocationContext([target()])).toBe("");
  });
});

describe("extractOgMeta — page title/site for <web_content>", () => {
  it("extracts og:title, og:description and og:site_name", () => {
    const html = `
      <html><head>
        <title>Fallback title</title>
        <meta property="og:title" content="Judul Halaman &amp; Keren" />
        <meta property="og:description" content="Deskripsi halaman" />
        <meta property="og:site_name" content="Contoh Site" />
        <meta property="og:image" content="https://img.example.com/x.png" />
      </head></html>`;
    const meta = extractOgMeta(html);
    expect(meta.title).toBe("Judul Halaman & Keren");
    expect(meta.description).toBe("Deskripsi halaman");
    expect(meta.siteName).toBe("Contoh Site");
  });

  it("falls back to <title> when og:title missing", () => {
    const html = "<html><head><title>Plain Title</title></head></html>";
    expect(extractOgMeta(html).title).toBe("Plain Title");
  });
});
