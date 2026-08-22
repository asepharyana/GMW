import { type ChildProcess, spawn } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, type Readable } from "node:stream";
import { StreamType } from "@discordjs/voice";
import { createChildLogger } from "@/shared/logger/index";

const logger = createChildLogger("media-source");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaInfo {
  title: string;
  duration: number;
  thumbnail?: string;
}

export interface MediaSourceResolution {
  stream: Readable;
  type: StreamType;
  title?: string;
  duration?: number;
  info: MediaInfo;
}

export interface ResolveOptions {
  /** Timeout in milliseconds for the yt-dlp process. */
  timeout?: number;
  /**
   * yt-dlp format string override (e.g. "bestaudio[ext=m4a]").
   * Defaults to "bestaudio[ext=m4a]/bestaudio/best".
   */
  quality?: string;
}

export interface TranscodeResult {
  stream: Readable;
  /** Kill the ffmpeg child (used on stop/skip). */
  cleanup: () => void;
}

/**
 * Re-encode a source stream to high-quality OggOpus (48kHz stereo, 192kbps).
 *
 * Discord voice downmixes whatever we feed it to the channel's bitrate, so the
 * best we can do is hand it a clean 48kHz stereo Opus stream instead of the
 * raw source (which may be mono, low-bitrate, or a non-Opus container). The
 * volume is baked into the encode with `-af volume=` so the player does not
 * need inlineVolume re-encoding (double lossy encode).
 */
export function transcodeToHighQualityOgg(
  input: Readable,
  volume: number,
): TranscodeResult {
  const proc = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-c:a",
      "libopus",
      "-b:a",
      "192k",
      "-af",
      `volume=${volume}`,
      "-f",
      "ogg",
      "pipe:1",
    ],
    { stdio: ["pipe", "pipe", "ignore"] },
  );

  input.pipe(proc.stdin);
  // ffmpeg teardown closes stdin while the upstream source may still write —
  // swallow EPIPE / destroyed-stream errors so they don't crash the gateway.
  proc.stdin.on("error", (err: NodeJS.ErrnoException) => {
    if (
      err.code === "EPIPE" ||
      err.code === "ERR_STREAM_DESTROYED" ||
      err.code === "ERR_STREAM_WRITE_AFTER_END"
    ) {
      logger.debug(
        { code: err.code },
        "Transcode stdin closed during teardown",
      );
    } else {
      logger.error({ error: err.message }, "Transcode stdin error");
    }
  });
  activeProcesses.add(proc);

  const cleanup = () => {
    activeProcesses.delete(proc);
    if (proc.exitCode === null) {
      proc.kill("SIGKILL");
    }
  };

  proc.once("exit", () => activeProcesses.delete(proc));

  // If ffmpeg fails, surface the error to the consumer stream so the
  // AudioPlayer's error handler can advance the queue.
  const output = proc.stdout;
  output.on("error", () => cleanup());

  return { stream: output, cleanup };
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Tracks all spawned yt-dlp child processes for shutdown cleanup. */
const activeProcesses: Set<ChildProcess> = new Set();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSeconds(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read the first two newline-delimited lines from a Readable stdout stream.
 *
 * yt-dlp with `--print before_dl:title --print before_dl:duration` outputs:
 *   line 1: video title
 *   line 2: duration in seconds (float)
 *   rest:   raw binary audio data
 *
 * Returns the parsed header and a new Readable that contains all remaining
 * data (the audio stream).
 */
const MAX_HEADER_BUFFER = 65536; // 64KB safety limit for metadata headers

/**
 * Read the title + duration header lines from yt-dlp's STDERR.
 *
 * When yt-dlp streams media to stdout (`-o -`) it redirects its `--print`
 * output to STDERR so the media stream on stdout stays clean. The first two
 * meaningful lines on stderr are then the title and (before_dl) duration.
 *
 * Blank lines and `[...]` info prefixes are skipped. An `ERROR:` line is
 * reported via `onError` so a failing download surfaces as a resolution error
 * instead of a silent empty stream.
 */
function readStderrHeader(
  stderr: Readable,
  onError: (message: string) => void,
  maxBufferSize: number = MAX_HEADER_BUFFER,
): Promise<{ title: string; duration: number }> {
  return new Promise((resolve) => {
    let buffer = "";
    let title = "";
    let duration = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      stderr.removeListener("data", onData);
      resolve({ title, duration });
    };

    const onData = (chunk: Buffer) => {
      if (done) return;
      buffer += chunk.toString("utf8");
      if (buffer.length > maxBufferSize) {
        finish();
        return;
      }
      while (!done) {
        const nl = buffer.indexOf("\n");
        if (nl === -1) break; // need more data
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);

        if (line.length === 0) continue; // blank line
        if (line.startsWith("[")) continue; // "[info] ..." — not a header
        if (line.startsWith("ERROR")) {
          onError(line);
          finish();
          return;
        }
        if (!title) {
          title = line;
        } else {
          duration = parseSeconds(line);
          finish();
          return;
        }
      }
    };

    stderr.on("data", onData);
    stderr.on("end", finish);
  });
}

function buildNotInstalledError(): Error {
  return new Error(
    "yt-dlp is not installed or not found in PATH. " +
      'Run "pnpm run install:yt-dlp" to install it.',
  );
}

/**
 * Build the yt-dlp --cookies args. YouTube blocks anonymous embeds with a
 * "Sign in to confirm you're not a bot" 403 unless yt-dlp is given a logged-
 * in account's cookies. The path is configurable via GMW_YT_COOKIES_PATH
 * (default: the BWS-provided file the deploy writes to /etc/.../ytcookies.txt).
 * If the file doesn't exist we pass nothing and fall back to anon (YouTube
 * may 403 — playback will fail gracefully, not crash).
 */
var _cachedCookiePath: string | null = null;
function buildCookieArgs(): string[] {
  // Single source of truth: BWS injects the account cookies via env
  // (gmw_yt_downloader_cookies → GMW_YT_DOWNLOADER_COOKIES by bws-exec).
  // We materialize them to a temp Netscape file because yt-dlp --cookies
  // only accepts a file path, not stdin, and multiline env values are not
  // reliable to pass directly on the spawn argv. Falls back to the on-disk
  // file at GMW_YT_COOKIES_PATH (or /etc/gmw-discord-gateway/ytcookies.txt)
  // which the Nix deploy writes from BWS once at start.
  if (_cachedCookiePath) return ["--cookies", _cachedCookiePath];
  const envCookies = process.env.GMW_YT_DOWNLOADER_COOKIES?.trim();
  if (envCookies?.includes("LOGIN_INFO")) {
    const fdPath = join(tmpdir(), `gmw-ytcookies.${process.pid}.txt`);
    writeFileSync(fdPath, envCookies);
    try {
      chmodSync(fdPath, 0o600);
    } catch {
      /* best-effort */
    }
    _cachedCookiePath = fdPath;
    logger.info(
      { cookiePath: fdPath, source: "GMW_YT_DOWNLOADER_COOKIES env" },
      "Using YouTube cookies (from BWS env)",
    );
    return ["--cookies", fdPath];
  }
  const cookiePath =
    process.env.GMW_YT_COOKIES_PATH ?? "/etc/gmw-discord-gateway/ytcookies.txt";
  try {
    if (cookiePath && existsSync(cookiePath)) {
      // Never hand the ORIGINAL system file to yt-dlp: recent yt-dlp rewrites
      // the cookie file on close (`--cookies` implies write-back). The system
      // file is owned by another user (root/deploy) and the service user
      // cannot write it → PermissionError → yt-dlp exits 1 → playback
      // fails for every attempt. Copy to a per-run temp file (like the env
      // branch above) so write-back lands somewhere we own; if the original
      // is not readable we fall back to anonymous (YouTube may 403 → the
      // screen-share controller retries via Invidious mirrors without auth).
      let cookieContents: string;
      try {
        cookieContents = readFileSync(cookiePath, "utf8");
      } catch {
        logger.warn(
          { cookiePath },
          "Cookie file not readable; continuing without cookies (anon)",
        );
        return [];
      }
      const fdPath = join(tmpdir(), `gmw-ytcookies.${process.pid}.txt`);
      writeFileSync(fdPath, cookieContents);
      try {
        chmodSync(fdPath, 0o600);
      } catch {
        /* best-effort */
      }
      _cachedCookiePath = fdPath;
      logger.info(
        { cookiePath: fdPath, source: "on-disk file (copied)" },
        "Using YouTube cookies for yt-dlp",
      );
      return ["--cookies", fdPath];
    }
  } catch {
    /* ignore — fallback to anon */
  }
  logger.warn(
    "No YouTube cookies available; yt-dlp will use anonymous (YouTube may 403)",
  );
  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a media URL (YouTube, Spotify, etc.) to a playable audio stream.
 *
 * Spawns `yt-dlp` with `-o -` so the raw audio bytes stream on stdout. Since
 * stdout is the media sink, yt-dlp emits its `--print before_dl:title` /
 * `before_dl:duration` header lines on STDERR — the title + duration are read
 * from there and the stdout media stream is returned untouched.
 *
 * The returned stream uses `StreamType.Arbitrary` — suitable for
 * `DiscordPlayer.playStream()` with `inputType: StreamType.Arbitrary`.
 *
 * @throws If yt-dlp is not installed or the process exits with a non-zero code
 *         before the metadata headers have been parsed.
 */
export function resolveMediaUrl(
  url: string,
  options?: ResolveOptions,
): Promise<MediaSourceResolution> {
  return new Promise<MediaSourceResolution>((resolve, reject) => {
    // Fallback chain: YouTube gets progressive m4a audio; direct-file hosts
    // (upload mirror / Telegram files) expose a single generic format with an
    // arbitrary ID — `bestaudio` alone fails there ("Requested format is not
    // available"), so fall back to `bestaudio` then plain `best`.
    const format = options?.quality ?? "bestaudio[ext=m4a]/bestaudio/best";
    const cookieArgs = buildCookieArgs();
    const args = [
      "-f",
      format,
      "-o",
      "-",
      "--no-progress",
      "--no-warnings",
      ...cookieArgs,
      "--print",
      "before_dl:title",
      "--print",
      "before_dl:duration",
      url,
    ];

    logger.info({ url }, "Spawning yt-dlp for media resolution");

    const proc = spawn("yt-dlp", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    activeProcesses.add(proc);

    // With `-o -` yt-dlp streams the raw audio on stdout and moves its
    // `--print` headers to stderr — pipe stdout immediately so the child
    // never blocks on a full pipe while we wait for the headers on stderr.
    const mediaStream = new PassThrough();
    // Teardown (player stop / ffmpeg exit) destroys this stream while
    // yt-dlp may still push bytes — without a listener an EPIPE /
    // ERR_STREAM_DESTROYED surfaces as an uncaughtException.
    mediaStream.on("error", (err: NodeJS.ErrnoException) => {
      if (
        err.code === "EPIPE" ||
        err.code === "ERR_STREAM_DESTROYED" ||
        err.code === "ERR_STREAM_WRITE_AFTER_END"
      ) {
        logger.debug({ code: err.code }, "Media stream closed during teardown");
      } else {
        logger.error({ error: err.message }, "Media stream error");
      }
    });
    proc.stdout.pipe(mediaStream);

    let stderrBuf = "";
    let resolved = false;

    // -- helpers -----------------------------------------------------------

    const failOnce = (err: Error) => {
      if (resolved) return;
      resolved = true;
      activeProcesses.delete(proc);
      mediaStream.destroy();
      reject(err);
    };

    const resolveOnce = (info: MediaInfo) => {
      if (resolved) return;
      resolved = true;
      activeProcesses.delete(proc);
      resolve({
        stream: mediaStream,
        type: StreamType.Arbitrary,
        title: info.title,
        duration: info.duration,
        info,
      });
    };

    // -- spawn error (ENOENT etc.) ----------------------------------------

    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        failOnce(buildNotInstalledError());
      } else {
        failOnce(new Error(`yt-dlp failed to start: ${err.message}`));
      }
    });

    // -- stderr: title + duration headers ---------------------------------
    // Capture raw stderr too, for the exit-diagnostics in the close handler.

    const _MAX_STDERR = 4096;
    if (proc.stderr) {
      proc.stderr.on("data", (chunk: Buffer) => {
        if (stderrBuf.length < _MAX_STDERR) {
          stderrBuf += chunk
            .toString("utf8")
            .slice(0, _MAX_STDERR - stderrBuf.length);
        }
      });
    }

    readStderrHeader(proc.stderr, (message) => {
      failOnce(new Error(message));
    })
      .then(({ title, duration }) => {
        resolveOnce({ title: title || url, duration });
      })
      .catch((err: Error) => {
        failOnce(err);
      });

    // -- process exit (non-zero means failure) -----------------------------

    proc.on("close", (code, signal) => {
      activeProcesses.delete(proc);

      if (resolved) return;

      if (code !== null && code !== 0) {
        const detail = stderrBuf.trim() ? `: ${stderrBuf.trim()}` : "";
        failOnce(new Error(`yt-dlp exited with code ${code}${detail}`));
      } else if (signal) {
        failOnce(new Error(`yt-dlp was killed by signal ${signal}`));
      } else {
        // Exited cleanly but the header lines never surfaced (e.g. a direct
        // file URL with no duration) — keep the media stream alive anyway.
        resolveOnce({ title: url, duration: 0 });
      }
    });

    // -- optional timeout --------------------------------------------------

    if (options?.timeout && options.timeout > 0) {
      const timer = setTimeout(() => {
        if (resolved) return;
        logger.warn({ url, timeout: options.timeout }, "yt-dlp timed out");
        proc.kill("SIGTERM");
        failOnce(new Error(`yt-dlp timed out after ${options.timeout}ms`));
      }, options.timeout);

      proc.once("close", () => clearTimeout(timer));
    }
  });
}

/**
 * Extract metadata (title, duration, thumbnail) from a media URL
 * without downloading the audio stream.
 *
 * Uses `yt-dlp --dump-json` and parses the JSON output.
 *
 * @throws If yt-dlp is not installed or the process exits with a non-zero
 *         code.
 */
export async function extractMediaInfo(url: string): Promise<MediaInfo> {
  return new Promise<MediaInfo>((resolve, reject) => {
    const args = ["--dump-json", "--no-warnings", url];

    logger.debug({ url }, "Spawning yt-dlp for metadata extraction");

    const proc = spawn("yt-dlp", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    activeProcesses.add(proc);

    let stdoutBuf = "";
    let stderrBuf = "";
    const MAX_STDERR = 4096;
    const MAX_STDOUT = 1_048_576; // 1MB safety limit

    if (proc.stdout) {
      proc.stdout.on("data", (chunk: Buffer) => {
        if (stdoutBuf.length < MAX_STDOUT) {
          stdoutBuf += chunk
            .toString("utf8")
            .slice(0, MAX_STDOUT - stdoutBuf.length);
        }
      });
    }

    if (proc.stderr) {
      proc.stderr.on("data", (chunk: Buffer) => {
        if (stderrBuf.length < MAX_STDERR) {
          stderrBuf += chunk
            .toString("utf8")
            .slice(0, MAX_STDERR - stderrBuf.length);
        }
      });
    }

    proc.on("error", (err: NodeJS.ErrnoException) => {
      activeProcesses.delete(proc);
      if (err.code === "ENOENT") {
        reject(buildNotInstalledError());
      } else {
        reject(new Error(`yt-dlp failed to start: ${err.message}`));
      }
    });

    proc.on("close", (code) => {
      activeProcesses.delete(proc);

      if (code !== 0) {
        const detail = stderrBuf.trim() ? `: ${stderrBuf.trim()}` : "";
        reject(
          new Error(
            `yt-dlp metadata extraction exited with code ${code}${detail}`,
          ),
        );
        return;
      }

      try {
        const raw = JSON.parse(stdoutBuf.trim()) as Record<string, unknown>;
        resolve({
          title: String(raw.title ?? url),
          duration: typeof raw.duration === "number" ? raw.duration : 0,
          thumbnail: String(raw.thumbnail ?? "") || undefined,
        });
      } catch (parseErr) {
        reject(
          new Error(
            `Failed to parse yt-dlp JSON output: ${(parseErr as Error).message}`,
          ),
        );
      }
    });
  });
}

/**
 * Kill all active yt-dlp / screen-share merge ffmpeg child processes.
 *
 * Call during graceful shutdown to ensure no orphan processes remain.
 */
export function cleanup(): void {
  if (activeProcesses.size === 0) return;

  logger.info(
    { count: activeProcesses.size },
    "Killing active yt-dlp processes",
  );

  for (const proc of activeProcesses) {
    try {
      proc.kill("SIGTERM");
    } catch {
      // Process may already be dead — ignore
    }
  }

  activeProcesses.clear();
}
