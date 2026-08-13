// ═══════════════════════════════════════════════════════════════════════════════
// Screen share input resolution tests
//
// downloadScreenInput downloads the FULL merged video+audio media to a temp
// file first (yt-dlp `-o <tmpdir>/media.%(ext)s`), then returns the file
// path. Feeding a FILE path (not a live stdout pipe) to prepareStream is
// what makes ffmpeg `-re` pacing reliable — a pipe has unreliable PTS and
// caused the ~1fps force-duplication symptom.
//
// yt-dlp is faked via a PATH shim script so the test does not hit the
// network or need real binaries.
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { downloadScreenInput } from "../src/modules/voice-recording/mediaSource.js";

// ─── fake bin dir ──────────────────────────────────────────────────────────────
let fakeBinDir: string | null = null;
const realPath = process.env.PATH;

// Bash shim: find the -o pattern, substitute the extension, write 4096 bytes.
// Escaped as a separate string to keep the TS template literal simple.
const ytShimBody = `prev=""
out=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
if [ "$GMW_FAKE_YTDLP_FAIL" = "1" ]; then
  echo "ERROR: [youtube] ...: 403 Forbidden (access denied)" >&2
  exit 8
fi
target=$(printf '%s' "$out" | sed 's/%(ext)s/.mp4/')
head -c 4096 /dev/urandom > "$target"
exit 0
`;
const ytShim = `#!/usr/bin/env bash\n${ytShimBody}`;

const ytShimDump = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GMW_FAKE_YTDLP_DUMP_ARGS"
${ytShimBody}
`;

beforeAll(() => {
  fakeBinDir = mkdtempSync(join(tmpdir(), "gmw-fake-bins-"));
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

// ─── tests ─────────────────────────────────────────────────────────────────────
describe("downloadScreenInput", () => {
  it("downloads media to a temp file and returns its path", async () => {
    const mediaPath = await downloadScreenInput("https://youtu.be/abc");
    expect(typeof mediaPath).toBe("string");
    expect(mediaPath).toMatch(/gmw-ytdlp-/);
    const size = readFileSync(mediaPath).length;
    expect(size).toBeGreaterThan(0);
    // The fake yt-dlp writes 4096 bytes → the file must deliver them.
    expect(size).toBe(4096);
  });

  it("rejects when yt-dlp fails (transient 403) so the controller retries", async () => {
    process.env.GMW_FAKE_YTDLP_FAIL = "1";
    try {
      await expect(downloadScreenInput("https://youtu.be/abc")).rejects.toThrow(
        /403|exit 8|failed/i,
      );
    } finally {
      delete process.env.GMW_FAKE_YTDLP_FAIL;
    }
  });

  it("passes a file -o pattern (NOT `-o -`) to yt-dlp", async () => {
    const argsDump = join(
      tmpdir(),
      `gmw-ytargs-${process.pid}-${Date.now()}.txt`,
    );
    process.env.GMW_FAKE_YTDLP_DUMP_ARGS = argsDump;
    const realPath2 = process.env.PATH;
    const dir = fakeBinDir as unknown as string;
    const existing = join(dir, "yt-dlp");
    writeFileSync(existing, ytShimDump);
    chmodSync(existing, 0o755);
    try {
      const mediaPath = await downloadScreenInput("https://youtu.be/abc");
      expect(readFileSync(mediaPath).length).toBeGreaterThan(0);
      await new Promise((r) => setTimeout(r, 100));
      const args = readFileSync(argsDump, "utf8").trim();
      expect(args).not.toContain("-o -");
      expect(args).toContain("-o ");
      expect(args).toMatch(/gmw-ytdlp-/);
    } finally {
      delete process.env.GMW_FAKE_YTDLP_DUMP_ARGS;
      rmSync(argsDump, { force: true });
      process.env.PATH = realPath2;
    }
  });

  it("copies the on-disk cookies to a temp file instead of handing yt-dlp the original path", async () => {
    // Regression: recent yt-dlp rewrites `--cookies` file on close. If we hand
    // it the original system file (root-owned, not writable by the service
    // user), save-back throws PermissionError → exit 1 → screen share fails.
    // The copy lives in tmpdir where the service user owns it.
    const cookieDir = mkdtempSync(join(tmpdir(), "gmw-fake-cookies-"));
    const cookiePath = join(cookieDir, "ytcookies.txt");
    writeFileSync(
      cookiePath,
      "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tabc123\n",
    );
    const argsDump = join(
      tmpdir(),
      `gmw-ytargs-${process.pid}-${Date.now()}.txt`,
    );
    process.env.GMW_FAKE_YTDLP_DUMP_ARGS = argsDump;
    process.env.GMW_YT_COOKIES_PATH = cookiePath;
    const realPath2 = process.env.PATH;
    const dir = fakeBinDir as unknown as string;
    const existing = join(dir, "yt-dlp");
    writeFileSync(existing, ytShimDump);
    chmodSync(existing, 0o755);
    try {
      await downloadScreenInput("https://youtu.be/abc");
      await new Promise((r) => setTimeout(r, 100));
      const args = readFileSync(argsDump, "utf8").trim();
      expect(args).toContain("--cookies");
      const cookieArg = args
        .split(/\s+/)
        .at(args.split(/\s+/).indexOf("--cookies") + 1);
      expect(cookieArg).toBeDefined();
      expect(cookieArg).not.toBe(cookiePath); // never the original system file
      expect(cookieArg).toMatch(/gmw-ytcookies\.\d+\.txt/); // per-process temp copy
      expect(cookieArg).not.toMatch(/^\/etc\//);
    } finally {
      delete process.env.GMW_FAKE_YTDLP_DUMP_ARGS;
      delete process.env.GMW_YT_COOKIES_PATH;
      rmSync(argsDump, { force: true });
      rmSync(cookieDir, { recursive: true, force: true });
      process.env.PATH = realPath2;
    }
  });
});
