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

  // Get recent CLEAN messages for this user (avoid profiling from flagged content)
  const recentMessages = await db
    .select({
      content: messagesTable.content,
      channelId: messagesTable.channel_id,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.user_id, userId),
        eq(messagesTable.guild_id, guildId),
        eq(messagesTable.ai_status, "clean"),
      ),
    )
    .orderBy(desc(messagesTable.created_at))
    .limit(100);

  if (recentMessages.length < 10) {
    log.debug({ userId }, "Not enough clean messages to learn user profile");
    return;
  }

  // Group messages by channel for channel-aware profiling
  const channelGroups = new Map<string, { content: string; channelId: string }[]>();
  for (const msg of recentMessages) {
    const ch = msg.channelId ?? "unknown";
    if (!channelGroups.has(ch)) channelGroups.set(ch, []);
    channelGroups.get(ch)!.push(msg);
  }

  // Build messages text with channel context
  const messagesText = recentMessages
    .reverse()
    .map((m) => {
      const chLabel = m.channelId ? `[#channel:${m.channelId}]` : "";
      return `${chLabel} ${m.content}`;
    })
    .join("\n");

  // Build channel activity summary
  const channelSummary = [...channelGroups.entries()]
    .map(([ch, msgs]) => `  - #channel ${ch}: ${msgs.length} pesan`)
    .join("\n");

  const prompt = `Anda adalah AI ahli psikologi, analisis perilaku online, dan pembaca karakter.
Tugas Anda adalah merangkum profil kepribadian SEORANG PRIBADI — bukan sekadar statistik
gaya bicara — berdasarkan riwayat pesan-pesan mereka di server Discord.
Buatlah ringkasan yang KAYA AKAN PERSONALITAS sehingga pembaca merasa "mengenal" orang ini.

Pesan-pesan terakhir dari user "${userId}" (hanya pesan bersih/clean):
<messages>
${messagesText}
</messages>

Distribusi aktivitas user per channel:
${channelSummary}

Berdasarkan pesan-pesan di atas, buatlah ringkasan singkat (maksimal 4 paragraf)
mengenai:

1. **Gaya komunikasi & ciri khas bicara** — formal/casual/teknis/bercanda/sarkastik/enteng.
   Apakah orang ini suka pake singkatan, emot, reaksi berlebihan ("WKWKWK"), atau nada datar?
   Bagaimana mereka memulai dan mengakhiri pembicaraan?

2. **Topik-topik yang sering dibahas & channel favorit** — apa PASSION mereka? Coding, gaming, musik, debat?
   Apakah mereka inisiator topik atau lebih suka merespon? Di channel mana mereka paling aktif?
   Apakah perilaku mereka berbeda tergantung channel (misal: profesional di #coding vs santai di #general)?

3. **Kepribadian dan karakter yang terpancar** — Apakah mereka ramah dan hangat? Kritis dan analitis?
   Easy going? Gampang marah? Humoris? Supportif? Suka memprovokasi? Suka membantu?
   Apa "vibe" yang mereka pancarkan secara keseluruhan?

4. **Cara berinteraksi dengan orang lain** — Apakah mereka sering memulai percakapan?
   Lebih suka 1-on-1 atau grup? Suka nge-tag orang? Gampang akrab atau menjaga jarak?
   Apakah mereka populer di komunitas? Sering dibalas orang lain?

5. **Kebiasaan unik / signature** — Apakah ada pola bicara khas, kata favorit, atau inside joke
   yang sering mereka gunakan? Apa yang membedakan mereka dari anggota lain?

**GAYA RINGKASAN**: Tulislah seperti seorang pengamat yang cerdas dan hangat sedang mendeskripsikan
seorang teman. Gunakan bahasa Indonesia alami. Berikan "rasa" dari orang ini — bukan hanya fakta kering.
JANGAN gunakan format bullet point dalam output. Tulis dalam bentuk prosa paragraf.
Jangan menambahkan teks basa-basi seperti "berikut ringkasannya". Langsung berikan ringkasannya.

Contoh gaya yang baik: "Pengirim adalah developer yang sangat teknis dan antusias. Gaya bicaranya santai
dan penuh dengan inside joke tentang coding. Ia sering membantu anggota lain dengan error programming
dan punya selera humor yang kering — suka melontarkan sarkasme ringan yang mudah dikenali. Topik
favoritnya adalah React, Rust, dan game indie. Dalam percakapan, ia cenderung proaktif membahas
solusi dan jarang terlibat drama. Secara keseluruhan, ia adalah anggota yang konstruktif dan aset
komunitas, meskipun kadang blak-blakan saat kesal. Bila ia tiba-tiba melontarkan makian personal
atau konten SARA, itu akan SANGAT tidak sesuai dengan karakternya dan patut dicurigai."`;

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
