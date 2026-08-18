import { embedText } from "@/modules/ai-moderation/embeddingClient.js";
import {
  ARCHIVE_COLLECTION,
  qdrantPointId,
  upsertQdrantPointV2,
} from "@/modules/ai-moderation/qdrantClient.js";
import { config } from "@/shared/config/config.js";
import { createChildLogger } from "@/shared/logger/index";

const log = createChildLogger("archive-embedder");

export interface ArchiveMessage {
  id: string;
  content: string;
  username: string;
  channel_id: string;
  guild_id: string;
  created_at: number;
}

/**
 * Fire-and-forget: embed a captured message and upsert it into the persistent
 * archive collection so the public web can semantic-search the corpus.
 *
 * Failures are swallowed — searching is a nice-to-have, never a precondition
 * for capture or moderation. The message text is kept in the payload so the
 * search endpoint can return results even for deleted messages.
 */
export function archiveMessageEmbedded(message: ArchiveMessage): void {
  if (!config.AI_LLM_EMBEDDING_MODEL) return; // embeddings disabled → skip
  const text = message.content?.trim();
  if (!text || text.length < 3) return;

  void (async () => {
    try {
      const vector = await embedText(text);
      if (!vector) return;
      const ok = await upsertQdrantPointV2(
        ARCHIVE_COLLECTION,
        qdrantPointId(`archive:${message.id}`),
        vector,
        {
          text: text.slice(0, 4000),
          flags: "",
          analyzed_at: Date.now(),
          // 5-year persistent window (archive is NOT a TTL cache).
          expires_at: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
          content_hash: message.id,
        },
      );
      if (!ok) return;
      log.debug({ messageId: message.id }, "Archived message embedding");
    } catch (err) {
      log.debug(
        {
          messageId: message.id,
          error: err instanceof Error ? err.message : String(err),
        },
        "archive embed skipped",
      );
    }
  })();
}
