/**
 * llmCaller.ts
 *
 * Shared LLM call + parse + retry helper extracted from moderationOrchestrator
 * to break the circular import chain:
 *
 *   moderationOrchestrator → mediaBatchProcessor / textBatchProcessor
 *   mediaBatchProcessor / textBatchProcessor → moderationOrchestrator (callModerationLLM)
 *
 * Both sides now import from this module instead.
 */

import type { ChatCompletion } from "openai/resources/chat/completions";
import { createChildLogger } from "@/shared/logger/index";
import { delay, retryWithBackoff } from "@/shared/utils/index";
import { config } from "../../shared/config/config.js";
import type { AnalysisResult } from "../message-capture/types.js";
import { llmChat } from "./llmClient.js";
import { logModerationError } from "./responseLogger.js";

const log = createChildLogger("llm-caller");

// ---------------------------------------------------------------------------
// Retry state
// ---------------------------------------------------------------------------
export interface RetryState {
  lastParseError: string | null;
  lastInvalidContent: string | null;
}

/**
 * Content builder contract: produces the moderation prompt split into
 * SYSTEM (rules / output schema / context — stable) and USER (the actual
 * `<messages_to_analyze>` payload). Kept as two roles so routers and
 * providers that treat system messages differently get the correct framing.
 */
export interface ModerationPromptContent {
  system: string;
  user: string;
}

// ---------------------------------------------------------------------------
// Shared LLM call + parse + fallback helper
// ---------------------------------------------------------------------------
export async function callModerationLLM(
  buildContent: (
    state: RetryState,
  ) => Promise<string | ModerationPromptContent>,
  targetIds: string[],
  label: string,
  signal?: AbortSignal,
): Promise<{
  results: AnalysisResult[];
  raw: ChatCompletion | null;
}> {
  const state: RetryState = {
    lastParseError: null,
    lastInvalidContent: null,
  };

  let parsed: AnalysisResult[];
  let result: ChatCompletion | null = null;

  try {
    const analysis = await retryWithBackoff(
      async () => {
        try {
          const content = await buildContent(state);
          const messages =
            typeof content === "string"
              ? [{ role: "user" as const, content }]
              : [
                  { role: "system" as const, content: content.system },
                  { role: "user" as const, content: content.user },
                ];
          const completion = await llmChat({
            messages,
            max_tokens: 16384,
            jsonResponse: { type: "json_object" },
            retries: 0,
            signal,
          });

          if (!completion)
            throw new Error("LLM client unavailable (no API key)");
          if (
            !completion.choices ||
            !Array.isArray(completion.choices) ||
            !completion.choices[0]
          ) {
            throw new Error("Invalid LLM response structure");
          }

          const rawContent = completion.choices[0].message?.content;
          if (!rawContent) throw new Error("No content in LLM response");

          try {
            const { parseModerationResponse } = await import(
              "./moderationResponseParser.js"
            );
            return {
              parsed: parseModerationResponse(rawContent, targetIds),
              result: completion,
            };
          } catch (parseError) {
            state.lastParseError =
              parseError instanceof Error
                ? parseError.message
                : String(parseError);
            state.lastInvalidContent = rawContent;
            log.warn(
              {
                error: state.lastParseError,
                contentLength: rawContent.length,
                targetIds,
                model: config.AI_LLM_MODEL,
              },
              `Failed to parse moderation response (${label})`,
            );
            throw parseError;
          }
        } catch (apiError: any) {
          if (apiError?.status === 429) {
            log.warn(
              { status: 429, targetIds, model: config.AI_LLM_MODEL, label },
              "LLM API 429 — will retry",
            );
            await delay(Math.floor(Math.random() * 1000) + 500);
            throw apiError;
          }
          if (apiError?.status === 401 || apiError?.status === 403) {
            const abortErr = new Error(String(apiError));
            abortErr.name = "AbortError";
            throw abortErr;
          }
          if (
            apiError?.status >= 500 ||
            apiError?.code === "ECONNRESET" ||
            apiError?.code === "ETIMEDOUT" ||
            apiError?.name === "APIError"
          ) {
            throw apiError;
          }
          throw apiError;
        }
      },
      {
        retries: 3,
        minTimeout: 5_000,
        maxTimeout: 60_000,
        factor: 3,
        signal,
      },
    );
    parsed = analysis.parsed;
    result = analysis.result;

    // [I] Token usage accounting — surface provider-reported usage per batch
    // so cost per channel/guild can be tracked (routers bill per token).
    const usage = result?.usage;
    if (usage && (usage.prompt_tokens || usage.completion_tokens)) {
      log.info(
        {
          label,
          targetIds,
          model: config.AI_LLM_MODEL,
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
        },
        `LLM usage (${label})`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;

    const errorMsg = err instanceof Error ? err.message : String(err);
    const isApiError = !state.lastInvalidContent;
    const apiErrorCode = isApiError
      ? `MOD_${Date.now().toString(36).slice(0, 6)}`
      : null;

    if (isApiError) {
      log.warn(
        { error: errorMsg, targetIds, model: config.AI_LLM_MODEL, label },
        `LLM API error after retries (${label})`,
      );
      logModerationError(
        targetIds,
        config.AI_LLM_MODEL,
        err instanceof Error ? err : new Error(String(err)),
        { phase: "api_call", label },
      );
      parsed = targetIds.map((id) => ({
        messageId: id,
        status: "error" as const,
        flags: ["analysis_api_failed"],
        score: 0,
        analysis: `Analisis gagal karena error pada server AI dan memerlukan pemeriksaan manual. Error code: ${apiErrorCode}`,
        categories: ["analysis_api_failed"],
        severity: "none" as const,
        confidence: 0,
        recommendedAction: "review" as const,
        policyVersion: "default-2026-05-30",
        evidence: [],
      }));
    } else {
      const parseMsg = err instanceof Error ? err.message : String(err);
      const contentPreview =
        state.lastInvalidContent?.substring(0, 500) ?? "<empty>";
      log.error(
        {
          error: parseMsg,
          contentLength: state.lastInvalidContent?.length ?? 0,
          contentPreview,
          targetIds,
          model: config.AI_LLM_MODEL,
        },
        `Robust Fallback (${label}): parse error`,
      );
      logModerationError(
        targetIds,
        config.AI_LLM_MODEL,
        err instanceof Error ? err : new Error(String(err)),
        {
          phase: "parse_response",
          label,
          contentLength: state.lastInvalidContent?.length ?? 0,
        },
      );
      const errorCode = `MOD_${Date.now().toString(36).slice(0, 6)}`;
      parsed = targetIds.map((id) => ({
        messageId: id,
        status: "error" as const,
        flags: ["analysis_parse_failed"],
        score: 0,
        analysis: `Analisis gagal dan memerlukan pemeriksaan manual. Error code: ${errorCode}`,
        categories: ["analysis_parse_failed"],
        severity: "none" as const,
        confidence: 0,
        recommendedAction: "review" as const,
        policyVersion: "default-2026-05-30",
        evidence: [],
      }));
    }
  }
  return { results: parsed, raw: result };
}
