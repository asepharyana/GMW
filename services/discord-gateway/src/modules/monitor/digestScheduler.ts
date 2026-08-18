import { sql } from "drizzle-orm";
import { config } from "@/shared/config/index.js";
import { getDatabase } from "@/shared/database/drizzle.js";
import { createChildLogger } from "@/shared/logger/index";

const logger = createChildLogger("digest-scheduler");

// 7 days
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let lastDigestTs: number = 0;

/**
 * Weekly moderation digest for the public monitor channel (or webhook).
 * Fully automatic — no UI, no shadow mode. Queries the DB directly and posts
 * a compact embed to WEBHOOK_URLS. Read-only: never mutates moderation state.
 */
export async function runWeeklyDigest(now = Date.now()): Promise<void> {
  // Run at most once per week (guard against double-scheduling on restart).
  if (now - lastDigestTs < WEEK_MS) return;
  lastDigestTs = now;

  if (!config.WEBHOOK_URLS.length) {
    logger.warn("No WEBHOOK_URLS configured — skipping weekly digest");
    return;
  }

  const db = getDatabase();
  const since = now - WEEK_MS;

  try {
    const [trends, domains, channels, coverage] = await Promise.all([
      // Top categories
      db.execute(sql`
        SELECT jsonb_array_elements_text(categories)::text AS name,
               COUNT(*)::int AS c
        FROM moderation_actions
        WHERE created_at >= ${since} AND categories IS NOT NULL
        GROUP BY name ORDER BY c DESC LIMIT 5
      `),
      // Top flagged domains
      db.execute(sql`
        SELECT host, COUNT(*)::int AS c
        FROM (
          SELECT DISTINCT id,
            (regexp_matches(COALESCE(content,'') || ' ' || COALESCE(reason,'') || ' ' || COALESCE(evidence,''), 'https?://([^/\\s?#]+)', 'g'))[1] AS host
          FROM moderation_actions
          WHERE created_at >= ${since}
            AND (content IS NOT NULL OR reason IS NOT NULL OR evidence IS NOT NULL)
        ) sub
        WHERE host IS NOT NULL
        GROUP BY host ORDER BY c DESC LIMIT 5
      `),
      // Top flagged channels
      db.execute(sql`
        SELECT COALESCE(NULLIF((m.metadata::jsonb -> 'channel' ->> 'channelName'), ''), m.channel_id) AS channel_name,
               COUNT(*)::int AS c
        FROM moderation_actions a
        LEFT JOIN messages m ON m.id = a.message_id
        WHERE a.created_at >= ${since} AND m.channel_id IS NOT NULL
        GROUP BY channel_name ORDER BY c DESC LIMIT 5
      `),
      // Coverage
      db.execute(sql`
        SELECT status, COUNT(*)::int AS c
        FROM ai_analysis_runs
        WHERE created_at >= ${since}
        GROUP BY status
      `),
    ]);

    const topCats = (trends.rows as Record<string, unknown>[]).map(
      (r) => `${r.name} (${r.c})`,
    );
    const topDomains = (domains.rows as Record<string, unknown>[]).map(
      (r) => `${r.host} (${r.c})`,
    );
    const topChannels = (channels.rows as Record<string, unknown>[]).map(
      (r) => `${r.channel_name} (${r.c})`,
    );
    const cov = (coverage.rows as Record<string, unknown>[]) || [];
    const total = cov.reduce((s, r) => s + Number(r.c), 0);
    const completed = Number(cov.find((r) => r.status === "completed")?.c ?? 0);
    const covRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "0";

    const lines: string[] = [];
    lines.push(`**GMW Weekly Moderation Digest** (last 7 days)`);
    lines.push("");
    lines.push(
      `Auto-mod coverage: ${covRate}% (${completed}/${total} runs completed)`,
    );
    lines.push(
      `**Top flagged categories:** ${topCats.length ? topCats.join(", ") : "—"}`,
    );
    lines.push(
      `**Top flagged domains:** ${topDomains.length ? topDomains.join(", ") : "—"}`,
    );
    lines.push(
      `**Top flagged channels:** ${topChannels.length ? topChannels.join(", ") : "—"}`,
    );
    lines.push("");
    lines.push(
      "_View full breakdowns at the moderation dashboard (public, read-only)._",
    );

    const body = JSON.stringify({
      username: "GMW Digest",
      avatar_url:
        "https://upload.wikimedia.org/wikipedia/commons/6/6a/Orange_tabby_cat_sitting_on_fallen_leaves-Hisashi-01A.jpg",
      content: null,
      embeds: [
        {
          title: "GMW Weekly Moderation Digest",
          description: lines.join("\n"),
          color: 0x38bdf8,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    for (const url of config.WEBHOOK_URLS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok) {
          logger.warn({ url, status: res.status }, "Digest webhook failed");
        }
      } catch (err) {
        logger.warn({ err }, "Digest webhook threw");
      }
    }
    logger.info("Weekly digest posted");
  } catch (err) {
    logger.error({ err }, "Weekly digest failed");
  }
}

/** Schedule the weekly digest. Runs on an interval; the guard inside
 * `runWeeklyDigest` ensures it only fires once per WEEK_MS.
 */
export function startDigestScheduler(intervalMs = 60 * 60 * 1000): void {
  // Fire an immediate (guarded) digest on start, then tick hourly.
  void runWeeklyDigest();
  setInterval(() => {
    void runWeeklyDigest();
  }, intervalMs);
}
