/**
 * Centralised LLM chat completion helper.
 *
 * All `openai.chat.completions.create` calls in the moderation subsystem
 * go through this module so that model, concurrency, retry, and token
 * defaults are maintained in one place.
 */

import { createChildLogger } from "@bete/shared/logger";
import { retryWithBackoff } from "@bete/shared/utils";
import OpenAI from "openai";
import { config } from "../../shared/config/config.js";
import { withLlmConcurrency } from "./concurrencyLimiter.js";

const log = createChildLogger("llm-client");

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

  const params: any = {
    model,
    messages,
  };

  // Attach optional parameters only if explicitly provided to maintain
  // maximum compatibility with various LLM providers and local APIs.
  if (stream !== undefined) params.stream = stream;
  if (temperature !== undefined) params.temperature = temperature;
  if (top_p !== undefined) params.top_p = top_p;
  if (max_tokens !== undefined) params.max_tokens = max_tokens;

  if (jsonResponse) {
    params.response_format = jsonResponse;
  }

  return retryWithBackoff(
    async () => {
      return withLlmConcurrency(async () => {
        const execute = async (currentParams: any) => {
          const response = await client.chat.completions.create(currentParams, { signal });
          if (currentParams.stream) {
            let content = "";
            let finishReason = "stop";
            for await (const chunk of response as any) {
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
              id: 'stream-aggregated',
              choices: [
                {
                  message: { role: 'assistant', content, refusal: null },
                  finish_reason: finishReason,
                  index: 0,
                  logprobs: null,
                },
              ],
              created: Math.floor(Date.now() / 1000),
              model: currentParams.model,
              object: 'chat.completion',
            } as OpenAI.Chat.Completions.ChatCompletion;
          }
          return response as OpenAI.Chat.Completions.ChatCompletion;
        };

        try {
          return await execute(params);
        } catch (error: any) {
          const rawResponse = error.error || error.body || error.response?.data || "N/A";
          const errorStr = (JSON.stringify(rawResponse) + String(error.message)).toLowerCase();

          // Auto-fallback: If provider strictly demands streaming (400 Bad Request on stream params)
          if (error.status === 400 && errorStr.includes("stream") && !params.stream) {
            log.warn({ model }, "Provider rejected non-streaming request. Fallback to stream: true initiated.");
            params.stream = true;
            return await execute(params);
          }

          log.error(
            {
              error: error.message,
              status: error.status,
              rawResponse,
              model
            },
            "LLM API request failed"
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
 * Convenience for the legacy text-only badword detection call in
 * `indonesianTextNormalizer`.  Returns parsed flags or [].
 */
export async function llmDetectBadwords(text: string): Promise<string[]> {
  const completion = await llmChat({
    messages: [
      {
        role: "user",
        content:
          "Deteksi kata kasar / pelanggaran ringan dari teks Indonesia berikut. " +
          'Balas hanya JSON object dengan format {"flags":[...]} dan gunakan hanya flag valid ini: ' +
          Array.from(VALID_PRIMARY_AI_FLAGS).join(", ") +
          ". Jika tidak ada pelanggaran, flags harus array kosong. Teks: " +
          text,
      },
    ],
    max_tokens: 200,
    temperature: 0.1,
    top_p: 0.9,
    jsonResponse: { type: "json_object" },
    retries: 2,
  });

  if (!completion) return [];
  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) return [];
  return extractFlagsFromContent(content);
}

/**
 * Convenience for vision (image/sticker/emoji) analysis.
 * Returns the raw completion content (trimmed) or null.
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
    retries: 2,
  });

  if (!completion) return null;
  return completion.choices[0]?.message?.content?.trim() ?? null;
}

// ---------------------------------------------------------------------------
// Flag extraction (reused from indonesianTextNormalizer)
// ---------------------------------------------------------------------------

const VALID_PRIMARY_AI_FLAGS = new Set([
  "spam",
  "hate_speech",
  "sara",
  "hoaks",
  "harassment",
  "vulgar_language",
  "sexual_content",
  "sexual_deviation",
  "violence",
  "self_harm",
  "doxxing",
  "scam",
  "misinformation",
  "nsfw_image",
  "gore_image",
  "illegal_content",
  "gambling",
  "drugs",
  "child_safety",
  "financial_scam",
  "religious_insult",
  "self_promo",
  "conflict_instigation",
  "offensive_username",
]);

function normalizeFlag(value: string): string | null {
  const lower = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!lower) return null;
  if (VALID_PRIMARY_AI_FLAGS.has(lower)) return lower;
  return null;
}

function extractFlagsFromContent(content: string): string[] {
  const flags = new Set<string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  const addValue = (v: unknown) => {
    if (typeof v !== "string") return;
    const n = normalizeFlag(v);
    if (n) flags.add(n);
  };

  if (Array.isArray(parsed)) {
    for (const item of parsed) addValue(item);
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["flags", "categories", "badwords"]) {
      const val = obj[key];
      if (Array.isArray(val)) {
        for (const item of val) addValue(item);
      } else {
        addValue(val);
      }
    }
  }

  if (flags.size > 0) return Array.from(flags);

  const lower = content.toLowerCase();
  for (const flag of VALID_PRIMARY_AI_FLAGS) {
    if (lower.includes(flag)) flags.add(flag);
  }

  return Array.from(flags);
}
