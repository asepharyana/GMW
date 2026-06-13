import { createChildLogger } from "@bete/shared/logger";
import { and, desc, eq, sql } from "drizzle-orm";
import { config } from "../../shared/config/config.js";
import { getDatabase } from "../../shared/database/drizzle.js";
import {
  messagesTable,
  userProfilesTable,
} from "../../shared/database/schema.js";
import { llmChat } from "./llmClient.js";
import { updateUserProfile } from "./userProfileStore.js";

const PROFILE_LEARNING_INTERVAL = 1000 * 60 * 60 * 12; // 12 hours
const log = createChildLogger("userProfileLearner");

async function learnUserProfile(
  userId: string,
  guildId: string,
): Promise<void> {
  const db = getDatabase();

  // Get recent messages for this user
  const recentMessages = await db
    .select({
      content: messagesTable.content,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.user_id, userId),
        eq(messagesTable.guild_id, guildId),
      ),
    )
    .orderBy(desc(messagesTable.created_at))
    .limit(100);

  if (recentMessages.length < 10) {
    log.debug({ userId }, "Not enough messages to learn user profile");
    return;
  }

  const messagesText = recentMessages
    .reverse()
    .map((m) => m.content)
    .join("\n");

  const prompt = `Anda adalah AI ahli psikologi dan analisis perilaku online.
Tugas Anda adalah merangkum profil kepribadian seorang pengguna berdasarkan
riwayat pesan-pesan mereka di server Discord.

Pesan-pesan terakhir dari user "${userId}":
<messages>
${messagesText}
</messages>

Berdasarkan pesan-pesan di atas, buatlah ringkasan singkat (maksimal 3 paragraf)
mengenai:
1. Gaya komunikasi (formal/casual/teknis/bercanda/serius)
2. Topik-topik yang sering dibahas
3. Kepribadian dan karakter yang terpancar
4. Cara berinteraksi dengan orang lain

Ringkasan ini akan digunakan oleh sistem AI moderasi untuk memahami konteks
dan kebiasaan pengguna saat memoderasi pesan mereka.
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

    await updateUserProfile(userId, guildId, text);
    log.info(
      { userId, guildId },
      "Successfully learned and updated user profile",
    );
  } catch (error) {
    log.error({ userId, error }, "Failed to learn user profile");
  }
}

export async function runUserProfileLearningCycle(): Promise<void> {
  const db = getDatabase();
  log.info("Starting user profile learning cycle");

  try {
    // Find users that haven't been profiled recently
    // We query distinct user_id with enough messages and stale/no profile
    const staleUsers = await db.execute(sql`
      SELECT m.user_id, m.guild_id
      FROM (
        SELECT user_id, guild_id, COUNT(*) as msg_count
        FROM messages
        GROUP BY user_id, guild_id
        HAVING COUNT(*) >= 10
      ) m
      LEFT JOIN user_profiles p ON m.user_id = p.user_id
      WHERE p.last_analyzed_at IS NULL
         OR p.last_analyzed_at < ${Date.now() - PROFILE_LEARNING_INTERVAL}
      LIMIT 50
    `);

    for (const row of staleUsers.rows || staleUsers) {
      const userId = String(row.user_id);
      const guildId = String(row.guild_id);
      await learnUserProfile(userId, guildId);
    }
  } catch (error) {
    log.error({ error }, "Error in user profile learning cycle");
  }
}

let profileInterval: NodeJS.Timeout | null = null;

export function startUserProfileLearnerWorker(): void {
  if (!config.AI_ANALYSIS_ENABLED) return;
  if (profileInterval) return;

  // Run once on startup after 1 minute, then every 1 hour
  setTimeout(() => {
    runUserProfileLearningCycle().catch((e) => log.error(e));
  }, 60000);

  profileInterval = setInterval(
    () => {
      runUserProfileLearningCycle().catch((e) => log.error(e));
    },
    1000 * 60 * 60,
  ); // Check every hour for users that reached 12h expiry

  log.info("Started user profile learner worker");
}
