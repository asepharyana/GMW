import { createChildLogger } from "@bete/shared/logger";
import { and, desc, eq, sql } from "drizzle-orm";
import { config } from "../../shared/config/config.js";
import { getDatabase } from "../../shared/database/drizzle.js";
import { messagesTable } from "../../shared/database/schema.js";
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

  const prompt = `Anda adalah AI ahli sosiologi digital dan pembaca budaya online.
Tugas Anda adalah merangkum KEPRIBADIAN SEBUAH CHANNEL — bagaimana "rasanya" berada di channel ini,
siapa saja anggotanya, dan norma tidak tertulis apa yang berlaku.

Pesan-pesan terakhir dari channel (hanya pesan bersih/clean):
<messages>
${messagesText}
</messages>

Berdasarkan pesan-pesan di atas, buatlah ringkasan singkat (maksimal 4 paragraf)
mengenai:

1. **"VIBE" channel** — Bagaimana suasana channel ini? Serius dan profesional? Santai dan penuh tawa?
   Campuran? Apakah channel terasa hangat, sarkastik, chaos, atau tertib? Jelaskan "feel"-nya.

2. **Gaya bahasa dan inside jokes** — Bahasa apa yang dominan (Indonesia/Inggris/campuran)?
   Apakah ada slang, meme, atau referensi yang khas di channel ini? Istilah-istilah teknis atau
   inside joke yang sering muncul? Apakah orang-orang di sini saling sapa atau langsung ke topik?

3. **Topik utama & aktivitas** — Apa yang biasanya dibahas di channel ini? Coding problem? Ngobrol
   santai? Sharing berita? Debat? Apakah ada ritual atau rutinitas (misal "pagi bro", "makan siang")?

4. **Dinamika sosial & norma tidak tertulis** — Siapa anggota yang paling aktif? Apakah ada tokoh
   sentral atau "pengurus" informal? Apakah channel ini ramah ke pendatang baru atau lebih eksklusif?
   Norma apa yang berlaku (misal: no politics, no NSFW, strict on-topic, atau bebas)?

**GAYA RINGKASAN**: Tulislah seperti seorang antropolog yang sedang mendeskripsikan sebuah desa
digital dengan bahasa Indonesia yang hidup dan natural. JANGAN gunakan format bullet point dalam
output — tulis dalam bentuk prosa paragraf yang mengalir. Jangan basa-basi, langsung berikan
ringkasannya.

Contoh gaya yang baik: "Channel ini adalah pusat komunitas developer dengan vibe santai dan
kekeluargaan. Bahasa dominan campuran Indonesia-Inggris dengan banyak istilah teknis React dan
Rust. Inside joke yang sering muncul adalah soal 'production bug' dan 'deploy Friday' — mereka
punya tradisi saling ledek kalau ada yang nge-deploy pas Jumat sore. Topik utama adalah debug
help, code review, dan kadang curhat karir. Channel sangat ramah ke pendatang baru — setiap
pertanyaan baru selalu direspons dengan antusias. Norma tidak tertulis: dilarang keras promosi
judi/NSFW, tapi selain itu bebas. Ada dua anggota senior yang jadi 'mom' channel—sabar jelasin
hal dasar ke newbie tanpa judge."`;

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
