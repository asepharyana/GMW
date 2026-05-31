import Redis from "ioredis";
import { config } from "./config.js";
import { createChildLogger } from "./logger.js";

const logger = createChildLogger("muxer-queue");

// ── Redis client (lazy singleton) ──────────────────────────────────────────

let redis: Redis | null = null;

function getRedis(): Redis {
  if (redis !== null) return redis;

  redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) return null; // stop retrying
      return Math.min(times * 200, 2000);
    },
    lazyConnect: false,
  });

  redis.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });

  redis.on("connect", () => {
    logger.info({ url: config.REDIS_URL }, "Redis connected");
  });

  return redis;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface MuxerJobData {
  userId: string;
  sessionId: string;
  recordingsDir: string;
  outputDir: string;
}

// ── Database backward compatibility ────────────────────────────────────────

/**
 * @deprecated Use Redis functions directly. Kept for backward compat with old
 * tests that import getDatabase from muxer-queue.
 */
export function getDatabase() {
  logger.warn(
    "getDatabase() is deprecated — queue now uses Redis. Returning a stub.",
  );
  return undefined as unknown as never;
}

// ── Persistent KV store ────────────────────────────────────────────────────

const KV_PREFIX = "kv:";

export async function getPersistedValue<T>(
  key: string,
  fallback: T,
): Promise<T> {
  try {
    const r = getRedis();
    const raw = await r.get(`${KV_PREFIX}${key}`);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.error(
      { key, error: error instanceof Error ? error.message : String(error) },
      "Failed to get persisted value",
    );
    return fallback;
  }
}

export async function setPersistedValue(
  key: string,
  value: unknown,
): Promise<void> {
  try {
    const r = getRedis();
    await r.set(`${KV_PREFIX}${key}`, JSON.stringify(value));
  } catch (error) {
    logger.error(
      { key, error: error instanceof Error ? error.message : String(error) },
      "Failed to set persisted value",
    );
    throw error;
  }
}

// ── Job queue ──────────────────────────────────────────────────────────────

const JOB_PREFIX = "job:";
const QUEUE_PENDING = "queue:pending";
const QUEUE_PROCESSING = "queue:processing";
const QUEUE_COMPLETED = "queue:completed";
const QUEUE_FAILED = "queue:failed";

function queueKey(status: string): string {
  switch (status) {
    case "pending":
      return QUEUE_PENDING;
    case "processing":
      return QUEUE_PROCESSING;
    case "completed":
      return QUEUE_COMPLETED;
    case "failed":
      return QUEUE_FAILED;
    default:
      return QUEUE_PENDING;
  }
}

export async function enqueueMuxerJob(data: MuxerJobData): Promise<string> {
  try {
    const r = getRedis();
    const jobId = `${data.userId}-${data.sessionId}`;
    const now = Date.now();

    const jobKey = `${JOB_PREFIX}${jobId}`;

    // Use a pipeline for atomicity
    const pipeline = r.pipeline();
    pipeline.hset(jobKey, {
      data: JSON.stringify(data),
      status: "pending",
      attempts: "0",
      maxAttempts: "3",
      createdAt: String(now),
      updatedAt: String(now),
      error: "",
    });
    pipeline.lpush(QUEUE_PENDING, jobId);
    await pipeline.exec();

    logger.info(
      { jobId, userId: data.userId, sessionId: data.sessionId },
      "Muxer job enqueued",
    );

    return jobId;
  } catch (error) {
    logger.error(
      {
        userId: data.userId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to enqueue muxer job",
    );
    throw error;
  }
}

export async function getPendingJobs(): Promise<
  Array<{
    id: string;
    data: string;
    status: "pending" | "processing" | "completed" | "failed";
    attempts: number;
    maxAttempts: number;
    createdAt: number;
    updatedAt: number;
    error?: string;
  }>
> {
  try {
    const r = getRedis();

    // Get up to 10 pending job IDs from the left (oldest first)
    const jobIds = await r.lrange(QUEUE_PENDING, 0, 9);
    if (jobIds.length === 0) return [];

    // Batch fetch all job hashes
    const pipeline = r.pipeline();
    for (const id of jobIds) {
      pipeline.hgetall(`${JOB_PREFIX}${id}`);
    }
    const results = await pipeline.exec();
    if (!results) return [];

    const jobs: Array<{
      id: string;
      data: string;
      status: "pending" | "processing" | "completed" | "failed";
      attempts: number;
      maxAttempts: number;
      createdAt: number;
      updatedAt: number;
      error?: string;
    }> = [];

    for (let i = 0; i < jobIds.length; i++) {
      const [err, fields] = results[i];
      if (err || !fields) continue;

      const raw = fields as Record<string, string>;
      jobs.push({
        id: jobIds[i],
        data: raw.data || "",
        status: (raw.status as "pending") || "pending",
        attempts: Number(raw.attempts) || 0,
        maxAttempts: Number(raw.maxAttempts) || 3,
        createdAt: Number(raw.createdAt) || 0,
        updatedAt: Number(raw.updatedAt) || 0,
        error: raw.error || undefined,
      });
    }

    return jobs;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get pending jobs",
    );
    return [];
  }
}

export async function updateJobStatus(
  jobId: string,
  status: "processing" | "completed" | "failed",
  error?: string,
): Promise<void> {
  try {
    const r = getRedis();
    const jobKey = `${JOB_PREFIX}${jobId}`;
    const now = Date.now();

    const exists = await r.exists(jobKey);
    if (!exists) {
      logger.warn({ jobId }, "Job not found for status update");
      return;
    }

    const currentStatus = await r.hget(jobKey, "status");

    const pipeline = r.pipeline();

    if (status === "failed") {
      pipeline.hincrby(jobKey, "attempts", 1);
      pipeline.hset(jobKey, "error", error || "");
    }

    pipeline.hset(jobKey, "status", status);
    pipeline.hset(jobKey, "updatedAt", String(now));

    // Move job ID between queue lists
    if (currentStatus) {
      pipeline.lrem(queueKey(currentStatus), 0, jobId);
    }
    pipeline.lpush(queueKey(status), jobId);

    await pipeline.exec();

    logger.info({ jobId, status, error }, "Job status updated");
  } catch (err) {
    logger.error(
      {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      },
      "Failed to update job status",
    );
    throw err;
  }
}

export async function retryFailedJob(jobId: string): Promise<boolean> {
  try {
    const r = getRedis();
    const jobKey = `${JOB_PREFIX}${jobId}`;

    const [attemptsStr, maxAttemptsStr] = await r.hmget(
      jobKey,
      "attempts",
      "maxAttempts",
    );

    const attempts = Number(attemptsStr) || 0;
    const maxAttempts = Number(maxAttemptsStr) || 3;

    if (attempts >= maxAttempts) {
      logger.warn(
        { jobId, attempts, maxAttempts },
        "Max retry attempts reached",
      );
      return false;
    }

    const pipeline = r.pipeline();
    pipeline.hset(jobKey, "status", "pending");
    pipeline.hset(jobKey, "updatedAt", String(Date.now()));
    pipeline.lrem(QUEUE_FAILED, 0, jobId);
    pipeline.lpush(QUEUE_PENDING, jobId);
    await pipeline.exec();

    logger.info({ jobId, attempt: attempts + 1 }, "Job retried");
    return true;
  } catch (err) {
    logger.error(
      { jobId, error: err instanceof Error ? err.message : String(err) },
      "Failed to retry job",
    );
    return false;
  }
}

export async function cleanupCompletedJobs(
  olderThanMs: number = 24 * 60 * 60 * 1000,
): Promise<number> {
  try {
    const r = getRedis();
    const cutoffTime = Date.now() - olderThanMs;

    const jobIds = await r.lrange(QUEUE_COMPLETED, 0, -1);
    if (jobIds.length === 0) return 0;

    const pipeline = r.pipeline();
    for (const id of jobIds) {
      pipeline.hget(`${JOB_PREFIX}${id}`, "updatedAt");
    }
    const results = await pipeline.exec();
    if (!results) return 0;

    let deletedCount = 0;
    const deletePipeline = r.pipeline();

    for (let i = 0; i < jobIds.length; i++) {
      const [err, updatedAtStr] = results[i];
      if (err) continue;

      const updatedAt = Number(updatedAtStr) || 0;
      if (updatedAt < cutoffTime) {
        deletePipeline.del(`${JOB_PREFIX}${jobIds[i]}`);
        deletePipeline.lrem(QUEUE_COMPLETED, 0, jobIds[i]);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      await deletePipeline.exec();
    }

    logger.info({ deletedCount }, "Cleaned up completed jobs");
    return deletedCount;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Failed to clean up completed jobs",
    );
    return 0;
  }
}

export async function getJobStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  try {
    const r = getRedis();
    const [pending, processing, completed, failed] = await Promise.all([
      r.llen(QUEUE_PENDING),
      r.llen(QUEUE_PROCESSING),
      r.llen(QUEUE_COMPLETED),
      r.llen(QUEUE_FAILED),
    ]);

    return { pending, processing, completed, failed };
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Failed to get job stats",
    );
    return { pending: 0, processing: 0, completed: 0, failed: 0 };
  }
}

export async function closeQueue(): Promise<void> {
  if (redis !== null) {
    await redis.quit();
    redis = null;
  }
  logger.info("Muxer queue (Redis) closed");
}
