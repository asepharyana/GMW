/**
 * textBatchProcessor.ts
 *
 * Processes text-only moderation batches — fetches URL content, runs Wikipedia
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
import { estimateTokens } from "./conversationContext.js";
import {
  analyzeBatchWithJev,
  isJevEnabled,
  JEV_POLICY_VERSION,
  type JevTarget,
} from "./jevAnalyzer.js";
import type { ModerationPromptContent, RetryState } from "./llmCaller.js";
import { callModerationLLM } from "./llmCaller.js";
import { analyzeSingleMediaImage } from "./mediaAnalysisClient.js";
import {
  buildReferenceXml,
  escapeXml,
  getAnalysisContent,
  resolveDisplayName,
  resolveIsBot,
  resolveIsEdited,
  truncateForAi,
} from "./moderationBuilders.js";
import { buildSystemPrompt as buildSystemPromptModular } from "./moderationPrompt.js";
import { logModerationAnalysis } from "./responseLogger.js";
import { buildTermGlossaryBlock } from "./termGlossary.js";
import { getRecentCorrectedModerations } from "./textCacheStore.js";
import { extractUrlsFromText, fetchUrlSafely } from "./urlFetcher.js";
import type { MessageImagePart } from "./visionAnalyzer.js";
import {
  extractSearchQueries,
  formatSearchResults,
  wikipediaSearch,
} from "./wikipediaClient.js";

const log = createChildLogger("textBatchProcessor");

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Maps of URL-fetch outcomes, keyed by the fetched URL (text, image, title). */
interface UrlFetchResult {
  text: Map<string, string>;
  image: Map<string, { data: Buffer; mimeType: string }>;
  title: Map<string, string>;
}

/** Provider-reported token usage from a raw LLM/Jev payload (may be absent). */
interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Read provider-reported token usage from either the LLM or Jev raw payload. */
function extractUsage(raw: unknown): TokenUsage | undefined {
  return (raw as { usage?: TokenUsage } | null)?.usage ?? undefined;
}

/** Render the `<web_searches>` XML block from the query→results map. */
function buildWebSearchBlock(webSearchResults: Map<string, string>): string {
  if (webSearchResults.size === 0) return "";
  const entries = Array.from(webSearchResults.entries())
    .map(
      ([q, xml]) =>
        `  <search_query query="${escapeXml(q)}">\n${xml}  </search_query>`,
    )
    .join("\n");
  return `<web_searches>\n${entries}\n</web_searches>`;
}

/** Raw message content as the models see it (truncated + sanitized). */
function analysisContentOf(msg: MessageRecord): string {
  return truncateForAi(getAnalysisContent(msg));
}

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
// Few-shot correction cache (refreshes hourly)
// ---------------------------------------------------------------------------
let correctedExamplesCache: string | null = null;
let correctedExamplesCacheAt = 0;
const CORRECTED_CACHE_TTL_MS = 60 * 60 * 1000;

async function getCachedCorrectedExamples(): Promise<string> {
  const now = Date.now();
  if (
    correctedExamplesCache !== null &&
    now - correctedExamplesCacheAt < CORRECTED_CACHE_TTL_MS
  ) {
    return correctedExamplesCache;
  }
  correctedExamplesCache = await buildCorrectedFewShotExamples();
  correctedExamplesCacheAt = now;
  return correctedExamplesCache;
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
  const urlFetchPromise: Promise<UrlFetchResult> = (async () => {
    const allUrls = new Set<string>();
    for (const msg of targets) {
      for (const url of extractUrlsFromText(msg.edited_content ?? msg.content))
        allUrls.add(url);
    }
    // Domain dedup: max 3 URLs per domain to avoid rate-limiting
    const domainCounts = new Map<string, number>();
    const urlArr: string[] = [];
    for (const url of allUrls) {
      try {
        const domain = new URL(url).hostname;
        const count = domainCounts.get(domain) ?? 0;
        if (count >= 3) continue;
        domainCounts.set(domain, count + 1);
      } catch {
        /* invalid URL, skip */
        continue;
      }
      urlArr.push(url);
      if (urlArr.length >= 10) break;
    }
    if (urlArr.length === 0) {
      return {
        text: new Map(),
        image: new Map(),
        title: new Map(),
      } satisfies UrlFetchResult;
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

  const webSearchPromise = (async () => {
    const queries = new Set<string>();
    for (const msg of targets) {
      for (const q of extractSearchQueries(msg.edited_content ?? msg.content))
        queries.add(q);
    }
    if (queries.size === 0) return new Map<string, string>();
    const queryArr = Array.from(queries).slice(0, 3);
    const results = await Promise.allSettled(
      queryArr.map((q) => wikipediaSearch(q)),
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
  const glossaryPromise = buildTermGlossaryBlock(
    targets.map((msg) => getAnalysisContent(msg)),
  ).catch(() => "");

  const [urlFetchMaps, webSearchResults, glossaryBlock] = await Promise.all([
    urlFetchPromise,
    webSearchPromise,
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
  const correctedExamples = await getCachedCorrectedExamples();

  // ── URL images → multimodal vision evidence (hoisted out of the sub-batch
  //     loop) ───────────────────────────────────────────────────────────
  // The text batch fetches inline URLs; whenever one resolved to an image
  // (direct image link, or og:image followed from an HTML page), run the
  // vision model and append its description as media evidence. It depends
  // ONLY on the fetched URL images + the full target set — not on how the
  // targets are later split into sub-batches — so compute it ONCE for the
  // whole batch instead of re-running the vision pass per sub-batch. If any
  // message produced image evidence, the prompt switches to "mixed" mode so
  // media-analysis instructions/examples are injected — a link to media is
  // analyzed as media, not as bare text.
  const batchImageEvidence = new Map<string, string[]>();
  let batchHasImageEvidence = false;
  const urlImages = urlFetchMaps.image;
  const urlTitles = urlFetchMaps.title;
  if (urlImages.size > 0) {
    const maxDim = config.AI_LLM_IMAGE_MAX_DIMENSION ?? 1024;
    const evidenceSets = await Promise.all(
      targets.map(async (msg) => {
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

  for (let i = 0; i < subBatches.length; i++) {
    const batch = subBatches[i];
    const targetIds = batch.map((t) => t.id);

    // No per-user reputation/profile context is injected into the prompt —
    // the user asked to keep the AI analysis context minimal (raw messages
    // only). Trust/infraction state is still tracked in the DB for
    // enforcement, just not shown to the LLM.

    const buildContent = async (
      state: RetryState,
      subset?: MessageRecord[],
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

      const workingSet = subset ?? batch;
      const messagesBlock = (
        await Promise.all(
          workingSet.map(async (msg) => {
            const content = analysisContentOf(msg);
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
            const refXml = await buildReferenceXml(msg);
            const repetitionCount = groupMapping.get(msg.id)?.length ?? 1;
            const isBot = resolveIsBot(msg);
            const isEdited = resolveIsEdited(msg);
            return `<message id="${escapeXml(msg.id)}" user="${escapeXml(resolveDisplayName(msg))}" time="${new Date(msg.created_at).toISOString()}"${repetitionCount > 1 ? ` repetitions="${repetitionCount}"` : ""}${isBot ? ` bot="true"` : ""}${isEdited ? ` edited="true"` : ""}>\n  ${refXml ? `\n  ${refXml}` : ""}\n  <content>${escapeXml(content)}</content>${webContext}${mediaEvidenceCtx}\n</message>`;
          }),
        )
      ).join("\n");

      const webSearchBlock = buildWebSearchBlock(webSearchResults);
      // Data/instruction separation: the system prompt is stable per mode —
      // all per-batch context (conversation, web evidence) lives in the USER
      // payload, ordered oldest-first so targets come last. Personal user
      // profile descriptions are intentionally omitted (see above).
      const userBlocks = [
        contextBlock?.trimEnd() ?? "",
        webSearchBlock,
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

    let batchResult: { results: AnalysisResult[]; raw: unknown } = {
      results: [],
      raw: null,
    };
    // Per-sub-batch verdicts before fan-out (Jev + LLM fallback merged).
    let subBatchResults: AnalysisResult[] = [];
    try {
      // Output budget scales with the prompt: the JSON verdict block is
      // roughly proportional to message count, so a small sub-batch doesn't
      // need to reserve a full 16k completion window. Estimated here from
      // raw materials (system/rules baseline ~2k + context + message
      // bodies) instead of inside buildContent, because max_tokens must be
      // known at call time.
      const subBatchPromptEstimate =
        2000 +
        estimateTokens(contextBlock ?? "") +
        batch.reduce(
          (sum, m) => sum + estimateTokens(m.edited_content ?? m.content) + 50,
          0,
        );
      const dynamicMaxTokens = Math.min(
        16384,
        Math.max(2048, Math.ceil(subBatchPromptEstimate * 1.5)),
      );

      // ── Jev-first (TypeSafe System One) with LLM fallback ────────────────
      // Jev is the PRIMARY text analyzer: ONE systemOne call per sub-batch
      // (5 typed questions × N messages, evaluated in parallel by Jev).
      // Verdicts that pass the acceptance gate are used directly; anything
      // Jev rejects (low confidence / inconsistent) and any Jev API failure
      // falls back to the existing LLM call — fail-open, never dead.
      if (isJevEnabled()) {
        const jevTargets: JevTarget[] = batch.map((msg) => ({
          id: msg.id,
          user: resolveDisplayName(msg),
          content: analysisContentOf(msg),
        }));
        const jevOutcome = await analyzeBatchWithJev(
          jevTargets,
          {
            contextBlock,
            webSearchBlock: buildWebSearchBlock(webSearchResults),
            glossaryBlock,
            channelCulture: channelCultureObj?.culture_summary,
          },
          abortController.signal,
          correctedExamples,
        );

        subBatchResults.push(...jevOutcome.results);
        if (jevOutcome.results.length > 0) {
          log.info(
            {
              subBatch: i + 1,
              accepted: jevOutcome.results.length,
              rejected: jevOutcome.rejectedIds.length,
            },
            "Jev analyzed sub-batch — accepted verdicts kept, rejected go to LLM",
          );
        }

        // Which targets still need the LLM?
        const coveredIds = new Set(subBatchResults.map((r) => r.messageId));
        const llmTargets = batch.filter((m) => !coveredIds.has(m.id));

        if (llmTargets.length > 0) {
          const llmResult = await callModerationLLM(
            (state) => buildContent(state, llmTargets),
            llmTargets.map((m) => m.id),
            `text-batch-${i + 1}-jev-fallback`,
            abortController.signal,
            dynamicMaxTokens,
          );
          subBatchResults.push(...llmResult.results);
          batchResult = llmResult;
          logModerationAnalysis(
            llmTargets.map((m) => m.id),
            config.AI_LLM_MODEL,
            llmResult.results,
            0,
            extractUsage(llmResult.raw),
          );
        } else {
          // Jev accepted everything — no LLM usage to attribute.
          batchResult = { results: subBatchResults, raw: null };
        }
      } else {
        // Jev disabled / unconfigured — pure LLM path (unchanged).
        batchResult = await callModerationLLM(
          buildContent,
          targetIds,
          `text-batch-${i + 1}`,
          abortController.signal,
          dynamicMaxTokens,
        );
        subBatchResults = batchResult.results;
      }
    } catch (err: unknown) {
      const isAbort =
        (err instanceof Error && err.name === "AbortError") ||
        abortController.signal.aborted;
      if (isAbort) {
        // Sub-batch timed out — log but DO NOT throw. Previous sub-batches'
        // results are already in allResults; throwing would discard them.
        log.warn(
          { subBatch: i + 1, targetIds, timeoutMs },
          "Sub-batch timed out — preserving partial results from prior sub-batches",
        );
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // Fan-out results for deduplicated messages (applies to Jev + LLM
    // verdicts alike — they only consume AnalysisResult[]).
    const fannedOutResults =
      groupMapping.size > 0
        ? subBatchResults.flatMap((result) => {
            const members = groupMapping.get(result.messageId);
            return members
              ? members.map((memberId) => ({ ...result, messageId: memberId }))
              : [result];
          })
        : subBatchResults;

    allResults.push(...fannedOutResults);
    if (batchResult.raw) lastRaw = batchResult.raw;

    if (subBatchResults.length > 0) {
      logModerationAnalysis(
        targetIds,
        subBatchResults.every((r) => r.policyVersion === JEV_POLICY_VERSION)
          ? config.AI_LLM_JEV_MODEL
          : config.AI_LLM_MODEL,
        subBatchResults,
        0,
        extractUsage(batchResult.raw),
      );
    }
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
