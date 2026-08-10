/**
 * mediaBatchProcessor.ts
 *
 * Processes media-content moderation batches — downloads images, runs vision
 * analysis, and calls the LLM for a batched moderation response. Extracted from
 * moderationOrchestrator.ts.
 */
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import type {
  AnalysisResult,
  AttachmentRecord,
  MessageRecord,
} from "../message-capture/types.js";
import { getChannelCulture } from "./channelCultureStore.js";
import type { RetryState } from "./llmCaller.js";
import { callModerationLLM } from "./llmCaller.js";
import { prepareMediaMessage } from "./mediaAnalysisClient.js";
import { buildUserProfilesBlock } from "./moderationBuilders.js";
import { buildSystemPrompt as buildSystemPromptModular } from "./moderationPrompt.js";
import { buildCorrectedFewShotExamples } from "./textBatchProcessor.js";
import { getUserProfile } from "./userProfileStore.js";

const log = createChildLogger("mediaBatchProcessor");

// ---------------------------------------------------------------------------
// Media batch — download + vision + single LLM call
// ---------------------------------------------------------------------------
export async function runMediaBatch(
  targets: MessageRecord[],
  contextBlock: string,
  attachments: AttachmentRecord[] | undefined,
): Promise<{ results: AnalysisResult[]; raw: unknown }> {
  if (!targets.length) return { results: [], raw: null };

  // Lazy init sticker cache
  const { isStickerCacheReady, initStickerCache } = await import(
    "./stickerCache.js"
  );
  if (!isStickerCacheReady()) {
    await initStickerCache().catch((err: unknown) =>
      log.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "Sticker cache init failed",
      ),
    );
  }

  // Phase A: Prepare ALL messages in parallel
  const prepared = await Promise.all(
    targets.map((target) => prepareMediaMessage(target, attachments)),
  );

  // Phase B: ONE batched LLM call
  const targetIds = targets.map((t) => t.id);
  const channelId = targets[0].channel_id;
  const channelCultureObj = channelId
    ? await getChannelCulture(channelId)
    : null;
  const channelCulture = channelCultureObj?.culture_summary;
  const correctedExamples = await buildCorrectedFewShotExamples();
  const systemText = buildSystemPromptModular({
    mode: "mixed",
    correctedExamples,
    channelCulture,
  });

  // Gather user profiles ONCE for the whole batch and emit a deduplicated
  // <user_profiles> map; per-message blocks (from prepareMediaMessage)
  // reference it via <user_profile_ref>.
  const profileByUser = new Map<string, string>();
  for (const t of targets) {
    if (profileByUser.has(t.user_id)) continue;
    const profile = await getUserProfile(t.user_id);
    profileByUser.set(t.user_id, profile?.profile_summary ?? "");
  }
  const userProfilesBlock = buildUserProfilesBlock(profileByUser);

  const messagesBlock = prepared.map((p) => p.messageBlock).join("\n");
  // Data/instruction separation: the system prompt is stable per mode — all
  // per-batch context (profiles, conversation) lives in the USER payload,
  // ordered oldest-first so targets come last.
  const userBlocks = [
    userProfilesBlock?.trimEnd() ?? "",
    contextBlock?.trimEnd() ?? "",
    `<messages_to_analyze>\n${messagesBlock}\n</messages_to_analyze>`,
  ].filter((b) => b.trim().length > 0);
  const userContent = userBlocks.join("\n\n");

  const perMsgTimeout = config.AI_LLM_MEDIA_ANALYSIS_TIMEOUT_MS ?? 60000;
  const batchTimeout = Math.min(
    Math.max(perMsgTimeout, perMsgTimeout * targets.length),
    300_000,
  );

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), batchTimeout);
  timeoutId.unref();

  try {
    const result = await callModerationLLM(
      async (_state: RetryState) => ({ system: systemText, user: userContent }),
      targetIds,
      `media-batch:${targetIds.length}msgs`,
      abortController.signal,
    );
    log.info(
      { mediaCount: targets.length, resultCount: result.results.length },
      "Media batch analysis complete",
    );
    return result;
  } catch (err: any) {
    if (err.name === "AbortError" || abortController.signal.aborted) {
      throw new Error(
        `Media batch analysis timed out after ${batchTimeout}ms for ${targets.length} messages`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
