// ═══════════════════════════════════════════════════════════════════════════════
// 1. AppError Hierarchy
// ═══════════════════════════════════════════════════════════════════════════════
import {
  AppError,
  ConfigError,
  DatabaseError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@bete/shared/errors";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("AppError subclasses", () => {
  it("AppError carries code, statusCode, and details", () => {
    const err = new AppError("err", "X", 500, { info: "test" });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("X");
    expect(err.statusCode).toBe(500);
    expect(err.details).toEqual({ info: "test" });
  });

  it("NotFoundError sets 404 status", () => {
    expect(new NotFoundError("R").statusCode).toBe(404);
    expect(new NotFoundError("R").code).toBe("NOT_FOUND");
  });

  it("ValidationError sets 400 status", () => {
    expect(new ValidationError("V").statusCode).toBe(400);
    expect(new ValidationError("V").code).toBe("VALIDATION_ERROR");
  });

  it("UnauthorizedError sets 401 status", () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
  });

  it("DatabaseError sets 500 status", () => {
    expect(new DatabaseError("X").statusCode).toBe(500);
  });

  it("ConfigError sets 500 status", () => {
    expect(new ConfigError("X").statusCode).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Shared Utilities
// ═══════════════════════════════════════════════════════════════════════════════
import {
  decodeCursor,
  delay,
  encodeCursor,
  pageResult,
  retryWithBackoff,
} from "@bete/shared/utils";

describe("delay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after specified time with fake timers", async () => {
    vi.useFakeTimers();
    const p = delay(250);
    vi.advanceTimersByTime(250);
    await expect(p).resolves.toBeUndefined();
  });
});

describe("retryWithBackoff", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await expect(retryWithBackoff(fn)).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after retries are exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(
      retryWithBackoff(fn, { retries: 1, minTimeout: 1, maxTimeout: 5 }),
    ).rejects.toThrow("fail");
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects immediately when already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      retryWithBackoff(() => Promise.resolve("ok"), { signal: ac.signal }),
    ).rejects.toThrow("Aborted");
  });
});

describe("pagination utils", () => {
  it("encode/decode round-trips correctly", () => {
    const data = { created_at: 999, id: "id-1" };
    expect(decodeCursor(encodeCursor(data))).toEqual(data);
  });

  it("decodeCursor rejects invalid input with null", () => {
    expect(decodeCursor()).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("!!!")).toBeNull();
  });

  it("pageResult handles hasMore and no-more cases", () => {
    const r1 = pageResult([{ id: "a", created_at: 1 }], 5);
    expect(r1.nextCursor).toBeNull();

    const r2 = pageResult(
      [
        { id: "a", created_at: 1 },
        { id: "b", created_at: 2 },
      ],
      1,
    );
    expect(r2.data).toHaveLength(1);
    expect(r2.nextCursor).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Redis Channel Constants
// ═══════════════════════════════════════════════════════════════════════════════
import {
  BACKEND_COMMAND,
  COMMAND_GUILDS_LIST,
  COMMAND_MEDIA_QUEUE,
  COMMAND_MEDIA_SKIP,
  COMMAND_MEDIA_STOP,
  COMMAND_MEDIA_VOLUME,
  COMMAND_MODERATION_ACTION,
  COMMAND_VOICE_CONNECT,
  COMMAND_VOICE_DISCONNECT,
  DISCORD_ANALYSIS_QUEUE_STATUS,
  DISCORD_ATTACHMENT_CREATED,
  DISCORD_MESSAGE_ANALYZED,
  DISCORD_MESSAGE_CREATED,
  DISCORD_MESSAGE_DELETED,
  DISCORD_MESSAGE_UPDATED,
  DISCORD_VOICE_PCM,
  DISCORD_VOICE_STARTED,
  MEDIA_STATUS_KEY,
  VOICE_STATUS_KEY,
} from "@bete/shared/redis-channels";

describe("Redis channel constants", () => {
  it("define event channel names", () => {
    expect(DISCORD_MESSAGE_CREATED).toBe("discord:message:created");
    expect(DISCORD_MESSAGE_UPDATED).toBe("discord:message:updated");
    expect(DISCORD_MESSAGE_DELETED).toBe("discord:message:deleted");
    expect(DISCORD_MESSAGE_ANALYZED).toBe("discord:message:analyzed");
    expect(DISCORD_ATTACHMENT_CREATED).toBe("discord:attachment:created");
    expect(DISCORD_VOICE_STARTED).toBe("discord:voice:started");
    expect(DISCORD_VOICE_PCM).toBe("discord:voice:pcm");
    expect(DISCORD_ANALYSIS_QUEUE_STATUS).toBe("discord:analysis:queue_status");
  });

  it("define command channel and status keys", () => {
    expect(BACKEND_COMMAND).toBe("backend:command");
    expect(VOICE_STATUS_KEY).toBe("voice:status");
    expect(MEDIA_STATUS_KEY).toBe("media:status");
  });

  it("define command type constants", () => {
    expect(COMMAND_VOICE_CONNECT).toBe("voice:connect");
    expect(COMMAND_VOICE_DISCONNECT).toBe("voice:disconnect");
    expect(COMMAND_GUILDS_LIST).toBe("guilds:list");
    expect(COMMAND_MEDIA_QUEUE).toBe("media:queue");
    expect(COMMAND_MEDIA_SKIP).toBe("media:skip");
    expect(COMMAND_MEDIA_STOP).toBe("media:stop");
    expect(COMMAND_MEDIA_VOLUME).toBe("media:volume");
    expect(COMMAND_MODERATION_ACTION).toBe("moderation:action");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Config Validation
// ═══════════════════════════════════════════════════════════════════════════════
vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-discord-token-for-tests";
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
});

import { configSchema, loadConfig } from "@bete/shared/config";

describe("Config validation", () => {
  it("loadConfig succeeds with minimal valid env", () => {
    const cfg = loadConfig({
      DISCORD_TOKEN: "abc",
      DATABASE_URL: "postgres://localhost/db",
    });
    expect(cfg.DISCORD_TOKEN).toBe("abc");
    // Defaults
    expect(cfg.RECORDINGS_DIR).toBe("./recordings");
    expect(cfg.RECORDING_SEGMENT_MS).toBe(5000);
    expect(cfg.NODE_ENV).toBe("development");
    expect(cfg.WEBSERVER_PORT).toBe(3001);
    expect(cfg.OPUS_FRAME_SIZE).toBe(960);
    expect(cfg.AUDIO_SAMPLE_RATE).toBe(48000);
    expect(cfg.LOG_LEVEL).toBe("info");
  });

  it("loadConfig throws ConfigError when DISCORD_TOKEN is missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it("schema parses boolean-string transforms correctly", () => {
    const result = configSchema.parse({
      DISCORD_TOKEN: "tok",
      DATABASE_URL: "pg://localhost/db",
      VERBOSE: "true",
      AI_ANALYSIS_ENABLED: "true",
      AI_LLM_API_KEY: "sk-test",
    });
    expect(result.AI_ANALYSIS_ENABLED).toBe(true);
  });

  it("schema provides sensible default for NODE_ENV", () => {
    const result = configSchema.parse({
      DISCORD_TOKEN: "tok",
      DATABASE_URL: "pg://localhost/db",
    });
    expect(result.NODE_ENV).toBe("development");
  });

  it("gateway loadConfig adds EFFECTIVE_TEXT_GUILD_ID from MONITOR_GUILD_ID", async () => {
    const { loadConfig: gwLoadConfig } = await import(
      "../src/shared/config/config.js"
    );
    const cfg = gwLoadConfig({
      DISCORD_TOKEN: "tok",
      DATABASE_URL: "pg://localhost/db",
      MONITOR_GUILD_ID: "guild-1",
    });
    expect(cfg.EFFECTIVE_TEXT_GUILD_ID).toBe("guild-1");
  });

  it("gateway loadConfig prefers TEXT_GUILD_ID over MONITOR_GUILD_ID", async () => {
    const { loadConfig: gwLoadConfig } = await import(
      "../src/shared/config/config.js"
    );
    const cfg = gwLoadConfig({
      DISCORD_TOKEN: "tok",
      DATABASE_URL: "pg://localhost/db",
      TEXT_GUILD_ID: "text-guild",
      MONITOR_GUILD_ID: "monitor-guild",
    });
    expect(cfg.EFFECTIVE_TEXT_GUILD_ID).toBe("text-guild");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Pure function modules
// ═══════════════════════════════════════════════════════════════════════════════
import { sniffImageMimeType } from "../src/modules/ai-moderation/mediaAnalysisClient.js";

describe("sniffImageMimeType", () => {
  function buf(...bytes: number[]): Buffer {
    const b = Buffer.alloc(12);
    for (let i = 0; i < bytes.length; i++) b[i] = bytes[i];
    return b;
  }

  it("detects JPEG", () => {
    expect(sniffImageMimeType(buf(0xff, 0xd8, 0xff))).toBe("image/jpeg");
  });

  it("detects PNG", () => {
    expect(
      sniffImageMimeType(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe("image/png");
  });

  it("detects GIF", () => {
    expect(sniffImageMimeType(buf(0x47, 0x49, 0x46, 0x38))).toBe("image/gif");
  });

  it("detects WebP", () => {
    expect(
      sniffImageMimeType(
        buf(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50),
      ),
    ).toBe("image/webp");
  });

  it("detects AVIF", () => {
    // ftyp box with avif brand at bytes 8-11
    expect(
      sniffImageMimeType(
        buf(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66),
      ),
    ).toBe("image/avif");
  });

  it("detects HEIC", () => {
    // ftyp box with heic brand at bytes 8-11
    expect(
      sniffImageMimeType(
        buf(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63),
      ),
    ).toBe("image/heic");
  });

  it("returns null for short buffer (< 12 bytes)", () => {
    expect(sniffImageMimeType(Buffer.alloc(3))).toBeNull();
  });

  it("returns null for unrecognised data", () => {
    expect(sniffImageMimeType(Buffer.alloc(12))).toBeNull();
  });
});

import {
  clampScore,
  deriveRecommendedAction,
  deriveSeverity,
  hasDeferralAnalysis,
} from "../src/modules/ai-moderation/moderationResponseParser.js";

describe("severityDeriver", () => {
  describe("clampScore", () => {
    it("clamps values between 0 and 1", () => {
      expect(clampScore(-0.5)).toBe(0);
      expect(clampScore(0.5)).toBe(0.5);
      expect(clampScore(1.5)).toBe(1);
    });

    it("handles undefined and NaN with fallback", () => {
      expect(clampScore(undefined)).toBe(0);
      expect(clampScore(NaN)).toBe(0);
    });

    it("allows custom fallback", () => {
      expect(clampScore(undefined, 0.5)).toBe(0.5);
    });
  });

  describe("deriveSeverity", () => {
    it("returns none for clean status", () => {
      expect(deriveSeverity("clean", 0)).toBe("none");
    });

    it("returns low for warn with low score", () => {
      expect(deriveSeverity("warn", 0.5)).toBe("low");
    });

    it("returns medium for warn with score >= 0.65", () => {
      expect(deriveSeverity("warn", 0.65)).toBe("medium");
    });

    it("returns critical for flagged with score >= 0.9", () => {
      expect(deriveSeverity("flagged", 0.9)).toBe("critical");
    });

    it("returns high for flagged with score >= 0.75", () => {
      expect(deriveSeverity("flagged", 0.75)).toBe("high");
    });

    it("returns medium for flagged with score < 0.75", () => {
      expect(deriveSeverity("flagged", 0.5)).toBe("medium");
    });
  });

  describe("deriveRecommendedAction", () => {
    it("returns none for clean status", () => {
      expect(deriveRecommendedAction("clean", "none")).toBe("none");
    });

    it("returns review for warn with medium severity", () => {
      expect(deriveRecommendedAction("warn", "medium")).toBe("review");
    });

    it("returns warn for warn with low severity", () => {
      expect(deriveRecommendedAction("warn", "low")).toBe("warn");
    });
  });

  describe("hasDeferralAnalysis", () => {
    it("detects Indonesian deferral: kurang konteks", () => {
      expect(hasDeferralAnalysis("kurang konteks untuk menilai")).toBe(true);
    });

    it("detects English deferral: insufficient context", () => {
      expect(hasDeferralAnalysis("insufficient context to moderate")).toBe(
        true,
      );
    });

    it("detects cannot determine pattern", () => {
      expect(hasDeferralAnalysis("cannot determine")).toBe(true);
    });

    it("returns false for non-deferral text", () => {
      expect(hasDeferralAnalysis("This message is perfectly clean")).toBe(
        false,
      );
    });

    it("returns false for exception pattern (decisive verdict)", () => {
      expect(
        hasDeferralAnalysis(
          "tidak bisa menentukan karena tidak ada pelanggaran",
        ),
      ).toBe(false);
    });
  });
});

import { extractJson } from "../src/modules/ai-moderation/moderationResponseParser.js";

describe("extractJson", () => {
  it("extracts from plain JSON string", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("extracts from JSON inside markdown code block", () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(extractJson(input)).toEqual({ key: "value" });
  });

  it("extracts from JSON inside unlabeled code block", () => {
    const input = '```\n{"nested": {"x": 42}}\n```';
    expect(extractJson(input)).toEqual({ nested: { x: 42 } });
  });

  it("extracts JSON from surrounding text", () => {
    const input = 'Here is the result: {"status": "ok"} end.';
    expect(extractJson(input)).toEqual({ status: "ok" });
  });

  it("throws an error when no JSON is found", () => {
    expect(() => extractJson("this has no json at all")).toThrow(
      "No JSON object found",
    );
  });

  it("throws on empty string", () => {
    expect(() => extractJson("")).toThrow("No JSON object found");
  });
});
