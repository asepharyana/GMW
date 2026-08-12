// ═══════════════════════════════════════════════════════════════════════════════
// Screen share input resolution tests
//
// getDirectScreenInput now streams the merged video+audio media straight from
// yt-dlp stdout (`-o -`) — same auth-handling mechanism as resolveMediaUrl for
// music. There is no manual URL fetch or local ffmpeg merge anymore.
//
// yt-dlp is faked via a PATH shim script so the test does not hit the network
// or need real binaries.
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

  // Fake yt-dlp: streams a few bytes to stdout (like `yt-dlp -o -` does).
  // Modes (env):
  //   GMW_FAKE_YTDLP_FAIL=1 → stderr 403 + exit 8 WITHOUT stdout bytes
  //                           (mimics a download rejected by YouTube).
  const ytShim = `#!/usr/bin/env bash
if [ "$GMW_FAKE_YTDLP_FAIL" = "1" ]; then
  echo "ERROR: [youtube] ...: 403 Forbidden (access denied)" >&2
  exit 8
fi
# Fake yt-dlp — ignore args, emit a few bytes so consumers see a live stream.
head -c 4096 /dev/urandom
exit 0
`;
  writeFileSync(join(fakeBinDir, "yt-dlp"), ytShim);
  chmodSync(join(fakeBinDir, "yt-dlp"), 0o755);

  process.env.PATH = `${fakeBinDir}:${process.env.PATH}`;
});

afterAll(() => {
  if (fakeBinDir) {
    rmSync(fakeBinDir, { recursive: true, force: true });
  }
  process.env.PATH = realPath;
});

// ─── helpers ───────────────────────────────────────────────────────────────────
function consumeStream(stream: Readable): Promise<string> {
  return new Promise<string>((resolve) => {
    let got = 0;
    stream.on("data", (chunk: Buffer) => {
      got += chunk.length;
    });
    stream.on("error", () => resolve(`error-after-${got}B`));
    stream.on("end", () => resolve(`end-after-${got}B`));
    stream.resume();
  });
}

// ─── tests ─────────────────────────────────────────────────────────────────────
describe("getDirectScreenInput", () => {
  it("returns a live Readable and streams media bytes from yt-dlp stdout", async () => {
    const result = await getDirectScreenInput("https://youtu.be/abc");
    expect(Readable.isReadable(result)).toBe(true);

    const outcome = await consumeStream(result);
    // The fake yt-dlp emits 4096 bytes → the stream must deliver them.
    expect(outcome).toMatch(/^(error|end)-after-[1-9]\d*B$/);
  });

  it("destroys the stream with an error when yt-dlp fails before producing data (transient 403)", async () => {
    // Simulate the production failure: yt-dlp's downloader hits a transient
    // YouTube 403 and exits non-zero WITHOUT emitting a single byte. The
    // returned Readable must terminate with zero bytes (error OR end) so the
    // controller's resolveInputWithRetry retries with a fresh run instead of
    // streaming a silent black tile.
    process.env.GMW_FAKE_YTDLP_FAIL = "1";
    try {
      const result = await getDirectScreenInput("https://youtu.be/abc");
      expect(Readable.isReadable(result)).toBe(true);

      const outcome = await consumeStream(result);
      expect(outcome).toMatch(/^(error|end)-after-0B$/);
    } finally {
      delete process.env.GMW_FAKE_YTDLP_FAIL;
    }
  });

  it("passes -o - (stdout streaming) and a temp dir to yt-dlp", async () => {
    const argsDump = join(
      tmpdir(),
      `gmw-ytargs-${process.pid}-${Date.now()}.txt`,
    );
    process.env.GMW_FAKE_YTDLP_DUMP_ARGS = argsDump;
    // Augment the fake to dump its argv.
    const shim = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GMW_FAKE_YTDLP_DUMP_ARGS"
head -c 4096 /dev/urandom
exit 0
`;
    const realPath2 = process.env.PATH;
    const dir = fakeBinDir as unknown as string;
    const existing = join(dir, "yt-dlp");
    // Overwrite with the argv-dumping variant.
    writeFileSync(existing, shim);
    chmodSync(existing, 0o755);
    try {
      const result = await getDirectScreenInput("https://youtu.be/abc");
      await consumeStream(result);
      await new Promise((r) => setTimeout(r, 100));
      const args = readFileSync(argsDump, "utf8").trim();
      expect(args).toContain("-o -");
      expect(args).toMatch(/gmw-ytdlp-/);
    } finally {
      delete process.env.GMW_FAKE_YTDLP_DUMP_ARGS;
      rmSync(argsDump, { force: true });
      process.env.PATH = realPath2;
    }
  });
});
