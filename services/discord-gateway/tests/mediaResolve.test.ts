// ═══════════════════════════════════════════════════════════════════════════════
// resolveMediaUrl (music playback) resolution tests
//
// Guards the yt-dlp stdout-vs-stderr contract that broke music playback:
//   - with `-o -` yt-dlp streams media on STDOUT and emits `--print`
//     title/duration headers on STDERR
//   - resolveMediaUrl must read headers from stderr and return the stdout
//     media stream UNTOUCHED (the old code stripped binary "lines" from the
//     WebM container, corrupting it → silent playback)
//
// yt-dlp is faked via a PATH shim; no network or real binaries needed.
// ═══════════════════════════════════════════════════════════════════════════════

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveMediaUrl } from "../src/modules/voice-recording/mediaSource.js";

// ─── fake bin dir ──────────────────────────────────────────────────────────────
let fakeBinDir: string | null = null;
const realPath = process.env.PATH;

/** WebM-ish payload: EBML magic + a few bytes that must survive untouched. */
const MEDIA_PAYLOAD = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f]), // EBML magic
  Buffer.from("fake-webm-cluster-data\nwith-newlines\n", "utf8"),
  Buffer.from([0x00, 0x11, 0x22, 0x33, 0x0a, 0xff, 0xee]),
]);

beforeAll(() => {
  fakeBinDir = mkdtempSync(join(tmpdir(), "gmw-fake-media-resolve-"));

  // Fake yt-dlp: reads GMW_FAKE_STDERR (what to write on stderr) and
  // GMW_FAKE_STDOUT (what to write on stdout, default = MEDIA_PAYLOAD).
  // Written with string concat so bash `${...}` isn't TS-interpolated.
  const ytShim =
    "#!/usr/bin/env bash\n" +
    'if [ -f "$GMW_FAKE_STDERR" ]; then cat "$GMW_FAKE_STDERR" >&2; fi\n' +
    'if [ -f "$GMW_FAKE_STDOUT" ]; then cat "$GMW_FAKE_STDOUT"; fi\n' +
    "exit " +
    (process.env.GMW_FAKE_EXIT ?? "0") +
    "\n";
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
function writeTemp(name: string, content: Buffer | string): string {
  const p = join(
    tmpdir(),
    `gmw-resolve-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`,
  );
  writeFileSync(p, content);
  return p;
}

function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// ─── tests ─────────────────────────────────────────────────────────────────────
describe("resolveMediaUrl", () => {
  it("reads title+duration from STDERR and returns the untouched stdout media", async () => {
    const stderrPath = writeTemp("stderr", "【Test】Song Title\n184.5\n");
    const stdoutPath = writeTemp("stdout", MEDIA_PAYLOAD);
    process.env.GMW_FAKE_STDERR = stderrPath;
    process.env.GMW_FAKE_STDOUT = stdoutPath;
    process.env.GMW_FAKE_EXIT = "0";

    const resolution = await resolveMediaUrl("https://youtu.be/abc");

    expect(resolution.title).toBe("【Test】Song Title");
    expect(resolution.duration).toBeCloseTo(184.5, 1);

    const bytes = await collect(resolution.stream);
    expect(bytes).toEqual(MEDIA_PAYLOAD); // byte-for-byte intact
  });

  it("skips [info] prefix lines before the title header", async () => {
    const stderrPath = writeTemp(
      "stderr",
      "[info] Downloading webpage\nTitle After Info\n123\n",
    );
    const stdoutPath = writeTemp("stdout", MEDIA_PAYLOAD);
    process.env.GMW_FAKE_STDERR = stderrPath;
    process.env.GMW_FAKE_STDOUT = stdoutPath;
    process.env.GMW_FAKE_EXIT = "0";

    const resolution = await resolveMediaUrl("https://youtu.be/abc");

    expect(resolution.title).toBe("Title After Info");
    expect(resolution.duration).toBe(123);
  });

  it("rejects when yt-dlp reports an ERROR on stderr", async () => {
    const stderrPath = writeTemp(
      "stderr",
      "ERROR: [youtube] xyz: This video is unavailable\n",
    );
    process.env.GMW_FAKE_STDERR = stderrPath;
    delete process.env.GMW_FAKE_STDOUT;
    process.env.GMW_FAKE_EXIT = "1";

    await expect(resolveMediaUrl("https://youtu.be/abc")).rejects.toThrow(
      /This video is unavailable/,
    );
  });

  it("rejects when yt-dlp is not installed", async () => {
    const oldPath = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin"; // no fake yt-dlp
    await expect(resolveMediaUrl("https://youtu.be/abc")).rejects.toThrow(
      /yt-dlp is not installed/,
    );
    process.env.PATH = oldPath;
  });
});
