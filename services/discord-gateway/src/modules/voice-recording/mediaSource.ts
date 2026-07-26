import { type ChildProcess, spawn } from "node:child_process";
import { PassThrough, type Readable } from "node:stream";
import { createChildLogger } from "@bete/shared/logger";
import { StreamType } from "@discordjs/voice";

const logger = createChildLogger("media-source");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaInfo {
  title: string;
  duration: number;
  uploader?: string;
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
   * Defaults to "bestaudio".
   */
  quality?: string;
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

function readFirstTwoLines(
  stdout: Readable,
  maxBufferSize: number = MAX_HEADER_BUFFER,
): Promise<{
  title: string;
  duration: number;
  remaining: Readable;
}> {
  return new Promise((resolve, reject) => {
    const passThrough = new PassThrough();

    let buffer = Buffer.alloc(0);
    let title = "";
    let stage: "title" | "duration" | "done" = "title";

    function cleanup() {
      stdout.removeListener("data", onData);
      stdout.removeListener("error", onError);
      stdout.removeListener("end", onEnd);
    }

    function onData(chunk: Buffer) {
      if (stage === "done") return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > maxBufferSize) {
        cleanup();
        reject(new Error(`Metadata header exceeded ${maxBufferSize} bytes`));
        return;
      }
      processBuffer();
    }

    function processBuffer() {
      while (buffer.length > 0 && stage !== "done") {
        const nl = buffer.indexOf(0x0a); // '\n' byte
        if (nl === -1) break; // Need more data

        const line = buffer.subarray(0, nl).toString("utf8").trim();
        buffer = buffer.subarray(nl + 1);

        if (stage === "title") {
          title = line;
          stage = "duration";
        } else if (stage === "duration") {
          const duration = parseSeconds(line);
          stage = "done";
          cleanup();

          // Write any buffered data that follows the second newline
          if (buffer.length > 0) {
            passThrough.write(buffer);
          }

          // Pipe the remainder of stdout into the pass-through
          stdout.pipe(passThrough);

          resolve({ title, duration, remaining: passThrough });
          return;
        }
      }
    }

    function onError(err: Error) {
      if (stage !== "done") {
        cleanup();
        reject(err);
      }
    }

    function onEnd() {
      if (stage !== "done") {
        cleanup();
        reject(
          new Error(
            `yt-dlp stdout ended before metadata could be read. ` +
              `Stage: ${stage}, partial title: "${title}"`,
          ),
        );
      }
    }

    stdout.on("data", onData);
    stdout.on("error", onError);
    stdout.on("end", onEnd);
  });
}

function buildNotInstalledError(): Error {
  return new Error(
    "yt-dlp is not installed or not found in PATH. " +
      'Run "pnpm run install:yt-dlp" to install it.',
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a media URL (YouTube, Spotify, etc.) to a playable audio stream.
 *
 * Spawns `yt-dlp`, extracts the title and duration from the first two stdout
 * lines, then pipes the remaining raw audio data into a Readable stream.
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
    const format = options?.quality ?? "bestaudio";
    const args = [
      "-f",
      format,
      "--audio-format",
      "best",
      "-o",
      "-",
      "--print",
      "before_dl:title",
      "--print",
      "before_dl:duration",
      url,
    ];

    logger.info({ url }, "Spawning yt-dlp for media resolution");

    const proc = spawn("yt-dlp", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    activeProcesses.add(proc);

    let stderrBuf = "";
    let resolved = false;

    // -- helpers -----------------------------------------------------------

    const failOnce = (err: Error) => {
      if (resolved) return;
      resolved = true;
      activeProcesses.delete(proc);
      reject(err);
    };

    // -- spawn error (ENOENT etc.) ----------------------------------------

    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        failOnce(buildNotInstalledError());
      } else {
        failOnce(new Error(`yt-dlp failed to start: ${err.message}`));
      }
    });

    // -- stderr (capture for diagnostics, capped at 4KB) ----------------------------------

    const MAX_STDERR = 4096;
    if (proc.stderr) {
      proc.stderr.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString("utf8");
      });
    }

    // -- stdout: parse header, then stream audio ---------------------------

    readFirstTwoLines(proc.stdout)
      .then(({ title, duration, remaining }) => {
        if (resolved) return;
        resolved = true;
        activeProcesses.delete(proc);

        const info: MediaInfo = { title, duration };
        resolve({
          stream: remaining,
          type: StreamType.Arbitrary,
          title,
          duration,
          info,
        });
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
 * Extract metadata (title, duration, uploader, thumbnail) from a media URL
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
          uploader: String(raw.uploader ?? raw.channel ?? "") || undefined,
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
 * Kill all active yt-dlp child processes.
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
