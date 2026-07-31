/**
 * Centralised LLM chat completion helper.
 *
 * All `openai.chat.completions.create` calls in the moderation subsystem
 * go through this module so that model, concurrency, retry, and token
 * defaults are maintained in one place.
 */

import OpenAI from "openai";
import pLimit from "p-limit";
import { createChildLogger } from "@/shared/logger/index";
import { retryWithBackoff } from "@/shared/utils/index";
import { config } from "../../shared/config/config.js";

const log = createChildLogger("llm-client");

// ---------------------------------------------------------------------------
// Concurrency limiter for LLM API calls (inlined from concurrencyLimiter.ts)
// ---------------------------------------------------------------------------

const llmSemaphore = pLimit(config.AI_LLM_MAX_CONCURRENT ?? 5);

let activeCount = 0;
let pendingCount = 0;

export async function withLlmConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  pendingCount++;
  log.debug(
    { activeCount, pendingCount, maxConcurrent: config.AI_LLM_MAX_CONCURRENT },
    "Queuing LLM request",
  );

  return llmSemaphore(async () => {
    pendingCount--;
    activeCount++;

    if (activeCount >= (config.AI_LLM_MAX_CONCURRENT ?? 5)) {
      log.warn(
        { activeCount, maxConcurrent: config.AI_LLM_MAX_CONCURRENT },
        "LLM concurrency limit reached",
      );
    }

    try {
      return await fn();
    } finally {
      activeCount--;
    }
  });
}

/**
 * Covers all LLM response chunk shapes the streaming handler supports.
 * Different providers (OpenAI, Anthropic-compatible, local LLMs) may return
 * content in different fields — we try them all via optional chaining.
 */
type LLMResponseChunk = {
  choices?: Array<{
    delta?: { content?: string | null };
    message?: { content?: string | null };
    finish_reason?: string | null;
    text?: string;
  }>;
  message?: { content?: string | null };
  content?: string;
  response?: string;
  finish_reason?: string;
};

// ---------------------------------------------------------------------------
// Lazy singleton — created on first use so that config is always resolved.
// ---------------------------------------------------------------------------

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!config.AI_LLM_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: config.AI_LLM_API_KEY,
      baseURL: config.AI_LLM_BASE_URL,
      maxRetries: 0,
      timeout: 60_000, // Diperbesar dari 15s ke 60s untuk mengakomodasi model delay tinggi
    });
  }
  return openaiClient;
}

const DEFAULT_RETRIES = 2;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LlmCallOpts {
  /** Conversation to send.  Either a string (→ single user message) or an array of messages. */
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  /** Which model to use (defaults to config.AI_LLM_MODEL). */
  model?: string;
  /** Max output tokens (defaults to 8192). */
  max_tokens?: number;
  /** Temperature (defaults to 0.2). */
  temperature?: number;
  /** Top-p (defaults to 0.95). */
  top_p?: number;
  /** Force JSON output via response_format: { type: "json_object" }. */
  jsonResponse?: { type: "json_object" };
  /** Extra retries beyond DEFAULT_RETRIES (default 2). */
  retries?: number;
  /** Whether to use streaming (if true, will consume stream and return aggregated result) */
  stream?: boolean;
  /** Optional AbortSignal to cancel the API request */
  signal?: AbortSignal;
}

/**
 * Call the LLM with sensible defaults: concurrency cap, retry, model, tokens.
 *
 * Returns the raw OpenAI ChatCompletion so callers can inspect
 * `choices[0].message.content`, `finish_reason`, `usage`, etc.
 */
export async function llmChat(
  opts: LlmCallOpts,
): Promise<OpenAI.Chat.Completions.ChatCompletion | null> {
  const client = getClient();
  if (!client) return null;

  const {
    messages,
    model = config.AI_LLM_MODEL,
    max_tokens,
    temperature,
    top_p,
    jsonResponse,
    retries = DEFAULT_RETRIES,
    stream,
    signal,
  } = opts;

  const params = {
    model,
    messages,
    ...(stream !== undefined ? { stream } : {}),
  } as OpenAI.Chat.Completions.ChatCompletionCreateParams;

  // Attach optional parameters only if explicitly provided to maintain
  // maximum compatibility with various LLM providers and local APIs.
  if (temperature !== undefined) params.temperature = temperature;
  if (top_p !== undefined) params.top_p = top_p;
  if (max_tokens !== undefined) params.max_tokens = max_tokens;

  if (jsonResponse) {
    params.response_format = jsonResponse;
  }

  return retryWithBackoff(
    async () => {
      return withLlmConcurrency(async () => {
        const execute = async (
          currentParams: OpenAI.Chat.Completions.ChatCompletionCreateParams,
        ) => {
          const response = await client.chat.completions.create(currentParams, {
            signal,
          });
          if (currentParams.stream) {
            let content = "";
            let finishReason = "stop";
            for await (const chunk of response as unknown as AsyncIterable<LLMResponseChunk>) {
              const choice = chunk?.choices?.[0];
              const textChunk =
                choice?.delta?.content ||
                choice?.message?.content ||
                choice?.text ||
                chunk?.message?.content ||
                chunk?.response ||
                chunk?.content ||
                "";
              content += textChunk;
              const fr = choice?.finish_reason || chunk?.finish_reason;
              if (fr) finishReason = fr;
            }
            return {
              id: "stream-aggregated",
              choices: [
                {
                  message: { role: "assistant", content, refusal: null },
                  finish_reason: finishReason,
                  index: 0,
                  logprobs: null,
                },
              ],
              created: Math.floor(Date.now() / 1000),
              model: currentParams.model,
              object: "chat.completion",
            } as OpenAI.Chat.Completions.ChatCompletion;
          }
          return response as OpenAI.Chat.Completions.ChatCompletion;
        };

        try {
          return await execute(params);
        } catch (error: any) {
          const rawResponse =
            error.error || error.body || error.response?.data || "N/A";
          const errorStr = (
            JSON.stringify(rawResponse) + String(error.message)
          ).toLowerCase();

          // Auto-fallback: If provider strictly demands streaming (400 Bad Request on stream params)
          if (
            error.status === 400 &&
            errorStr.includes("stream") &&
            !params.stream
          ) {
            log.warn(
              { model },
              "Provider rejected non-streaming request. Fallback to stream: true initiated.",
            );
            (
              params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
            ).stream = true;
            return await execute(params);
          }

          log.error(
            {
              error: error.message,
              status: error.status,
              rawResponse,
              model,
            },
            "LLM API request failed",
          );
          throw error;
        }
      });
    },
    {
      retries,
      minTimeout: 2_000,
      maxTimeout: 30_000,
      factor: 3,
      signal,
    },
  );
}

/**
 * Convenience for vision (image/sticker/emoji) analysis.
 * Returns the raw completion content (trimmed) or null.
 *
 * NOTE: retries are disabled here on purpose — visionAnalyzer.ts already
 * wraps this call in its own 3-attempt loop with exponential backoff.
 * A second retry layer would multiply worst-case API calls (3×3=9/image).
 */
export async function llmVision(
  promptText: string,
  imageUrl: { url: string },
): Promise<string | null> {
  const completion = await llmChat({
    messages: [
      {
        role: "user",
        content: [
          { type: "text" as const, text: promptText },
          { type: "image_url" as const, image_url: imageUrl },
        ],
      },
    ],
    model: config.AI_LLM_VISION_MODEL ?? config.AI_LLM_MODEL,
    max_tokens: 500,
    temperature: 0.1,
    top_p: 0.9,
    retries: 0,
  });

  if (!completion) return null;
  return completion.choices[0]?.message?.content?.trim() ?? null;
}
