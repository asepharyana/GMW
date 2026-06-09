import { createChildLogger } from "@bete/shared/logger";
import { and, desc, eq, sql } from "drizzle-orm";
import { config } from "../../shared/config/config.js";
import { getDatabase } from "../../shared/database/drizzle.js";
import {
  channelCulturesTable,
  messagesTable,
} from "../../shared/database/schema.js";
import { updateChannelCulture } from "./channelCultureStore.js";
import { llmChat } from "./llmClient.js";

const CULTURE_LEARNING_INTERVAL = 1000 * 60 * 60 * 12; // 12 hours
const log = createChildLogger("cultureLearner");

async function learnChannelCulture(
  channelId: string,
  guildId: string,
): Promise<void> {
  const db = getDatabase();

  // Get recent clean messages for this channel
  const recentMessages = await db
    .select({
      content: messagesTable.content,
      username: messagesTable.username,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.channel_id, channelId),
        eq(messagesTable.ai_status, "clean"),
      ),
    )
    .orderBy(desc(messagesTable.created_at))
    .limit(100);

  if (recentMessages.length < 10) {
    log.debug({ channelId }, "Not enough messages to learn culture");
    return;
  }

  const messagesText = recentMessages
    .reverse()
    .map((m) => `${m.username}: ${m.content}`)
    .join("\n");

  const prompt = `Anda adalah AI ahli perilaku sosiologis dan budaya online.
Tugas Anda adalah merangkum budaya (culture) dari sebuah channel chat berdasarkan riwayat pesan-pesan yang dianggap bersih (clean/tidak melanggar).

Pesan-pesan terakhir:
<messages>
${messagesText}
</messages>

Berdasarkan pesan-pesan di atas, buatlah ringkasan singkat (maksimal 3 paragraf) mengenai gaya bahasa, topik obrolan, dan norma sosial di channel ini. Ringkasan ini akan digunakan oleh sistem AI moderasi untuk memahami konteks dan "inside jokes" yang wajar di channel ini.
Jangan menambahkan teks basa-basi, langsung berikan ringkasannya.`;

  try {
    const completion = await llmChat({
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.7, // Higher temp for summarization
      retries: 2,
    });

    if (!completion) throw new Error("Empty response from LLM");
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response from LLM");

    await updateChannelCulture(channelId, guildId, text);
    log.info(
      { channelId, guildId },
      "Successfully learned and updated channel culture",
    );
  } catch (error) {
    log.error({ channelId, error }, "Failed to learn channel culture");
  }
}

export async function runCultureLearningCycle(): Promise<void> {
  const db = getDatabase();
  log.info("Starting culture learning cycle");

  try {
    // Find channels that haven't been analyzed recently
    // We do a simple distinct channel_id query with a left join to see if it's stale
    const staleChannels = await db.execute(sql`
      SELECT m.channel_id, m.guild_id
      FROM (SELECT DISTINCT channel_id, guild_id FROM messages) m
      LEFT JOIN channel_cultures c ON m.channel_id = c.channel_id
      WHERE c.last_analyzed_at IS NULL 
         OR c.last_analyzed_at < ${Date.now() - CULTURE_LEARNING_INTERVAL}
      LIMIT 50
    `);

    for (const row of staleChannels.rows || staleChannels) {
      // Cast the row because execute() returns untyped Record<string, unknown>[]
      const channelId = String(row.channel_id);
      const guildId = String(row.guild_id);
      await learnChannelCulture(channelId, guildId);
    }
  } catch (error) {
    log.error({ error }, "Error in culture learning cycle");
  }
}

let cultureInterval: NodeJS.Timeout | null = null;

export function startCultureLearnerWorker(): void {
  if (!config.AI_ANALYSIS_ENABLED) return;
  if (cultureInterval) return;

  // Run once on startup after 1 minute, then every 1 hour
  setTimeout(() => {
    runCultureLearningCycle().catch((e) => log.error(e));
  }, 60000);

  cultureInterval = setInterval(
    () => {
      runCultureLearningCycle().catch((e) => log.error(e));
    },
    1000 * 60 * 60,
  ); // Check every hour for channels that reached 12h expiry

  log.info("Started background culture learner worker");
}
