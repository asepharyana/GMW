// ═══════════════════════════════════════════════════════════════════════════════
// Screen share input resolution tests
//
// Verifies the decision logic of getDirectScreenInput:
//  - merged progressive URL → returned directly
//  - video+audio DASH pair → local ffmpeg merge (Readable)
//  - neither → rejection
//
// Both yt-dlp and ffmpeg are faked via PATH shim scripts so the test does not
// hit the network or need real binaries.
// ═══════════════════════════════════════════════════════════════════════════════

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDirectScreenInput } from "../src/modules/voice-recording/mediaSource.js";

// ─── fake bin dir ──────────────────────────────────────────────────────────────
let fakeBinDir: string | null = null;
const realPath = process.env.PATH;

beforeAll(() => {
  fakeBinDir = mkdtempSync(join(tmpdir(), "gmw-fake-bins-"));

  // Fake yt-dlp: prints the JSON file named in GMW_FAKE_YTDLP_JSON.
  // If the file is missing → exits 1 (mimics yt-dlp failure).
  const ytShim = `#!/usr/bin/env bash
if [ -n "$GMW_FAKE_YTDLP_JSON" ] && [ -f "$GMW_FAKE_YTDLP_JSON" ]; then
  cat "$GMW_FAKE_YTDLP_JSON"
  exit 0
fi
echo "yt-dlp: fake JSON missing" >&2
exit 1
`;
  writeFileSync(join(fakeBinDir, "yt-dlp"), ytShim);
  chmodSync(join(fakeBinDir, "yt-dlp"), 0o755);

  // Fake ffmpeg: writes a small nut-ish payload to stdout so the returned
  // Readable actually emits data (the merge path in mergeScreenStreams).
  const ffShim = `#!/usr/bin/env bash
# Fake ffmpeg — ignore args, emit a few bytes so consumers see a live stream.
head -c 4096 /dev/urandom
exit 0
`;
  writeFileSync(join(fakeBinDir, "ffmpeg"), ffShim);
  chmodSync(join(fakeBinDir, "ffmpeg"), 0o755);

  process.env.PATH = `${fakeBinDir}:${process.env.PATH}`;
});

afterAll(() => {
  if (fakeBinDir) {
    rmSync(fakeBinDir, { recursive: true, force: true });
  }
  process.env.PATH = realPath;
});

// ─── helpers ───────────────────────────────────────────────────────────────────
function writeFakeJson(payload: Record<string, unknown>): string {
  const p = join(
    tmpdir(),
    `gmw-fake-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  writeFileSync(p, JSON.stringify(payload));
  return p;
}

function dashPairInfo(videoUrl: string, audioUrl: string) {
  return {
    url: null,
    acodec: "none", // top-level is not a single merged format
    vcodec: "av01",
    requested_formats: [
      {
        format_id: "136",
        vcodec: "avc1.4d401f",
        acodec: "none",
        url: videoUrl,
      },
      { format_id: "140", vcodec: "none", acodec: "mp4a.40.2", url: audioUrl },
    ],
  };
}

// ─── tests ─────────────────────────────────────────────────────────────────────
describe("getDirectScreenInput", () => {
  it("returns the single merged progressive URL when the info has one", async () => {
    process.env.GMW_FAKE_YTDLP_JSON = writeFakeJson({
      url: "https://cdn.example/progressive.mp4",
      acodec: "mp4a.40.2",
      vcodec: "avc1",
    });
    const result = await getDirectScreenInput("https://youtu.be/abc");
    expect(result).toBe("https://cdn.example/progressive.mp4");
  });

  it("returns a live Readable when a video+audio DASH pair must be merged", async () => {
    process.env.GMW_FAKE_YTDLP_JSON = writeFakeJson(
      dashPairInfo(
        "https://cdn.example/video.mp4",
        "https://cdn.example/audio.m4a",
      ),
    );
    const result = await getDirectScreenInput("https://youtu.be/abc");
    expect(Readable.isReadable(result)).toBe(true);

    // The fake ffmpeg emits bytes; collect a chunk to prove the stream flows.
    const bytes = await new Promise<number>((resolve, reject) => {
      const stream = result as Readable;
      let got = 0;
      stream.on("data", (chunk: Buffer) => {
        got += chunk.length;
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(got));
      stream.resume();
    });
    expect(bytes).toBeGreaterThan(0);
  });

  it("rejects when yt-dlp returns neither a merged URL nor a format pair", async () => {
    process.env.GMW_FAKE_YTDLP_JSON = writeFakeJson({
      url: null,
      acodec: "none",
      vcodec: "none",
      requested_formats: [],
    });
    await expect(getDirectScreenInput("https://youtu.be/abc")).rejects.toThrow(
      /neither a merged progressive URL nor a video\+audio/,
    );
  });

  it("rejects when yt-dlp exits non-zero", async () => {
    process.env.GMW_FAKE_YTDLP_JSON = "/nonexistent/gmw-fake.json";
    await expect(getDirectScreenInput("https://youtu.be/abc")).rejects.toThrow(
      /screen input resolution exited with code 1/,
    );
  });
});
