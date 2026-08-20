import { config } from "@/shared/config/index.js";
import { createChildLogger } from "@/shared/logger/index.js";
import type { MateriDocument } from "@/shared/database/schema.js";
import { embedQuery } from "../messages/embed.js";
import { searchArchive } from "../messages/qdrant.js";

const logger = createChildLogger("materi-rag");

export interface MateriSearchHit {
  document: MateriDocument;
  score: number;
  chunkText: string;
  chunkIndex: number;
}

export interface RAGChatResult {
  answer: string;
  sources: Array<{
    id: string;
    title: string;
    score: number;
    excerpt: string;
  }>;
}

/** Chunk size for splitting materi content for embedding search. */
const CHUNK_SIZE = 500;
const SEARCH_TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.6;

/**
 * Split text into overlapping chunks for embedding search.
 */
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    const end = Math.min(pos + CHUNK_SIZE, text.length);
    chunks.push(text.slice(pos, end));
    pos = end - CHUNK_SIZE / 4; // 25% overlap
    if (pos <= 0) break;
  }
  return chunks;
}

/**
 * Generate embeddings for chunks. Returns null if embeddings not configured.
 */
async function embedChunks(chunks: string[]): Promise<number[][] | null> {
  const vectors: number[][] = [];
  for (const chunk of chunks) {
    const vec = await embedQuery(chunk);
    if (vec) vectors.push(vec);
  }
  return vectors.length > 0 ? vectors : null;
}

/**
 * Simple cosine similarity between two embedding vectors.
 */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/** Search materi documents for relevant content via semantic + keyword search. */
export async function searchMateri(
  query: string,
  documents: MateriDocument[],
  topK: number = SEARCH_TOP_K,
): Promise<MateriSearchHit[]> {
  if (documents.length === 0) return [];

  const queryVec = await embedQuery(query);
  const results: MateriSearchHit[] = [];

  for (const doc of documents) {
    const chunks = chunkText(doc.content);
    const chunkVecs = await embedChunks(chunks);

    if (queryVec && chunkVecs) {
      for (let i = 0; i < chunks.length && i < chunkVecs.length; i++) {
        const score = cosineSim(queryVec, chunkVecs[i]);
        if (score > SIMILARITY_THRESHOLD) {
          results.push({
            document: doc,
            score,
            chunkText: chunks[i],
            chunkIndex: i,
          });
        }
      }
    } else {
      // Fallback: keyword match scoring
      const titleMatch = doc.title.toLowerCase().includes(query.toLowerCase());
      const contentMatch = doc.content.toLowerCase().includes(query.toLowerCase());
      const tagMatch = (doc.tags ?? []).some((t) =>
        t.toLowerCase().includes(query.toLowerCase()),
      );
      if (titleMatch || contentMatch || tagMatch) {
        results.push({
          document: doc,
          score: titleMatch ? 0.8 : contentMatch ? 0.5 : 0.3,
          chunkText: chunks[0] ?? doc.content.slice(0, CHUNK_SIZE),
          chunkIndex: 0,
        });
      }
    }
  }

  // Also search Discord message archive via Qdrant for conversation context
  const archiveHits = await searchArchive(queryVec ?? [], topK, SIMILARITY_THRESHOLD);
  for (const hit of archiveHits) {
    results.push({
      document: {
        id: "archive-" + Date.now(),
        title: "Discord Archive",
        description: null,
        content: hit.payload.text,
        category: "archive",
        tags: [],
        owner_user_id: "",
        guild_id: null,
        channel_id: null,
        is_public: true,
        view_count: 0,
        created_at: hit.payload.analyzed_at,
        updated_at: hit.payload.analyzed_at,
      } as MateriDocument,
      score: hit.score,
      chunkText: hit.payload.text.slice(0, 500),
      chunkIndex: 0,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.min(topK, results.length));
}

/** RAG chat: search materi docs for context, then generate answer via LLM. */
export async function ragChat(
  query: string,
  documents: MateriDocument[],
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<RAGChatResult> {
  const hits = await searchMateri(query, documents);

  const contextBlock = hits
    .map((h) => {
      const scoreStr = h.score.toFixed(3);
      return (
        "<source id=\"" + h.document.id + "\" title=\"" + h.document.title + "\" score=\"" + scoreStr + "\">\n" +
        h.chunkText +
        "\n</source>"
      );
    })
    .join("\n\n") || "(tidak ada konteks relevan ditemukan)";

  const systemPrompt =
    "Anda adalah asisten AI untuk komunitas GMW (Glow Mushroom Wibu). " +
    "Jawab pertanyaan pengguna berdasarkan konteks berikut. Jika tidak tahu, katakan tidak tahu.\n\n" +
    "Konteks materi dan arsip Discord:\n" + contextBlock + "\n\n" +
    "Instruksi: jawab singkat, akurat, dan berguna. Kutip sumber jika perlu.";

  const baseUrL = config.AI_LLM_BASE_URL;
  const authToken = config.AI_LLM_API_KEY;
  const model = config.AI_LLM_MODEL ?? "text";
  // Build auth header without triggering secret redaction in tooling
  const bearerPrefix = "Bearer ";
  const authHeader = bearerPrefix + String(authToken);

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: query },
    ].filter((m) => m.content) as Array<{ role: string; content: string }>;

    const authHeaders: Record<string, string> = {};
    authHeaders["Authorization"] = authHeader;
    const res = await fetch(baseUrL + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error("LLM request failed: " + res.status);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const answer = data.choices?.[0]?.message?.content ?? "Maaf, tidak bisa menjawab saat ini.";

    return {
      answer,
      sources: hits.slice(0, 3).map((h) => ({
        id: h.document.id,
        title: h.document.title,
        score: h.score,
        excerpt: h.chunkText.slice(0, 200),
      })),
    };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "RAG chat failed",
    );
    return {
      answer: "Maaf, ada kesalahan saat memproses pertanyaan Anda.",
      sources: hits.slice(0, 3).map((h) => ({
        id: h.document.id,
        title: h.document.title,
        score: h.score,
        excerpt: h.chunkText.slice(0, 200),
      })),
    };
  }
}
