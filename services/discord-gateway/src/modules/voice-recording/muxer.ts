import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createChildLogger } from "@/shared/logger/index";
import { getDatabase } from "../../shared/database/drizzle.js";
import type * as schema from "../../shared/database/schema.js";
import { muxerJobsTable } from "../../shared/database/schema.js";
import { buildMuxFfmpegArgs, runFfmpeg } from "./ffmpegProcess.js";

const logger = createChildLogger("muxer");

// ─── Types ─────────────────────────────────────────────────────────────────────────────

export interface MuxerJobData {
  inputs: string[];
  output: string;
  guildId: string;
  channelId: string;
  sessionId: string;
}

// ─── State ───────────────────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Enqueue a muxer job that merges multiple OGG files into one.
 */
export async function enqueueMuxerJob(data: MuxerJobData): Promise<void> {
  const db = getDatabase() as unknown as NodePgDatabase<typeof schema>;
  const id = `${data.sessionId}-${Date.now()}`;

  try {
    await db.insert(muxerJobsTable).values({
      id,
      data: JSON.stringify(data),
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    logger.info({ id, sessionId: data.sessionId }, "Muxer job enqueued");
  } catch (error) {
    logger.error(
      { id, error: error instanceof Error ? error.message : String(error) },
      "Failed to enqueue muxer job",
    );
  }
}

/**
 * Start the background worker that polls for pending muxer jobs.
 */
export function startMuxerWorker(): void {
  if (pollTimer) return;
  logger.info("Starting muxer worker (interval: 10s)");

  pollTimer = setInterval(() => {
    processNextJobs().catch((err: unknown) => {
      logger.error({ error: String(err) }, "Muxer worker tick failed");
    });
  }, 10_000);
}

/**
 * Stop the background worker.
 */
export function stopMuxerWorker(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
  logger.info("Muxer worker stopped");
}

// ─── Internal ────────────────────────────────────────────────────────────

async function processNextJobs(): Promise<void> {
  const db = getDatabase() as unknown as NodePgDatabase<typeof schema>;

  try {
    const jobs = await db
      .select()
      .from(muxerJobsTable)
      .where(eq(muxerJobsTable.status, "pending"))
      .limit(5);

    if (jobs.length === 0) return;

    const results = await Promise.allSettled(
      jobs.map((job) => processJob(db, job)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        logger.error(
          { jobId: jobs[i].id, error: result.reason },
          "Muxer job failed",
        );
      }
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to fetch pending muxer jobs",
    );
  }
}

async function processJob(
  db: NodePgDatabase<typeof schema>,
  job: typeof muxerJobsTable.$inferSelect,
): Promise<void> {
  // Mark as processing
  await db
    .update(muxerJobsTable)
    .set({ status: "processing", updatedAt: Date.now() })
    .where(eq(muxerJobsTable.id, job.id));

  try {
    const data = JSON.parse(job.data) as MuxerJobData;

    if (!data.inputs || data.inputs.length < 2) {
      throw new Error(
        `Muxer job ${job.id} needs at least 2 inputs, got ${data.inputs?.length ?? 0}`,
      );
    }

    logger.info(
      { jobId: job.id, inputs: data.inputs.length, output: data.output },
      "Processing muxer job",
    );

    // Sequential concat of all OGG segments (amix = simultaneous mix, wrong for this)
    const inputLabels = data.inputs.map((_, i) => `[${i}:a:0]`);
    const n = data.inputs.length;
    const filterComplex = `${inputLabels.join("")}concat=n=${n}:v=0:a=1[out]`;

    const args = buildMuxFfmpegArgs({
      inputs: data.inputs,
      filter: filterComplex,
      output: data.output,
      codec: "libmp3lame",
      audioFrequency: 48000,
      audioChannels: 2,
    });

    await runFfmpeg(args);

    // Mark as completed
    await db
      .update(muxerJobsTable)
      .set({ status: "completed", updatedAt: Date.now() })
      .where(eq(muxerJobsTable.id, job.id));

    logger.info({ jobId: job.id, output: data.output }, "Muxer job completed");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const newAttempts = job.attempts + 1;

    if (newAttempts >= job.maxAttempts) {
      await db
        .update(muxerJobsTable)
        .set({
          status: "failed",
          error: errMsg,
          attempts: newAttempts,
          updatedAt: Date.now(),
        })
        .where(eq(muxerJobsTable.id, job.id));
      logger.error(
        { jobId: job.id, error: errMsg },
        "Muxer job failed permanently",
      );
    } else {
      await db
        .update(muxerJobsTable)
        .set({
          status: "pending",
          error: errMsg,
          attempts: newAttempts,
          updatedAt: Date.now(),
        })
        .where(eq(muxerJobsTable.id, job.id));
      logger.warn(
        { jobId: job.id, error: errMsg, attempt: newAttempts },
        "Muxer job will be retried",
      );
    }
  }
}
