// ═══════════════════════════════════════════════════════════════════════════
// makeImageCacheKey — regression for hash collision bug
// ═══════════════════════════════════════════════════════════════════════════
// Bug (2026-08-12): makeImageCacheKey() only hashed the first 128 chars of the
// data URL. Since all resized images share the same MIME prefix
// ('data:image/png;base64,') + identical base64 header bytes, nearly every
// image got the SAME hash → 'image:<same-hash>' → all images reused the
// first cached vision analysis ("konten judi").
//
// Fix: hash the ENTIRE data URL. This test verifies the fix and prevents
// regression.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeImageCacheKey } from "../src/modules/ai-moderation/textCacheStore.js";

function oldBuggyHash(dataUrl: string): string {
  const prefix = dataUrl.slice(0, 128);
  return `image:${createHash("sha256").update(prefix).digest("hex").slice(0, 16)}`;
}

describe("makeImageCacheKey — collision prevention", () => {
  it("produces different keys for images whose first 128 chars are identical", () => {
    // Two data URLs that SHARE the first 128 chars (same MIME + identical
    // base64 header) but differ after — this is the real-world scenario
    // that caused the collision bug.
    const sharedPrefix =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" +
      "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // pad to >128 chars

    const imgA = `${sharedPrefix}UNIQUE_TO_A`;
    const imgB = `${sharedPrefix}UNIQUE_TO_B`;

    // Under the OLD buggy scheme: same prefix → same hash → COLLISION
    expect(oldBuggyHash(imgA)).toBe(oldBuggyHash(imgB));

    // Under the FIXED scheme: full data URL hashed → different keys
    const keyA = makeImageCacheKey(imgA);
    const keyB = makeImageCacheKey(imgB);
    expect(keyA).not.toBe(keyB);
  });

  it("produces same key for identical input", () => {
    const dataUrl = "data:image/png;base64,samebase64dataheremari";
    expect(makeImageCacheKey(dataUrl)).toBe(makeImageCacheKey(dataUrl));
  });

  it("prefix is always 'image:'", () => {
    const key = makeImageCacheKey("data:image/png;base64,test");
    expect(key.startsWith("image:")).toBe(true);
  });
});
