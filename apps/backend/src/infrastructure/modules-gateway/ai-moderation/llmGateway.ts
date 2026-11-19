/**
 * The only place in the service that talks to the model.
 *
 * v1's `llmClient.ts` was 446 lines carrying four responsibilities: a per-lane
 * concurrency semaphore, an internal retry loop, provider stream-fallback
 * heuristics, and chunk-text extraction for ~6 response shapes. The worker layer
 * then added its OWN retry on top, which is how one bad sentence could produce
 * four re-requests plus sixty individual fallbacks.
 *
 * This module keeps only what the caller cannot do itself:
 *   - the wire call and its timeout
 *   - refusal / empty-response classification (a policy signal, not a fault)
 *
 * Retry and concurrency are the caller's decision, made from the durable
 * `attempts` counter. One layer, one decision.
 */

import OpenAI from "openai"
import { config } from "../../config/index.js"
import { createChildLogger } from "../../logger/index.js"

const log = createChildLogger("moderation/llm")

export type LlmRequest = {
	system: string
	user: string
	/** Per-call deadline. Must stay below the worker's lease. */
	timeoutMs: number
	/**
	 * Image parts sent as REAL multimodal content blocks, not as text.
	 *
	 * This exists because a vision model handed the URL as a string answers
	 * "Tidak dapat memproses URL gambar" — it will not fetch the URL itself.
	 * Verified against the production router: the identical prompt with the
	 * image as an `image_url` part describes the image; with the URL inlined in
	 * the text it refuses. So the vision pass MUST go through this field.
	 */
	images?: LlmImagePart[]
}

export type LlmImagePart = {
	/** Remote URL or a `data:` URI. Passed to the model verbatim. */
	url: string
	/** Optional hint; ignored by providers that key off the URL scheme. */
	mimeType?: string
}

export interface LlmGateway {
	/**
	 * Recorded on `verdicts.model` and `analysis_attempts.model` so a verdict can
	 * be traced to the model that produced it.
	 */
	readonly modelLabel?: string
	complete(req: LlmRequest): Promise<string>
}

export class LlmUnavailableError extends Error {
	constructor(
		message: string,
		readonly cause?: unknown,
	) {
		super(message)
		this.name = "LlmUnavailableError"
	}
}

let client: OpenAI | null = null
let visionClient: OpenAI | null = null

function getClient(): OpenAI {
	if (!config.AI_LLM_API_KEY) {
		throw new LlmUnavailableError(
			"AI_LLM_API_KEY is not set — cannot run moderation",
		)
	}
	if (!client) {
		client = new OpenAI({
			apiKey: config.AI_LLM_API_KEY,
			baseURL: config.AI_LLM_BASE_URL,
			// No client-level retry. The worker's durable attempt counter owns
			// retrying; stacking two layers multiplied worst-case call count.
			maxRetries: 0,
			timeout: 60_000,
		})
	}
	return client
}

/**
 * The multimodal client, deliberately a SEPARATE instance from the text one.
 *
 * The vision pass may need a different base URL, key and model alias, and
 * caching one client for both meant the vision call silently inherited the
 * text model. That is how the feature shipped inert: the image was described
 * by a text model that cannot see images.
 */
function getVisionClient(): OpenAI {
	const apiKey = config.AI_LLM_VISION_API_KEY ?? config.AI_LLM_API_KEY
	if (!apiKey) {
		throw new LlmUnavailableError(
			"AI_LLM_API_KEY is not set — cannot run vision analysis",
		)
	}
	if (!visionClient) {
		visionClient = new OpenAI({
			apiKey,
			baseURL: config.AI_LLM_VISION_BASE_URL ?? config.AI_LLM_BASE_URL,
			maxRetries: 0,
			timeout: 60_000,
		})
	}
	return visionClient
}

/** Build the user message: plain text, plus one image part per URL. */
function buildUserContent(
	text: string,
	images: LlmImagePart[] | undefined,
):
	| string
	| Array<
			| OpenAI.Chat.Completions.ChatCompletionContentPartText
			| OpenAI.Chat.Completions.ChatCompletionContentPartImage
	  > {
	if (!images || images.length === 0) return text
	return [
		{ type: "text", text },
		...images.map((img) => ({
			type: "image_url" as const,
			image_url: { url: img.url },
		})),
	]
}

/**
 * Covers the response shapes the streaming path can produce. Providers differ
 * in field name, so try each in turn rather than assuming OpenAI's layout.
 */
type StreamChunk = {
	choices?: Array<{
		delta?: {
			content?: string | null
			reasoning_content?: string | null
			reasoning?: string | null
		}
		message?: { content?: string | null }
		finish_reason?: string | null
	}>
	message?: { content?: string | null }
	content?: string
}

export function extractChunkText(
	chunk: StreamChunk | null | undefined,
): string {
	if (!chunk) return ""
	const choice = chunk.choices?.[0]
	return (
		choice?.delta?.content ||
		choice?.delta?.reasoning_content ||
		choice?.delta?.reasoning ||
		choice?.message?.content ||
		chunk.message?.content ||
		chunk.content ||
		""
	)
}

export class HttpLlmGateway implements LlmGateway {
	readonly modelLabel: string

	constructor(
		private readonly model: string,
		/**
		 * Which credential/endpoint pair this gateway talks to. Vision needs its
		 * own because it can use a different model, key and base URL than the
		 * text moderation pass.
		 */
		private readonly lane: "text" | "vision" = "text",
	) {
		this.modelLabel = model
	}

	async complete(req: LlmRequest): Promise<string> {
		const c = this.lane === "vision" ? getVisionClient() : getClient()
		const userContent = buildUserContent(req.user, req.images)
		const base = {
			model: this.model,
			messages: [
				{ role: "system" as const, content: req.system },
				{ role: "user" as const, content: userContent },
			],
			temperature: 0.2,
			// Was hardcoded to 8192 while AI_LLM_MAX_COMPLETION_TOKENS defaulted to
			// 16384: the knob did nothing and the real ceiling was half the documented
			// one. A batch of 40 verdicts is a long JSON object, and truncating it
			// mid-array is what makes a batch come back unparseable.
			max_tokens: config.AI_LLM_MAX_COMPLETION_TOKENS,
			...(config.AI_LLM_DISABLE_THINKING
				? {
						reasoning_effort: "none" as const,
						chat_template_kwargs: { enable_thinking: false },
					}
				: {}),
		}

		let content: string | null = null
		let refusal: string | null | undefined

		// A runaway generation must not be allowed to grow the heap without limit.
		//
		// `max_tokens` is a request, not a guarantee: the router in front of the
		// model has already been observed ignoring it and emitting a repetition
		// loop (one stored vision description is 70KB of the same sentence), so
		// `acc += chunk` below has no inherent ceiling. At ~4 bytes per character
		// a 60MB accumulation is enough to abort a 560MB heap, and it happens
		// inside the same process that serves the dashboard and capture.
		//
		// The ceiling is deliberately generous — `max_tokens` (16384) is far
		// smaller than this — so it can only trip on a genuine runaway, never on
		// a legitimately long verdict batch. Tripping it is a normal
		// LlmUnavailableError, so the worker's durable attempt counter retries the
		// message instead of the process dying.
		const MAX_COMPLETION_CHARS = 1_000_000

		// Streaming first: the router always answers with SSE, and a non-stream
		// request waits for the full body and can time out on a slow model.
		try {
			const stream = await c.chat.completions.create(
				{
					...base,
					stream: true,
				} as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
				{ timeout: req.timeoutMs },
			)
			let acc = ""
			for await (const chunk of stream as unknown as AsyncIterable<StreamChunk>) {
				acc += extractChunkText(chunk)
				if (acc.length > MAX_COMPLETION_CHARS) {
					throw new LlmUnavailableError(
						`completion exceeded ${MAX_COMPLETION_CHARS} chars — treating as a runaway generation`,
					)
				}
			}
			content = acc
		} catch (err) {
			// Large responses occasionally get their SSE truncated mid-flight and a
			// stream retry fails identically. One non-stream attempt recovers it.
			const msg = err instanceof Error ? err.message : String(err)
			if (
				!/stream ended before producing a non-ping sse|terminated/i.test(msg)
			) {
				throw new LlmUnavailableError(msg, err)
			}
			log.warn({ model: this.model }, "SSE truncated; retrying non-stream")
			try {
				const completion = await c.chat.completions.create(
					{
						...base,
						stream: false,
					} as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
					{ timeout: req.timeoutMs },
				)
				content = completion.choices?.[0]?.message?.content ?? null
				refusal = (
					completion.choices?.[0]?.message as { refusal?: string } | undefined
				)?.refusal
			} catch (inner) {
				throw new LlmUnavailableError(
					inner instanceof Error ? inner.message : String(inner),
					inner,
				)
			}
		}

		if (typeof content === "string" && content.trim().length > 0) return content

		// A refusal arrives as `refusal` with null content. That is the model
		// declining, which is a policy signal worth its own log line, not a
		// transport fault.
		if (refusal) {
			log.warn({ refusal, model: this.model }, "model refused the batch")
			throw new LlmUnavailableError(`model refused: ${refusal}`)
		}
		throw new LlmUnavailableError("empty completion content")
	}
}

export function createDefaultGateway(): LlmGateway {
	return new HttpLlmGateway(config.AI_LLM_MODEL)
}

/**
 * The multimodal gateway for the vision pass.
 *
 * Separate from the text gateway on purpose: it resolves its own client, its
 * own key and its own model alias. Sharing one instance is what made the
 * vision call fall back to the text model, which cannot see images.
 */
export function createDefaultVisionGateway(): LlmGateway {
	return new HttpLlmGateway(config.AI_LLM_VISION_MODEL, "vision")
}
