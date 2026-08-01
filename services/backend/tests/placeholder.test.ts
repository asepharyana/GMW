// ─── Shared Error Classes ────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppError,
  ConfigError,
  DatabaseError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../src/shared/errors/index.js";
// ─── Backend middleware ──────────────────────────────────────────────────────
import { asyncHandler, requireParam } from "../src/shared/middlewares/index.js";
// ─── Shared utilities ─────────────────────────────────────────────────────────
import {
  decodeCursor,
  delay,
  encodeCursor,
  pageResult,
  retryWithBackoff,
} from "../src/shared/utils/index.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. AppError / Error Hierarchy Tests
// ═══════════════════════════════════════════════════════════════════════════════
describe("AppError subclasses", () => {
  it("AppError stores message, code, statusCode, and details", () => {
    const err = new AppError("custom", "CUSTOM", 418, { reason: "teapot" });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("custom");
    expect(err.code).toBe("CUSTOM");
    expect(err.statusCode).toBe(418);
    expect(err.details).toEqual({ reason: "teapot" });
    expect(err.name).toBe("AppError");
  });

  it("AppError defaults statusCode to 500", () => {
    const err = new AppError("msg", "X");
    expect(err.statusCode).toBe(500);
  });

  it("NotFoundError has 404 status and formatted message", () => {
    const err = new NotFoundError("User");
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("User not found");
    expect(err.name).toBe("NotFoundError");
  });

  it("NotFoundError appends id when provided", () => {
    const err = new NotFoundError("Message", "abc-123");
    expect(err.message).toBe("Message not found: abc-123");
  });

  it("ValidationError has 400 status and forwards details", () => {
    const details = { field: "email" };
    const err = new ValidationError("Invalid input", details);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toBe(details);
    expect(err.name).toBe("ValidationError");
  });

  it("UnauthorizedError has 401 status and default message", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Unauthorized");
  });

  it("UnauthorizedError accepts custom message", () => {
    const err = new UnauthorizedError("Access denied");
    expect(err.message).toBe("Access denied");
  });

  it("DatabaseError has 500 status and forwards details", () => {
    const err = new DatabaseError("DB down", { cause: "timeout" });
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("DATABASE_ERROR");
    expect(err.details).toEqual({ cause: "timeout" });
  });

  it("ConfigError has 500 status", () => {
    const err = new ConfigError("Bad config");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("CONFIG_ERROR");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Utility Function Tests
// ═══════════════════════════════════════════════════════════════════════════════
describe("delay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the given time", async () => {
    vi.useFakeTimers();
    const promise = delay(500);
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects are not triggered on non-matching timer", async () => {
    vi.useFakeTimers();
    const promise = delay(1000);
    // Advance only part way — the timer should NOT fire yet
    vi.advanceTimersByTime(500);
    // The timer is still pending; the promise has not resolved yet
    // We advance the rest
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
  });
});

describe("retryWithBackoff", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retryWithBackoff(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-throws after exhausting all retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("persistent"));
    await expect(
      retryWithBackoff(fn, { retries: 1, minTimeout: 1, maxTimeout: 5 }),
    ).rejects.toThrow("persistent");
    // initial call + 1 retry
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("throws AbortError immediately when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(
      retryWithBackoff(fn, { retries: 3, signal: ac.signal }),
    ).rejects.toThrow("Aborted");
    expect(fn).not.toHaveBeenCalled();
  });

  it("respects abort signal during retry", async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    const promise = retryWithBackoff(fn, {
      retries: 5,
      minTimeout: 100,
      signal: ac.signal,
    });

    // Schedule abort after first failure + backoff starts
    setTimeout(() => ac.abort(), 150);
    vi.advanceTimersByTime(200);
    await vi.waitFor(async () => {
      await expect(promise).rejects.toThrow("Aborted");
    });
  });
});

describe("pagination utilities", () => {
  it("encodeCursor produces a base64 string", () => {
    const result = encodeCursor({ created_at: 1000, id: "msg-1" });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("encodeCursor round-trips through decodeCursor", () => {
    const data = { created_at: 1234567890, id: "abc-def" };
    const cursor = encodeCursor(data);
    expect(decodeCursor(cursor)).toEqual(data);
  });

  it("decodeCursor returns null for undefined / empty", () => {
    expect(decodeCursor()).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("decodeCursor returns null for malformed input", () => {
    // Completely invalid base64
    expect(decodeCursor("!!!not-valid!!!")).toBeNull();
    // Valid base64 but not JSON
    const notJson = Buffer.from("not-json").toString("base64");
    expect(decodeCursor(notJson)).toBeNull();
    // Valid JSON but wrong shape (missing created_at / id)
    const wrongShape = Buffer.from(JSON.stringify({ foo: "bar" })).toString(
      "base64",
    );
    expect(decodeCursor(wrongShape)).toBeNull();
  });

  it("pageResult truncates and sets nextCursor when rows exceed limit", () => {
    const rows = [
      { id: "a", created_at: 100 },
      { id: "b", created_at: 200 },
      { id: "c", created_at: 300 },
    ];
    const { data, nextCursor } = pageResult(rows, 2);
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe("a");
    expect(nextCursor).toBeTruthy();
  });

  it("pageResult returns null nextCursor when fewer rows than limit", () => {
    const rows = [{ id: "a", created_at: 100 }];
    const { data, nextCursor } = pageResult(rows, 2);
    expect(data).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });

  it("pageResult returns empty data for empty input", () => {
    const { data, nextCursor } = pageResult([], 10);
    expect(data).toEqual([]);
    expect(nextCursor).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Middleware Tests
// ═══════════════════════════════════════════════════════════════════════════════
describe("asyncHandler", () => {
  it("passes thrown errors to next()", async () => {
    const error = new Error("handler-error");
    const wrapped = asyncHandler(async () => {
      throw error;
    });
    const next = vi.fn();

    wrapped({} as any, {} as any, next);

    // .catch(next) is a microtask — flush the queue
    await Promise.resolve();
    await Promise.resolve();
    expect(next).toHaveBeenCalledWith(error);
  });

  it("does not call next when handler resolves successfully", async () => {
    const wrapped = asyncHandler(async (_req: any, _res: any, _next: any) => {
      // no-op
    });
    const next = vi.fn();

    wrapped({} as any, {} as any, next);
    await Promise.resolve();
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireParam", () => {
  it("returns the value for a non-empty string", () => {
    expect(requireParam("hello", "param", "name")).toBe("hello");
  });

  it("throws ValidationError for undefined", () => {
    expect(() => requireParam(undefined, "query", "q")).toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError for empty string", () => {
    expect(() => requireParam("", "param", "id")).toThrow(ValidationError);
  });

  it("throws with a descriptive message", () => {
    expect(() => requireParam(null, "header", "X-Token")).toThrow(
      "Missing header: X-Token",
    );
  });
});
