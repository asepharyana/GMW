/**
 * textBatchProcessor.ts
 *
 * Processes text-only moderation batches — fetches URL content, runs SearXNG
 * searches, deduplicates short messages, splits into sub-batches, and calls
 * the LLM for analysis. Extracted from moderationOrchestrator.ts.
 */
import { createChildLogger } from "@/shared/logger/index";
import { delay } from "@/shared/utils/index";
import { config } from "../../shared/config/config.js";
import { resizeImageForVision } from "../attachment-upload/imageResizer.js";
import type {
  AnalysisResult,
  MessageRecord,
} from "../message-capture/types.js";
import { getChannelCulture } from "./channelCultureStore.js";
import type { ModerationPromptContent, RetryState } from "./llmCaller.js";
import { callModerationLLM } from "./llmCaller.js";
import { analyzeSingleMediaImage } from "./mediaAnalysisClient.js";
import {
  buildReferenceXml,
  escapeXml,
  formatReputationAttrs,
  getAnalysisContent,
  resolveDisplayName,
  resolveIsBot,
  resolveIsEdited,
  truncateForAi,
} from "./moderationBuilders.js";
import { buildSystemPrompt as buildSystemPromptModular } from "./moderationPrompt.js";
import { logModerationAnalysis } from "./responseLogger.js";
import {
  extractSearchQueries,
  formatSearchResults,
  searchSearxng,
} from "./searxngSearch.js";
import { buildTermGlossaryBlock } from "./termGlossary.js";
import { getRecentCorrectedModerations } from "./textCacheStore.js";
import { extractUrlsFromText, fetchUrlSafely } from "./urlFetcher.js";
import { initializeUserReputation } from "./userReputationStore.js";
import type { MessageImagePart } from "./visionAnalyzer.js";

const log = createChildLogger("textBatchProcessor");

// ---------------------------------------------------------------------------
// Few-shot correction builder
// ---------------------------------------------------------------------------
export async function buildCorrectedFewShotExamples(): Promise<string> {
  try {
    const corrections = await getRecentCorrectedModerations(5);
    if (corrections.length === 0) return "";
    const lines = [
      "## Contoh Koreksi False Positive (dari moderasi sebelumnya)",
      "Berikut adalah koreksi manual dari false positive yang pernah terjadi. Gunakan sebagai panduan tambahan:",
    ];
    for (const c of corrections) {
      const origFlags = c.originalFlags.join(", ") || "(none)";
      const corrFlags = c.correctedFlags.join(", ") || "(clean)";
      const notes = c.correctionNotes ? ` — ${c.correctionNotes}` : "";
      lines.push(
        `- Konten: "${c.contentSnippet.substring(0, 100)}" → sebelumnya di-flag sebagai [${origFlags}], dikoreksi menjadi [${corrFlags}]${notes}`,
      );
    }
    lines.push(
      "JANGAN ulangi kesalahan yang sama. Jika konten serupa dengan contoh di atas, gunakan koreksi yang sudah ditentukan.",
    );
    return lines.join("\n");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Text-only batch
// ---------------------------------------------------------------------------
export async function runTextOnlyBatch(
  targets: MessageRecord[],
  contextBlock: string,
): Promise<{ results: AnalysisResult[]; raw: unknown }> {
  if (!targets.length) return { results: [], raw: null };

  const maxBatchSize = config.AI_LLM_TEXT_BATCH_SIZE ?? 20;
  const timeoutMs = config.AI_LLM_TEXT_ANALYSIS_TIMEOUT_MS ?? 30000;

  // Parallel: URL fetch + SearXNG
  const urlFetchPromise = (async () => {
    const allUrls = new Set<string>();
    for (const msg of targets) {
      for (const url of extractUrlsFromText(msg.edited_content ?? msg.content))
        allUrls.add(url);
    }
    const urlArr = Array.from(allUrls).slice(0, 10);
    if (urlArr.length === 0) {
      return {
        text: new Map<string, string>(),
        image: new Map<string, { data: Buffer; mimeType: string }>(),
        title: new Map<string, string>(),
      };
    }
    const results = await Promise.allSettled(
      urlArr.map((url) => fetchUrlSafely(url)),
    );
    const textMap = new Map<string, string>();
    const imageMap = new Map<string, { data: Buffer; mimeType: string }>();
    const titleMap = new Map<string, string>();
    for (let i = 0; i < urlArr.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled") continue;
      const v = r.value;
      if (v.type === "text" && v.textContent) {
        textMap.set(urlArr[i], v.textContent);
        if (v.title) titleMap.set(urlArr[i], v.title);
      } else if (v.type === "image" && v.data && v.mimeType) {
        // Direct image link (or og:image followed from an HTML page) —
        // kept for vision analysis below.
        imageMap.set(urlArr[i], { data: v.data, mimeType: v.mimeType });
      }
    }
    return { text: textMap, image: imageMap, title: titleMap };
  })();

  const searxngPromise = (async () => {
    const queries = new Set<string>();
    for (const msg of targets) {
      for (const q of extractSearchQueries(msg.edited_content ?? msg.content))
        queries.add(q);
    }
    if (queries.size === 0) return new Map<string, string>();
    const queryArr = Array.from(queries).slice(0, 3);
    const results = await Promise.allSettled(
      queryArr.map((q) => searchSearxng(q)),
    );
    const map = new Map<string, string>();
    for (let i = 0; i < queryArr.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value.length > 0)
        map.set(queryArr[i], formatSearchResults(r.value));
    }
    return map;
  })();

  // Term glossary — per-word Wikipedia lookups for words the LLM may not
  // know (slang, jargon, regional language). Cached in Redis + in-memory, so
  // repeat terms resolve instantly and only genuinely new words hit SearXNG.
  const glossaryPromise = buildTermGlossaryBlock(
    targets.map((msg) => getAnalysisContent(msg)),
  ).catch(() => "");

  const [urlFetchMaps, searxngResults, glossaryBlock] = await Promise.all([
    urlFetchPromise,
    searxngPromise,
    glossaryPromise,
  ]);
  const urlFetchMap = urlFetchMaps.text;

  // Deduplicate identical short messages
  const shortContentGroups = new Map<string, MessageRecord[]>();
  const deduplicatedTargets: MessageRecord[] = [];
  const groupMapping = new Map<string, string[]>();
  for (const msg of targets) {
    const rawContent = (msg.edited_content ?? msg.content).trim();
    if (rawContent.length > 0 && rawContent.length < 20) {
      const groupKey = rawContent.toLowerCase();
      if (shortContentGroups.has(groupKey)) {
        shortContentGroups.get(groupKey)?.push(msg);
      } else {
        shortContentGroups.set(groupKey, [msg]);
        deduplicatedTargets.push(msg);
      }
    } else {
      deduplicatedTargets.push(msg);
    }
  }
  for (const [, members] of shortContentGroups) {
    if (members.length > 1)
      groupMapping.set(
        members[0].id,
        members.map((m) => m.id),
      );
  }

  // Split into sub-batches
  const subBatches: MessageRecord[][] = [];
  for (let i = 0; i < deduplicatedTargets.length; i += maxBatchSize) {
    subBatches.push(deduplicatedTargets.slice(i, i + maxBatchSize));
  }

  const allResults: AnalysisResult[] = [];
  let lastRaw: unknown = null;
  const channelId = targets[0]?.channel_id ?? "";
  const channelCultureObj = channelId
    ? await getChannelCulture(channelId)
    : null;
  const channelCulture = channelCultureObj?.culture_summary;
  // Corrected false-positive examples are static per batch — fetch ONCE
  // here instead of inside the per-sub-batch retry closure (which would
  // re-query the DB on every sub-batch and every parse-error retry).
  const correctedExamples = await buildCorrectedFewShotExamples();

  for (let i = 0; i < subBatches.length; i++) {
    const batch = subBatches[i];
    const targetIds = batch.map((t) => t.id);

    // ── Per-user reputation context (fetched ONCE per unique user, in
    //    parallel). Personal profile descriptions are intentionally NOT
    //    injected — they bloat the prompt (less room per request) and add a
    //    per-user DB/Redis round-trip for little moderation signal. Only the
    //    behavioural <user_reputation> history is sent. ─────────────────────
    const uniqueUserIds = [...new Set(batch.map((m) => m.user_id))];
    const batchGuildId = batch[0]?.guild_id ?? "";
    const userFetches = await Promise.all(
      uniqueUserIds.map(async (uid) => {
        const rep = await initializeUserReputation(uid, batchGuildId);
        return { uid, rep };
      }),
    );
    const userContexts = new Map<string, string>();
    for (const { uid, rep } of userFetches) {
      const repAttrs = formatReputationAttrs(rep);
      userContexts.set(uid, `<user_reputation ${repAttrs}/>`);
    }

    // ── URL images → multimodal vision evidence ─────────────────────────
    // The text batch fetches inline URLs; whenever one resolved to an image
    // (direct image link, or og:image followed from an HTML page), run the
    // vision model and append its description as media evidence. If any
    // message in the sub-batch produced image evidence, the prompt switches
    // to "mixed" mode so media-analysis instructions/examples are injected
    // — a link to media is analyzed as media, not as bare text.
    const batchImageEvidence = new Map<string, string[]>();
    let batchHasImageEvidence = false;
    const urlImages = urlFetchMaps.image;
    const urlTitles = urlFetchMaps.title;
    if (urlImages.size > 0) {
      const maxDim = config.AI_LLM_IMAGE_MAX_DIMENSION ?? 1024;
      const evidenceSets = await Promise.all(
        batch.map(async (msg) => {
          const content = getAnalysisContent(msg);
          const pics = extractUrlsFromText(content)
            .slice(0, 3)
            .filter((url) => urlImages.has(url));
          if (pics.length === 0) return { id: msg.id, lines: [] as string[] };
          const lines = await Promise.all(
            pics.map(async (url) => {
              const img = urlImages.get(url);
              if (!img) return null;
              try {
                const { data: resizedBuffer, mimeType: resizedMime } =
                  await resizeImageForVision(img.data, maxDim);
                const part: MessageImagePart = {
                  type: "image_url",
                  image_url: {
                    url: `data:${resizedMime};base64,${resizedBuffer.toString("base64")}`,
                  },
                  sourceLabel: `[gambar dari URL ${url} (inline), pesan id=${msg.id}]`,
                };
                // Bound vision time so a dead vision model can't stall the
                // whole text batch — a timeout just skips the evidence.
                const timedOut = delay(15000).then(() => null as string | null);
                return await Promise.race([
                  analyzeSingleMediaImage(msg.id, part),
                  timedOut,
                ]);
              } catch {
                return null;
              }
            }),
          );
          return {
            id: msg.id,
            lines: lines.filter((l): l is string => Boolean(l)),
          };
        }),
      );
      for (const set of evidenceSets) {
        if (set.lines.length > 0) {
          batchImageEvidence.set(set.id, set.lines);
          batchHasImageEvidence = true;
        }
      }
    }

    const buildContent = async (
      state: RetryState,
    ): Promise<ModerationPromptContent> => {
      const correction = state.lastParseError
        ? {
            error: state.lastParseError,
            preview: state.lastInvalidContent?.slice(0, 800) ?? "<empty>",
          }
        : undefined;
      const systemText = buildSystemPromptModular({
        mode: batchHasImageEvidence ? "mixed" : "text",
        correction,
        correctedExamples,
        channelCulture,
      });

      const messagesBlock = (
        await Promise.all(
          batch.map(async (msg) => {
            const content = truncateForAi(getAnalysisContent(msg));
            const msgUrls = extractUrlsFromText(content);
            const urlContexts = msgUrls
              .map((url) => {
                const ft = urlFetchMap.get(url);
                if (!ft) return null;
                const title = urlTitles.get(url);
                const titleAttr = title ? ` title="${escapeXml(title)}"` : "";
                return `<web_content url="${escapeXml(url)}"${titleAttr}>${escapeXml(ft)}</web_content>`;
              })
              .filter(Boolean)
              .join("\n");
            const webContext = urlContexts ? `\n${urlContexts}` : "";
            const mediaEvidenceCtx = (batchImageEvidence.get(msg.id) ?? [])
              .map((line) => `\n${line}`)
              .join("");
            const userCtx = userContexts.get(msg.user_id) ?? "";
            const refXml = await buildReferenceXml(msg);
            const repetitionCount = groupMapping.get(msg.id)?.length ?? 1;
            const isBot = resolveIsBot(msg);
            const isEdited = resolveIsEdited(msg);
            return `<message id="${escapeXml(msg.id)}" user="${escapeXml(resolveDisplayName(msg))}" time="${new Date(msg.created_at).toISOString()}"${repetitionCount > 1 ? ` repetitions="${repetitionCount}"` : ""}${isBot ? ` bot="true"` : ""}${isEdited ? ` edited="true"` : ""}>\n  ${userCtx}${refXml ? `\n  ${refXml}` : ""}\n  <content>${escapeXml(content)}</content>${webContext}${mediaEvidenceCtx}\n</message>`;
          }),
        )
      ).join("\n");

      const searxngBlock =
        searxngResults.size > 0
          ? `<web_searches>\n${Array.from(searxngResults.entries())
              .map(
                ([q, xml]) =>
                  `  <search_query query="${escapeXml(q)}">\n${xml}  </search_query>`,
              )
              .join("\n")}\n</web_searches>`
          : "";
      // Data/instruction separation: the system prompt is stable per mode —
      // all per-batch context (conversation, web evidence) lives in the USER
      // payload, ordered oldest-first so targets come last. Personal user
      // profile descriptions are intentionally omitted (see above).
      const userBlocks = [
        contextBlock?.trimEnd() ?? "",
        searxngBlock,
        glossaryBlock,
        `<messages_to_analyze>\n${messagesBlock}\n</messages_to_analyze>`,
      ].filter((b) => b.trim().length > 0);
      return {
        system: systemText,
        user: userBlocks.join("\n\n"),
      };
    };

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
    timeoutId.unref();

    let batchResult: { results: AnalysisResult[]; raw: unknown };
    try {
      batchResult = await callModerationLLM(
        buildContent,
        targetIds,
        `text-batch-${i + 1}`,
        abortController.signal,
      );
    } catch (err: any) {
      if (err.name === "AbortError" || abortController.signal.aborted) {
        throw new Error(
          `Text-only batch sub-batch ${i + 1} timed out for messages ${targetIds.join(", ")}`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // Fan-out results for deduplicated messages
    const fannedOutResults =
      groupMapping.size > 0
        ? batchResult.results.flatMap((result) => {
            const members = groupMapping.get(result.messageId);
            return members
              ? members.map((memberId) => ({ ...result, messageId: memberId }))
              : [result];
          })
        : batchResult.results;

    allResults.push(...fannedOutResults);
    if (batchResult.raw) lastRaw = batchResult.raw;

    logModerationAnalysis(
      targetIds,
      config.AI_LLM_MODEL,
      batchResult.results,
      0,
      (
        batchResult.raw as {
          usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          };
        } | null
      )?.usage ?? undefined,
    );
  }

  log.debug(
    {
      targetCount: targets.length,
      resultCount: allResults.length,
      subBatchCount: subBatches.length,
    },
    "Text-only batch analysis complete",
  );
  return { results: allResults, raw: lastRaw };
}
