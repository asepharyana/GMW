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

import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  // Modes (env):
  //   GMW_FAKE_FFMPEG_FAIL=1  → exit 1, no stdout (mimics transient 403)
  //   GMW_FAKE_FFMPEG_DUMP_ARGS=<file> → append argv to the file (asserts
  //     flags like -headers are forwarded to the merge process)
  const ffShim = `#!/usr/bin/env bash
if [ -n "$GMW_FAKE_FFMPEG_DUMP_ARGS" ]; then
  printf '%s\\n' "$*" >> "$GMW_FAKE_FFMPEG_DUMP_ARGS"
fi
if [ "$GMW_FAKE_FFMPEG_FAIL" = "1" ]; then
  echo "403 Forbidden" >&2
  exit 8
fi
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

  it("terminates with ZERO bytes when the merge ffmpeg fails before producing data (transient 403)", async () => {
    // Simulate the 11:50 production failure: yt-dlp resolves fine, but the
    // merge ffmpeg hits a transient YouTube 403 and exits non-zero WITHOUT
    // emitting a single byte. getDirectScreenInput still resolves (the
    // Readable exists) — the fail-fast contract: the stream must terminate
    // (error OR end — the end-before-exit ordering makes both possible)
    // without ever delivering a frame to a consumer. The controller's
    // resolveInputWithRetry turns either signal into a fresh retry.
    process.env.GMW_FAKE_YTDLP_JSON = writeFakeJson(
      dashPairInfo(
        "https://cdn.example/video.mp4",
        "https://cdn.example/audio.m4a",
      ),
    );
    process.env.GMW_FAKE_FFMPEG_FAIL = "1";
    try {
      const result = await getDirectScreenInput("https://youtu.be/abc");
      expect(Readable.isReadable(result)).toBe(true);

      const outcome = await new Promise<string>((resolve) => {
        const stream = result as Readable;
        let got = 0;
        stream.on("data", (chunk: Buffer) => {
          got += chunk.length;
        });
        stream.on("error", () => resolve(`error-after-${got}B`));
        stream.on("end", () => resolve(`end-after-${got}B`));
        stream.resume();
      });
      // Fail-fast: the consumer must NOT receive any bytes (no black-tile
      // zombie stream). Either a destroyed-with-error stream or a clean
      // end-before-exit is a valid terminal state — the caller retries.
      expect(outcome).toMatch(/^(error|end)-after-0B$/);
    } finally {
      delete process.env.GMW_FAKE_FFMPEG_FAIL;
    }
  });

  it("forwards yt-dlp http_headers to the merge ffmpeg (-headers)", async () => {
    const info = dashPairInfo(
      "https://cdn.example/video.mp4",
      "https://cdn.example/audio.m4a",
    );
    // Add the browser-like headers yt-dlp attaches to signed DASH URLs.
    (info.requested_formats[0] as Record<string, unknown>).http_headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://www.youtube.com/",
    };
    const argsDump = join(
      tmpdir(),
      `gmw-ffargs-${process.pid}-${Date.now()}.txt`,
    );
    process.env.GMW_FAKE_YTDLP_JSON = writeFakeJson(info);
    process.env.GMW_FAKE_FFMPEG_DUMP_ARGS = argsDump;
    try {
      const result = await getDirectScreenInput("https://youtu.be/abc");
      // Consume the stream so the merge ffmpeg process runs to completion.
      await new Promise<void>((resolve) => {
        const stream = result as Readable;
        stream.on("data", () => {});
        stream.on("error", () => resolve());
        stream.on("end", () => resolve());
        stream.resume();
      });
      // Allow the fake ffmpeg to flush its argv dump.
      await new Promise((r) => setTimeout(r, 100));
      const args = readFileSync(argsDump, "utf8").trim();
      expect(args).toContain("-headers");
      expect(args).toContain("Mozilla/5.0");
      expect(args).toContain("Referer: https://www.youtube.com/");
    } finally {
      delete process.env.GMW_FAKE_FFMPEG_DUMP_ARGS;
      rmSync(argsDump, { force: true });
    }
  });
});
