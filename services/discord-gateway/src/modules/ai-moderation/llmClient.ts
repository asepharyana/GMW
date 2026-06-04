/**
 * Centralised LLM chat completion helper.
 *
 * All `openai.chat.completions.create` calls in the moderation subsystem
 * go through this module so that model, concurrency, retry, and token
 * defaults are maintained in one place.
 */

import OpenAI from "openai";
import { config } from "../../shared/config/config.js";
import { retryWithBackoff } from "@bete/shared/utils";
import { withLlmConcurrency } from "./concurrencyLimiter.js";
import { createChildLogger } from "@bete/shared/logger";

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
      timeout: 15_000,
    });
  }
  return openaiClient;
}

// ---------------------------------------------------------------------------
// Shared defaults
// ---------------------------------------------------------------------------

const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_TOP_P = 0.95;
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
    max_tokens = 8192,
    temperature = DEFAULT_TEMPERATURE,
    top_p = DEFAULT_TOP_P,
    jsonResponse,
    retries = DEFAULT_RETRIES,
  } = opts;

  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
    {
      model,
      messages,
      temperature,
      top_p,
      max_tokens,
      stream: false,
    };

  if (jsonResponse) {
    (params as unknown as Record<string, unknown>).response_format =
      jsonResponse;
  }

  return retryWithBackoff(
    async () => {
      return withLlmConcurrency(async () =>
        client.chat.completions.create(params),
      );
    },
    {
      retries,
      minTimeout: 0,
      maxTimeout: 0,
      factor: 2,
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
