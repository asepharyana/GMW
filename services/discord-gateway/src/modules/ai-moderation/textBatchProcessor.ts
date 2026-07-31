/**
 * textBatchProcessor.ts
 *
 * Processes text-only moderation batches — fetches URL content, runs SearXNG
 * searches, deduplicates short messages, splits into sub-batches, and calls
 * the LLM for analysis. Extracted from moderationOrchestrator.ts.
 */
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import type {
  AnalysisResult,
  MessageRecord,
} from "../message-capture/types.js";
import { getChannelCulture } from "./channelCultureStore.js";
import type { ModerationPromptContent, RetryState } from "./llmCaller.js";
import { callModerationLLM } from "./llmCaller.js";
import {
  buildReferenceXml,
  escapeXml,
  getAnalysisContent,
} from "./moderationBuilders.js";
import {
  buildSystemPrompt as buildSystemPromptModular,
  sanitizeAiContent,
} from "./moderationPrompt.js";
import { logModerationAnalysis } from "./responseLogger.js";
import {
  extractSearchQueries,
  formatSearchResults,
  searchSearxng,
} from "./searxngSearch.js";
import { getRecentCorrectedModerations } from "./textCacheStore.js";
import { extractUrlsFromText, fetchUrlSafely } from "./urlFetcher.js";
import { getUserProfile } from "./userProfileStore.js";
import { initializeUserReputation } from "./userReputationStore.js";

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
  contextText: string,
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
    if (urlArr.length === 0) return new Map<string, string>();
    const results = await Promise.allSettled(
      urlArr.map((url) => fetchUrlSafely(url)),
    );
    const map = new Map<string, string>();
    for (let i = 0; i < urlArr.length; i++) {
      const r = results[i];
      if (
        r.status === "fulfilled" &&
        r.value.type === "text" &&
        r.value.textContent
      ) {
        map.set(urlArr[i], r.value.textContent);
      }
    }
    return map;
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

  const [urlFetchMap, searxngResults] = await Promise.all([
    urlFetchPromise,
    searxngPromise,
  ]);

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

  for (let i = 0; i < subBatches.length; i++) {
    const batch = subBatches[i];
    const targetIds = batch.map((t) => t.id);

    // User reputation + profiles
    const userContexts = new Map<string, string>();
    const userProfiles = new Map<string, string>();
    for (const msg of batch) {
      if (!userContexts.has(msg.user_id)) {
        const rep = await initializeUserReputation(msg.user_id, msg.guild_id);
        userContexts.set(
          msg.user_id,
          `<user_reputation trust_score="${rep.trust_score}" />`,
        );
      }
      if (!userProfiles.has(msg.user_id)) {
        const profile = await getUserProfile(msg.user_id);
        userProfiles.set(
          msg.user_id,
          profile
            ? `<user_profile>${sanitizeAiContent(profile.profile_summary)}</user_profile>`
            : "",
        );
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
      const correctedExamples = await buildCorrectedFewShotExamples();
      const systemText = buildSystemPromptModular({
        contextText,
        mode: "text",
        correction,
        correctedExamples,
        channelCulture,
      });

      const messagesBlock = (
        await Promise.all(
          batch.map(async (msg) => {
            const content = getAnalysisContent(msg);
            const msgUrls = extractUrlsFromText(content);
            const urlContexts = msgUrls
              .map((url) => {
                const ft = urlFetchMap.get(url);
                return ft
                  ? `<web_content url="${escapeXml(url)}">${escapeXml(ft)}</web_content>`
                  : null;
              })
              .filter(Boolean)
              .join("\n");
            const webContext = urlContexts ? `\n${urlContexts}` : "";
            const userCtx = userContexts.get(msg.user_id) ?? "";
            const userProfileCtx = userProfiles.get(msg.user_id) ?? "";
            const refXml = await buildReferenceXml(msg);
            return `<message id="${msg.id}" user="${msg.username}">\n  ${userCtx}${userProfileCtx ? `\n  ${userProfileCtx}` : ""}${refXml ? `\n  ${refXml}` : ""}\n  <content>${escapeXml(content)}</content>${webContext}\n</message>`;
          }),
        )
      ).join("\n");

      const searxngBlock =
        searxngResults.size > 0
          ? `\n\n<web_searches>\n${Array.from(searxngResults.entries())
              .map(
                ([q, xml]) =>
                  `  <search_query query="${escapeXml(q)}">\n${xml}  </search_query>`,
              )
              .join("\n")}\n</web_searches>`
          : "";
      return {
        system: systemText,
        user: `${searxngBlock}\n\n<messages_to_analyze>\n${messagesBlock}\n</messages_to_analyze>`,
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
