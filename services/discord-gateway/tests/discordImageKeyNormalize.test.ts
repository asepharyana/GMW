// ═══════════════════════════════════════════════════════════════════════════
// normalizeDiscordImageUrl — unified vision cache keys for Discord CDN URLs
// ═══════════════════════════════════════════════════════════════════════════
// Design (2026-08-24): the same attachment reached through different signed
// URLs (?ex=&is=&hm= tokens rotate per fetch) or render variants
// (?format=&width=) must map to ONE vision-cache key, otherwise the vision
// model re-downloads and re-analyzes the identical image once per variant.
import { describe, expect, it } from "vitest";
import {
  makeImageCacheKey,
  normalizeDiscordImageUrl,
} from "../src/modules/ai-moderation/textCacheStore.js";

describe("normalizeDiscordImageUrl", () => {
  it("strips rotating signed tokens from cdn.discordapp.com URLs", () => {
    const a = normalizeDiscordImageUrl(
      "https://cdn.discordapp.com/attachments/1/2/img.png?ex=67a&is=67b&hm=tokA",
    );
    const b = normalizeDiscordImageUrl(
      "https://cdn.discordapp.com/attachments/1/2/img.png?ex=78c&is=78d&hm=tokB",
    );
    expect(a).toBe("https://cdn.discordapp.com/attachments/1/2/img.png");
    expect(a).toBe(b);
  });

  it("strips render variants from media.discordapp.net URLs", () => {
    const a = normalizeDiscordImageUrl(
      "https://media.discordapp.net/attachments/1/2/img.png?format=webp&width=400&height=300",
    );
    const b = normalizeDiscordImageUrl(
      "https://media.discordapp.net/attachments/1/2/img.png?format=png&width=1024&height=768",
    );
    expect(a).toBe(b);
    expect(a).toBe("https://media.discordapp.net/attachments/1/2/img.png");
  });

  it("strips query params from images-ext preview hosts", () => {
    const a = normalizeDiscordImageUrl(
      "https://images-ext-1.discordapp.net/external/X/https/example.com/cat.jpg?format=webp",
    );
    expect(a).toBe(
      "https://images-ext-1.discordapp.net/external/X/https/example.com/cat.jpg",
    );
  });

  it("leaves URLs without query untouched", () => {
    const u = "https://cdn.discordapp.com/attachments/1/2/img.png";
    expect(normalizeDiscordImageUrl(u)).toBe(u);
  });

  it("leaves non-Discord URLs untouched (query may be meaningful)", () => {
    const u = "https://example.com/image?token=abc&id=1";
    expect(normalizeDiscordImageUrl(u)).toBe(u);
  });

  it("leaves data: URLs untouched", () => {
    const u = "data:image/png;base64,iVBORw0KGgoAAAANS?weird=query";
    // new URL() parses data: with protocol "data:" → not http(s) → untouched.
    expect(normalizeDiscordImageUrl(u)).toBe(u);
  });
});

describe("makeImageCacheKey — Discord URL unification", () => {
  it("produces the SAME key for the same attachment across token variants", () => {
    const keyA = makeImageCacheKey(
      "https://cdn.discordapp.com/attachments/9/8/pic.png?ex=111&is=222&hm=AAA",
    );
    const keyB = makeImageCacheKey(
      "https://cdn.discordapp.com/attachments/9/8/pic.png?ex=333&is=444&hm=BBB",
    );
    expect(keyA).toBe(keyB);
  });

  it("still produces DIFFERENT keys for different attachments", () => {
    const keyA = makeImageCacheKey(
      "https://cdn.discordapp.com/attachments/9/8/a.png?ex=1",
    );
    const keyB = makeImageCacheKey(
      "https://cdn.discordapp.com/attachments/9/8/b.png?ex=1",
    );
    expect(keyA).not.toBe(keyB);
  });

  it("preserves the historical full-hash behavior for non-Discord URLs", () => {
    // Regression guard: external URLs keep pre-change keys.
    const key = makeImageCacheKey("https://example.com/x.png");
    expect(key).toBe(makeImageCacheKey("https://example.com/x.png"));
  });
});
