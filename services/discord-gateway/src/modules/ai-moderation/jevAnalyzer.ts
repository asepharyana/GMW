/**
 * jevAnalyzer.ts
 *
 * Jev (TypeSafe System One, `oc/jev-1.13-free` via 9router `/v1/systemone`)
 * — the PRIMARY analyzer for text-only moderation sub-batches. The existing
 * LLM (`llmChat`) stays as the fallback for any message Jev cannot decide
 * confidently (see the acceptance gate) and for media batches (Jev is
 * decision-only, no image input).
 *
 * CRITICAL framing rule (verified 2026-09-23, live probes):
 * Jev is a System One model — it evaluates typed questions against a STATE.
 * Feeding it the chat-optimized `SYSTEM_RULES` verbatim INSIDE chat-style
 * XML (`<messages_to_analyze>`, `<location_context>`, …) makes it
 * pattern-match the structure and return CONFIDENTLY WRONG verdicts
 * (flagged clean messages at confidence 0.98 in a probe — would pass any
 * naive gate and could auto-delete innocent content).
 *
 * The state MUST be declarative facts:
 *   OBJEK PENILAIAN / PESAN: `- Pesan "<id>" dari "<user>": "<content>"` /
 *   KEBIJAKAN as statements / KONTEKS as statements
 * and the questions phrased as "is this true" / "classify this" against
 * those facts. With that framing the same 4-message probe returned 4/4
 * correct verdicts at confidence 1.0, including the SARA zero-tolerance
 * case and the technical-clean case.
 *
 * The distilled `JEV_POLICY` below is a compact declarative summary of the
 * full chat policy (`prompts/rules.ts` SYSTEM_RULES). It is deliberately
 * kept short (~300 tokens) — the LLM keeps the full 12k-char policy; Jev
 * triages on the core axes, and anything it can't decide confidently falls
 * back to the LLM. Keep this block in sync when SYSTEM_RULES changes.
 */

import type { Question, Questions } from "@typesafe-ai/sdk";
import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { incrementCounterBy } from "../gateway-metrics/index.js";
import type { AnalysisResult } from "../message-capture/types.js";

const log = createChildLogger("jev-analyzer");

// ---------------------------------------------------------------------------
// Policy + vocab
// ---------------------------------------------------------------------------

/**
 * Distilled declarative policy for Jev. DERIVED from `SYSTEM_RULES`
 * (prompts/rules.ts) — update this when the full policy changes. Kept as
 * factual statements, NOT instructions (System One evaluates truth).
 */
export const JEV_POLICY = `KEBIJAKAN SERVER (fakta yang berlaku):
- Kata vulgar anatomi (kontol, memek, tit, dick, dll) = pelanggaran berat, tanpa kecuali.
- SARA / penistaan agama / parodi ayat / mockery tokoh agama / provokasi antar-agama = pelanggaran berat.
- Promosi atau diskusi LGBT = pelanggaran berat (zero-tolerance).
- Diskusi Israel/Palestina/Yahudi = pelanggaran berat (zero-tolerance).
- Hinaan terarah ke orang (harassment), seksisme, ageisme, diskriminasi fisik = pelanggaran.
- Konten seksual eksplisit / ajakan seksual / fetish / lolicon-shota = pelanggaran.
- Judi, narkoba, scam, doxxing, ancaman kekerasan, self-harm, child safety, konten ilegal = pelanggaran.
- Teknik evasi (zalgo, leetspeak, regional indicator, simbol acak) yang menyembunyikan kata terlarang = pelanggaran.
- Spam berulang / promosi = pelanggaran ringan.
- Memancing konflik (conflict instigation) = pelanggaran ringan.
- Username ofensif saja (isi pesan bersih) = peringatan ringan, BUKAN hapus pesan.
- Percakapan teknis/normal, slang santai (anjay, wkwk, gaskeun, njir), typo, panggilan akrab (bang, kak, dek), ekspresi religius normal (astaghfirullah, alhamdulillah), istilah anime (waifu, wibu), lirik/kutipan, makian ke benda mati = BUKAN pelanggaran.
- Teks acak (kode, log, stack trace, output API, cuplikan UI) = BUKAN pelanggaran.
- Setiap pesan dinilai dari isinya sendiri; konteks percakapan dapat memengaruhi interpretasi, bukan menggantikan isi.`;

/** Choice labels must stay in sync with `AIRecommendedAction` (moderation-types). */
export const JEV_ACTIONS = [
  "none",
  "monitor",
  "warn",
  "review",
  "delete",
  "escalate",
] as const;

/** Category choices — the moderation category vocabulary (kept tight). */
export const JEV_CATEGORIES = [
  "none",
  "harassment",
  "hate_speech",
  "sara",
  "sexual_content",
  "vulgar_language",
  "sexual_deviation",
  "self_harm",
  "violence",
  "illegal_content",
  "gambling",
  "drugs",
  "scam",
  "spam",
  "conflict_instigation",
  "offensive_username",
  "other",
] as const;

export const JEV_STATUSES = ["clean", "warn", "flagged"] as const;
export const JEV_SEVERITIES = [
  "none",
  "low",
  "medium",
  "high",
  "critical",
] as const;

/** Policy version stamped on every Jev verdict (cache/DB provenance). */
export const JEV_POLICY_VERSION = "jev-systemone-2026-09-23";

/** Lazily-built SDK client (config resolves at first use). */
let client: TypeSafeClient | null = null;
let clientKey = "";

function getClient(): TypeSafeClient | null {
  if (!config.AI_LLM_JEV_API_KEY) return null;
  if (!client || clientKey !== config.AI_LLM_JEV_API_KEY) {
    client = new TypeSafeClient({
      apiKey: config.AI_LLM_JEV_API_KEY,
      baseURL: config.AI_LLM_JEV_BASE_URL,
      defaultModel: config.AI_LLM_JEV_MODEL,
      timeout: config.AI_LLM_JEV_TIMEOUT_MS,
      retry: { maxRetries: 0 }, // pipeline owns retries/abort
      logLevel: "warn",
    });
    clientKey = config.AI_LLM_JEV_API_KEY;
    log.info(
      {
        baseURL: config.AI_LLM_JEV_BASE_URL,
        model: config.AI_LLM_JEV_MODEL,
      },
      "Jev analyzer client initialized",
    );
  }
  return client;
}

// ---------------------------------------------------------------------------
// Question + state builders
// ---------------------------------------------------------------------------

export interface JevTarget {
  /** Message id — echoed verbatim into analysis/result. */
  id: string;
  /** Display name shown to the model (username). */
  user: string;
  /** Content to evaluate (truncated by caller). */
  content: string;
}

/**
 * Build per-message questions, keyed by the message id itself so the
 * questions read naturally against the declarative state facts
 * ("pesan <id> melanggar kebijakan server"). Five questions per message.
 */
export function buildJevQuestions(targets: JevTarget[]): Questions {
  const questions: Record<string, Question> = {};
  for (const t of targets) {
    const k = t.id;
    questions[`${k}__v`] = noul(
      `Pesan ${JSON.stringify(t.id)} dari ${JSON.stringify(t.user)} melanggar kebijakan server`,
    );
    questions[`${k}__status`] = choice(
      `Klasifikasi pesan ${JSON.stringify(t.id)} dari ${JSON.stringify(t.user)}`,
      {
        clean: "tidak melanggar kebijakan",
        warn: "pelanggaran ringan",
        flagged: "melanggar kebijakan",
      },
    );
    questions[`${k}__severity`] = choice(
      `Tingkat keparahan pelanggaran pesan ${JSON.stringify(t.id)}`,
      {
        none: "tidak ada pelanggaran",
        low: "ringan",
        medium: "sedang",
        high: "berat",
        critical: "kritis/darurat",
      },
    );
    questions[`${k}__category`] = choice(
      `Kategori utama pelanggaran pesan ${JSON.stringify(t.id)}`,
      Object.fromEntries(JEV_CATEGORIES.map((c) => [c, null])),
    );
    questions[`${k}__action`] = choice(
      `Tindakan moderasi yang tepat untuk pesan ${JSON.stringify(t.id)}`,
      {
        none: "tidak ada tindakan",
        monitor: "pantau",
        warn: "beri peringatan",
        review: "tinjau manual",
        delete: "hapus pesan",
        escalate: "eskalasi",
      },
    );
  }
  return questions as Questions;
}

export interface JevBatchContext {
  /** Context block (location/conversation) as raw XML or prose — stripped to facts. */
  contextBlock: string;
  /** `<web_searches>` XML block (may be ""). */
  webSearchBlock: string;
  /** `<term_glossary>` XML block (may be ""). */
  glossaryBlock: string;
  /** Raw channel culture summary (may be undefined). */
  channelCulture?: string;
}

/**
 * Strip XML/HTML tags from a raw block and collapse whitespace so it can be
 * restated as plain factual prose in the declarative state. Empty after
 * stripping → omitted from the state.
 */
function stripToFacts(block: string, maxLength: number): string | null {
  const cleaned = block
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return JSON.stringify(cleaned.slice(0, maxLength));
}

/**
 * Build the declarative `state` payload. NO chat/XML scaffolding — plain
 * factual statements (see the framing rule above; chat-style injection
 * makes Jev confidently wrong).
 */
export function buildJevState(
  targets: JevTarget[],
  ctx: JevBatchContext,
  correctedExamples = "",
): string {
  const facts = targets.map(
    (t) =>
      `- Pesan ${JSON.stringify(t.id)} dari ${JSON.stringify(t.user)}: ${JSON.stringify(t.content)}`,
  );
  const parts = [
    `OBJEK PENILAIAN: ${targets.length} pesan dari server Discord.`,
    "PESAN:",
    ...facts,
    JEV_POLICY,
  ];

  // Conversation/who context as facts (declarative, not instructions).
  const extraFacts: string[] = [];
  if (ctx.channelCulture) {
    extraFacts.push(
      `KULTUR CHANNEL (fakta): ${JSON.stringify(ctx.channelCulture.slice(0, 800))}`,
    );
  }
  const contextFacts = stripToFacts(ctx.contextBlock, 1200);
  if (contextFacts) extraFacts.push(`KONTEKS: ${contextFacts}`);
  const webSearchFacts = stripToFacts(ctx.webSearchBlock, 1500);
  if (webSearchFacts) extraFacts.push(`HASIL PENCARIAN WEB: ${webSearchFacts}`);
  const glossaryFacts = stripToFacts(ctx.glossaryBlock, 800);
  if (glossaryFacts) extraFacts.push(`GLOSARIUM: ${glossaryFacts}`);
  const correctionFacts = stripToFacts(correctedExamples, 800);
  if (correctionFacts)
    extraFacts.push(`KOREKSI SEBELUMNYA: ${correctionFacts}`);
  if (extraFacts.length > 0) parts.push(...extraFacts);

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Acceptance gate + mapper
// ---------------------------------------------------------------------------

/** Shape of the raw `answers` map returned by `systemOne`. */
export type JevAnswers = Record<
  string,
  | { type: "noul"; noul: number }
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities?: Record<string, number>;
    }
>;

/** Per-message answer subset (nullable until validated — `answersOf`). */
interface JevMessageAnswers {
  v?: { type: "noul"; noul: number };
  status?: { type: "choice"; choice: string; confidence: number };
  severity?: { type: "choice"; choice: string };
  category?: { type: "choice"; choice: string };
  action?: { type: "choice"; choice: string };
}

/** Reads the per-message answer subset by id, missing → undefined. */
function answersOf(answers: JevAnswers, id: string): JevMessageAnswers {
  return {
    v: answers[`${id}__v`] as JevMessageAnswers["v"],
    status: answers[`${id}__status`] as JevMessageAnswers["status"],
    severity: answers[`${id}__severity`] as JevMessageAnswers["severity"],
    category: answers[`${id}__category`] as JevMessageAnswers["category"],
    action: answers[`${id}__action`] as JevMessageAnswers["action"],
  };
}

/** Optionally-typed accessor for a choice answer's label ("" when missing). */
function labelOf(a: { type: "choice"; choice: string } | undefined): string {
  return a?.type === "choice" ? a.choice : "";
}

/** Set form of the vocab arrays for O(1) membership tests. */
const JEV_STATUS_SET = new Set<string>(JEV_STATUSES);
const JEV_SEVERITY_SET = new Set<string>(JEV_SEVERITIES);
const JEV_CATEGORY_SET = new Set<string>(JEV_CATEGORIES);
const JEV_ACTION_SET = new Set<string>(JEV_ACTIONS);

/**
 * Decide per-message Jev acceptance. Requires ALL five questions present
 * with valid labels and CROSS-CONSISTENT semantics:
 * - status choice confidence >= threshold
 * - status == clean ⟺ noul < 0.5 (flagged/warn need noul ≥ 0.5)
 * - severity == none ⟺ status == clean (flagged must have severity)
 * - action == none ⟺ status == clean; warn must not delete/escalate;
 *   clean must never delete/escalate
 * - category == none ⟺ status == clean
 * Anything else → LLM fallback (fail-open).
 */
export function isJevAccepted(
  answers: JevAnswers,
  messageId: string,
  minConfidence: number,
): boolean {
  const a = answersOf(answers, messageId);
  if (!a.v || a.v.type !== "noul" || typeof a.v.noul !== "number") return false;
  if (!a.status || a.status.type !== "choice" || !a.status.choice) return false;
  if (!a.severity || a.severity.type !== "choice" || !a.severity.choice)
    return false;
  if (!a.category || a.category.type !== "choice" || !a.category.choice)
    return false;
  if (!a.action || a.action.type !== "choice" || !a.action.choice) return false;

  const { status, severity, category, action } = a;
  if (
    typeof status.confidence !== "number" ||
    status.confidence < minConfidence
  )
    return false;

  // Valid label = one of the vocab const arrays. The membership guards
  // (Set.has) reject anything unknown, then the labels are narrowed via the
  // const-array includes so the downstream comparisons typecheck.
  const statusLabel = labelOf(status);
  const severityLabel = labelOf(severity);
  const categoryLabel = labelOf(category);
  const actionLabel = labelOf(action);
  if (
    !JEV_STATUS_SET.has(statusLabel) ||
    !JEV_SEVERITY_SET.has(severityLabel) ||
    !JEV_CATEGORY_SET.has(categoryLabel) ||
    !JEV_ACTION_SET.has(actionLabel)
  )
    return false; // unknown label — LLM fallback

  const s = statusLabel as (typeof JEV_STATUSES)[number];
  const sev = severityLabel as (typeof JEV_SEVERITIES)[number];
  const cat = categoryLabel as (typeof JEV_CATEGORIES)[number];
  const act = actionLabel as (typeof JEV_ACTIONS)[number];

  const noulVal = a.v.noul;

  // noul ↔ status consistency
  if (s === "clean" && noulVal >= 0.5) return false;
  if (s !== "clean" && noulVal < 0.5) return false;
  // severity ↔ status: clean must be none; flagged/warn must NOT be none
  if (s === "clean" && sev !== "none") return false;
  if (s !== "clean" && sev === "none") return false;
  // action ↔ status: clean must be none; flagged must NOT be none;
  // warn must not delete/escalate; clean must never delete/escalate
  if (s === "clean" && act !== "none") return false;
  if (s === "flagged" && act === "none") return false;
  if (s === "warn" && (act === "delete" || act === "escalate")) return false;
  // category ↔ status: clean must be none; flagged must NOT be none
  if (s === "clean" && cat !== "none") return false;
  if (s === "flagged" && cat === "none") return false;

  return true;
}

/**
 * Map accepted Jev answers for one message into the pipeline's `AnalysisResult`.
 * All values are derived from the model's own typed answers — no fabrication.
 */
export function mapJevAnswersToResult(
  answers: JevAnswers,
  messageId: string,
): AnalysisResult {
  const a = answersOf(answers, messageId);
  const v = a.v as { type: "noul"; noul: number };
  const st = a.status as {
    type: "choice";
    choice: string;
    confidence: number;
  };
  const sev = labelOf(a.severity);
  const cat = labelOf(a.category);
  const act = labelOf(a.action);

  const status = st.choice as (typeof JEV_STATUSES)[number];
  // Calibrated score: clean → 0; warn → 0.45; flagged → P(violates) clamped.
  const rawNoul = typeof v.noul === "number" ? v.noul : 0;
  const score =
    status === "clean"
      ? 0
      : status === "warn"
        ? 0.45
        : Math.min(1, Math.max(0.7, rawNoul));
  const confidence =
    typeof st.confidence === "number"
      ? st.confidence
      : config.AI_LLM_JEV_MIN_CONFIDENCE;

  return {
    messageId,
    status,
    flags: cat === "none" ? [] : [cat],
    score,
    analysis:
      `[Jev] status=${status}, kategori=${cat}, keparahan=${sev}, ` +
      `keyakinan=${confidence.toFixed(2)}, tindakan=${act}, p_melanggar=${rawNoul.toFixed(2)}`,
    categories: cat === "none" ? [] : [cat],
    severity: sev as AnalysisResult["severity"],
    confidence,
    recommendedAction: act as AnalysisResult["recommendedAction"],
    policyVersion: JEV_POLICY_VERSION,
    evidence: [],
  };
}

// ---------------------------------------------------------------------------
// Batch entry point (one systemOne call per sub-batch)
// ---------------------------------------------------------------------------

export interface JevBatchOutcome {
  /** Accepted Jev verdicts (keyed by message id). */
  results: AnalysisResult[];
  /** Answers the gate rejected for ANY reason (keys = message ids). */
  rejectedIds: string[];
  /** Raw `SystemOneResult` (for usage logging / raw passthrough). */
  raw: unknown;
  /** Error thrown by the call, if the whole call failed (null = success). */
  error: string | null;
}

/** True when Jev is configured and enabled (fail-open wrapper). */
export function isJevEnabled(): boolean {
  return (
    config.AI_LLM_JEV_ENABLED === true && Boolean(config.AI_LLM_JEV_API_KEY)
  );
}

/**
 * Analyze one text sub-batch with Jev. NEVER throws for API-level failures —
 * returns `{ error }` so the caller falls back to the LLM. Aborts (signal)
 * propagate as errors too (the caller's timeout must abort the SDK call and
 * fall back, not hang).
 */
export async function analyzeBatchWithJev(
  targets: JevTarget[],
  ctx: JevBatchContext,
  signal?: AbortSignal,
  correctedExamples = "",
): Promise<JevBatchOutcome> {
  const outcome: JevBatchOutcome = {
    results: [],
    rejectedIds: [],
    raw: null,
    error: null,
  };
  if (targets.length === 0) return outcome;

  const jevClient = getClient();
  if (!jevClient) {
    outcome.error = "Jev client unavailable (no API key)";
    return outcome;
  }

  try {
    const questions = buildJevQuestions(targets);

    // CONCURRENCY from the skill: one ownership layer owns retries — the SDK
    // gets retry: { maxRetries: 0 } and the pipeline's timeout/abort layer is
    // the only retry. The call is wrapped in withLlmConcurrency so Jev down
    // can't flood the router.
    const { withLlmConcurrency } = await import("./llmClient.js");
    const systemOneResult = await withLlmConcurrency(async () => {
      return await jevClient.systemOne(
        {
          model: config.AI_LLM_JEV_MODEL,
          state: buildJevState(targets, ctx, correctedExamples),
          questions,
        },
        { signal, timeout: config.AI_LLM_JEV_TIMEOUT_MS },
      );
    });

    outcome.raw = systemOneResult;
    const answers = systemOneResult.answers as unknown as JevAnswers;
    const minConfidence = config.AI_LLM_JEV_MIN_CONFIDENCE;

    for (const t of targets) {
      if (isJevAccepted(answers, t.id, minConfidence)) {
        outcome.results.push(mapJevAnswersToResult(answers, t.id));
        incrementCounterBy("moderation_jev_decisions", 1, { type: "jev" });
      } else {
        outcome.rejectedIds.push(t.id);
        incrementCounterBy("moderation_jev_decisions", 1, {
          type: "llm_fallback",
        });
        log.debug(
          { messageId: t.id, minConfidence },
          "Jev decision rejected — falling back to LLM",
        );
      }
    }

    // Usage accounting (same counters as the LLM path).
    const usage = systemOneResult.usage;
    if (usage?.input_tokens || usage?.output_tokens) {
      if (usage.input_tokens) {
        incrementCounterBy("llm_tokens_total", usage.input_tokens, {
          model: config.AI_LLM_JEV_MODEL,
          type: "prompt",
          label: "jev-batch",
        });
      }
      if (usage.output_tokens) {
        incrementCounterBy("llm_tokens_total", usage.output_tokens, {
          model: config.AI_LLM_JEV_MODEL,
          type: "completion",
          label: "jev-batch",
        });
      }
      log.info(
        {
          targetCount: targets.length,
          accepted: outcome.results.length,
          rejected: outcome.rejectedIds.length,
          model: config.AI_LLM_JEV_MODEL,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        },
        "Jev systemone batch usage",
      );
    }

    return outcome;
  } catch (err) {
    if (err instanceof Error && err.name === "APIUserAbortError") throw err; // real abort — let caller decide
    const msg = err instanceof Error ? err.message : String(err);
    outcome.error = msg;
    log.warn(
      { error: msg, targetCount: targets.length },
      "Jev systemone call failed — falling back to LLM for the whole batch",
    );
    return outcome;
  }
}
