/**
 * fastClassifier.ts
 *
 * Layer 1 — Synchronous heuristic classifier for the two-pass moderation pipeline.
 * Runs BEFORE any LLM call. Catches obvious spam, NSFW patterns, repeated characters,
 * and other low-hanging fruit with zero network cost.
 *
 * When a strong heuristic match is found, `cascadeToLayer2` is `false` and the
 * result is used as the final verdict. Otherwise the message proceeds to the LLM.
 */

import type { MessageRecord } from "../message-capture/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Layer1Result {
  flags: string[];
  severity: "none" | "low" | "medium" | "high";
  toxicityScore: number;
  harmScore: number;
  cascadeToLayer2: boolean;
  confidence: number;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface Pattern {
  name: string;
  test: (content: string, mentions: number) => boolean;
  severity: "low" | "medium" | "high";
  score: number; // contribution to toxicity/harm score
  category: "toxicity" | "harm" | "spam" | "safety";
}

// ── Zalgo / zero-width detection ─────────────────────────────────────────

const ZALGO_RE =
  new RegExp(
  '[̀-ͯ҃-҉ؐ-ًؚ-ٰٟۖ-ۜ۟-ۤۧ-۪ۨ-ܑۭܰ-݊ަ-ްँ-ः़ा-्॑-॔ॢ-ॣঁ-ঃ়া-ৄে-ৈো-্ৗৢ-ৣ৾ਁ-ਃ਼ਾ-ੂੇ-ੈੋ-੍ੑੰ-ੱੵઁ-ઃ઼ા-ૅે-ૉો-્ૢ-ૣૺ-૿ଁ-ଃ଼ା-ୄେ-ୈୋ-୍ୖ-ୗୢ-ୣஂா-ூெ-ைொ-்ௗఀ-ఃా-ౄె-ైొ-్ౕ-ౖౢ-ౣಁ-ಃ಼ಾ-ೄೆ-ೈೊ-್ೕ-ೖೢ-ೣഀ-ഃ഻-഼ാ-ൄെ-ൈൊ-്ൗൢ-ൣඁ-ඃ්ා-ුූෘ-ෟෲ-ෳัิ-ฺ็-๎ັິ-ູົ-ຼ່-ໍ༘-༹༙༵༷༾-༿ཱ-྄྆-྇ྍ-ྗྙ-ྼ࿆ါ-ှၖ-ၙၞ-ၠၢ-ၤၧ-ၭၱ-ၴႂ-ႍႏႚ-ႝ፝-፟ᜒ-᜔ᜲ-᜴ᝒ-ᝓᝲ-ᝳ឴-៓៝᠋-᠍ᢩᤠ-ᤫᤰ-᤻ᨗ-ᨛᩕ-ᩞ᩠-᩿᩼᪰-᪾ᬀ-ᬄ᬴-᭄᭫-᭳ᮀ-ᮁᮢ-ᮥᮨ-ᮩ᮫-ᮭ᯦-᯳ᰤ-᰷᳐-᳔᳒-᳨᳭ᳲ-᳴᳷-᳹᷀-᷿​-‏ -  -⁯⃐-⃰⳯-⵿⳱ⷠ-〪ⷿ-゙〯-゚꙯-꙲ꙴ-꙽ꚞ-ꚟ꛰-꛱ꠂ꠆ꠋꠣ-ꠧ꠬ꢀ-ꢁꢴ-ꣅ꣠-꣱ꣿ-꤉ꤦ-꤭ꥇ-꥓ꥠ-ꥼꦀ-ꦃ꦳-꧀ꧥꨩ-ꨶꩃꩌꩍꩻ-ꩽꪰꪲ-ꪴꪷ-ꪸꪾ-꪿꫁ꫫ-ꫯꫵ-꫶ꯣ-ꯪ꯬꯭ﬞ︀-️︠-︯￹-￻]|­|͏|؜ᅟᅠ឴឵᠎ -   ⁠-⁤⁦-⁯ㅤﾠ￰-￸\u{1e001}\u{1e020}-\u{1e07f}',
);

const ZERO_WIDTH_RE = /[​-‍⁠﻿­؜]/;

// ── URL / invite / phone / email / crypto patterns ─────────────────────

const URL_RE = /https?:\/\/[^\s"]+/gi;
const INVITE_RE = /(?:discord\.(?:gg|com\/invite)|dsc\.gg)\/[a-zA-Z0-9_-]+/gi;
const INVITE_CODE_RE = /(?:^|\s)([a-zA-Z0-9_-]{6,12})(?:\s|$)/g;
// Word-boundary phone match. `(?<!\d)` / `(?!\d)` stop the matcher from
// grabbing a slice out of a longer digit run (e.g. Discord snowflake IDs).
const PHONE_RE =
  /(?<!\d)(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}(?!\d)/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const CRYPTO_RE =
  /(?:0x[a-fA-F0-9]{40}|bc1[a-z0-9]{39,59}|1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34})/g;
const IP_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

// ── Discord markdown token sanitization ────────────────────────────────
// Custom emoji (<:name:id>, <a:name:id>), user/role/channel mentions and
// timestamps embed long numeric snowflakes. If left in the text, digit-based
// patterns (phone_number, personal_info, ip_address_sharing) false-positive
// on them — e.g. <:mambotongue:1463255254220148939> "matched" phone_number.
const DISCORD_TOKEN_RE =
  /<(?:a?:[^>]{1,32}:\d{17,20}|@!?\d{17,20}|@&\d{17,20}|#\d{17,20}|t:\d{10,11}(?::[tTdDRfF])?)>/g;

/** Replaces Discord markdown tokens with a space so they can't trip patterns. */
export function sanitizeDiscordTokens(content: string): string {
  return content.replace(DISCORD_TOKEN_RE, " ");
}

// ── Spam / low-quality patterns ─────────────────────────────────────────

const REPEATED_CHAR_RE = /(.)\1{8,}/; // 9+ repeated chars
const REPEATED_WORD_RE = /\b(\w{3,})\b\s*\b\1\b\s*\b\1\b/; // same word 3x
const EXCESSIVE_CAPS_RE = /[A-Z]{6,}/;
const EXCESSIVE_EMOJI_RE =
  /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
const BASE64_RE =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PHISHING_RE =
  /(?:free\s*(?:nitro|gift|prime|steam|vbucks?)|click\s*(?:here|this)\s*(?:to|for)\s*(?:claim|win|verify)|login\s*:\s*\w+\s*password\s*:\s*\w+)/gi;

// ── Toxicity patterns ───────────────────────────────────────────────────

const HARASSMENT_RE =
  /\b(?:fuck|shit|asshole|bitch|dickhead|cunt|motherfucker|bastard|piss\s*off|screw\s*you|go\s*(?:to\s*)?hell|kys|kill\s*(?:yourself| urself))\b/i;
const HATE_SPEECH_RE =
  /\b(?:nazi|white\s*supremacy|heil|racial\s*purity|race\s*war)\b/i;

// ── Harm patterns ───────────────────────────────────────────────────────

const SELF_HARM_RE =
  /\b(?:kill\s*(?:myself|me)|end\s*(?:my|the)\s*(?:life|own)|suicide|want\s*(?:to\s*)?die|cut\s*(?:myself|my\s*wrists)|harm\s*myself)\b/i;
const VIOLENCE_RE =
  /\b(?:shoot|stab|bomb|massacre|terrorist|behead|torture|murder)\b/i;

// ── Safety patterns ─────────────────────────────────────────────────────

const PERSONAL_INFO_RE =
  /\b(?:\d{3}-\d{2}-\d{4}|(?:\d{3}\s?){2}\d{4})\b/; // SSN / IDs
const SEXTORTION_RE =
  /\b(?:nudes?\s*(?:pic|photo|video|send|trade)|cp\s*(?:content|link|loli|shotacon)|underage|minor\s*(?:girl|boy|content))\b/i;
const GROOMING_RE =
  /\b(?:how\s*old\s*are\s*you|are\s*you\s*(?:alone|home\s*alone)|dm\s*me\s*(?:baby|honey|sweetie|cutie)|send\s*(?:nudes|pics))\b/i;

// ── Mass-mention patterns ───────────────────────────────────────────────

const EVERYONE_MENTION = /@everyone/g;
const HERE_MENTION = /@here/g;
const ROLE_MENTION = /<@&(\d+)>/g;

// ── Pattern registry (ordered roughly by specificity) ───────────────────

const PATTERNS: Pattern[] = [
  // ── High severity ─────────────────────────────────────────────────
  {
    name: "self_harm",
    test: (c) => SELF_HARM_RE.test(c),
    severity: "high",
    score: 0.9,
    category: "harm",
  },
  {
    name: "violence_threat",
    test: (c) => VIOLENCE_RE.test(c),
    severity: "high",
    score: 0.85,
    category: "harm",
  },
  {
    name: "sextortion",
    test: (c) => SEXTORTION_RE.test(c),
    severity: "high",
    score: 0.95,
    category: "safety",
  },
  {
    name: "grooming",
    test: (c) => GROOMING_RE.test(c),
    severity: "high",
    score: 0.9,
    category: "safety",
  },
  {
    name: "hate_speech",
    test: (c) => HATE_SPEECH_RE.test(c),
    severity: "high",
    score: 0.85,
    category: "toxicity",
  },
  {
    name: "harassment",
    test: (c) => HARASSMENT_RE.test(c),
    severity: "medium",
    score: 0.6,
    category: "toxicity",
  },
  {
    name: "phishing",
    test: (c) => PHISHING_RE.test(c),
    severity: "high",
    score: 0.85,
    category: "harm",
  },
  // ── Spam / low quality ────────────────────────────────────────────
  {
    name: "mass_everyone_mention",
    test: (_c, mentions) => mentions >= 3,
    severity: "medium",
    score: 0.65,
    category: "spam",
  },
  {
    name: "excessive_caps",
    test: (c) => {
      const caps = (c.match(EXCESSIVE_CAPS_RE) || []).join("");
      return caps.length > 0 && caps.length / Math.max(c.length, 1) > 0.5;
    },
    severity: "low",
    score: 0.3,
    category: "spam",
  },
  {
    name: "repeated_characters",
    test: (c) => REPEATED_CHAR_RE.test(c),
    severity: "low",
    score: 0.25,
    category: "spam",
  },
  {
    name: "repeated_words",
    test: (c) => REPEATED_WORD_RE.test(c),
    severity: "low",
    score: 0.25,
    category: "spam",
  },
  {
    name: "zalgo_text",
    test: (c) => ZALGO_RE.test(c) || ZERO_WIDTH_RE.test(c),
    severity: "medium",
    score: 0.6,
    category: "spam",
  },
  {
    name: "excessive_emojis",
    test: (c) => {
      const emojiCount = (c.match(EXCESSIVE_EMOJI_RE) || []).length;
      const textLen = c.replace(EXCESSIVE_EMOJI_RE, "").trim().length;
      return emojiCount >= 5 && textLen < emojiCount;
    },
    severity: "low",
    score: 0.2,
    category: "spam",
  },
  {
    name: "base64_gibberish",
    test: (c) => c.length >= 20 && BASE64_RE.test(c.trim()),
    severity: "low",
    score: 0.2,
    category: "spam",
  },
  // ── Medium severity ───────────────────────────────────────────────
  {
    name: "personal_info",
    test: (c) => PERSONAL_INFO_RE.test(c),
    severity: "medium",
    score: 0.6,
    category: "safety",
  },
  {
    name: "discord_invite",
    test: (c) => INVITE_RE.test(c),
    severity: "low",
    score: 0.2,
    category: "spam",
  },
  {
    name: "url_only",
    test: (c) => {
      const urls = c.match(URL_RE);
      if (!urls) return false;
      const textWithoutUrls = c.replace(URL_RE, "").trim();
      return urls.length >= 3 && textWithoutUrls.length === 0;
    },
    severity: "low",
    score: 0.25,
    category: "spam",
  },
  {
    name: "phone_number",
    test: (c) => PHONE_RE.test(c),
    severity: "medium",
    score: 0.5,
    category: "safety",
  },
  {
    name: "email_address",
    test: (c) => EMAIL_RE.test(c),
    severity: "low",
    score: 0.3,
    category: "safety",
  },
  {
    name: "crypto_address",
    test: (c) => CRYPTO_RE.test(c),
    severity: "medium",
    score: 0.5,
    category: "spam",
  },
  {
    name: "ip_address_sharing",
    test: (c) => IP_RE.test(c),
    severity: "low",
    score: 0.3,
    category: "safety",
  },
];

// ---------------------------------------------------------------------------
// Pattern matcher — count mentions
// ---------------------------------------------------------------------------

function countMentions(content: string): number {
  let count = 0;
  const everyoneMatches = content.match(EVERYONE_MENTION);
  if (everyoneMatches) count += everyoneMatches.length;
  const hereMatches = content.match(HERE_MENTION);
  if (hereMatches) count += hereMatches.length;
  const roleMatches = content.match(ROLE_MENTION);
  if (roleMatches) count += roleMatches.length;
  return count;
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

/**
 * Runs Layer 1 heuristic classification on a message.
 * Returns a `Layer1Result` with matched flags and a decision on
 * whether to cascade to Layer 2 (LLM).
 */
export function classifyMessage(message: MessageRecord): Layer1Result {
  const content = message.edited_content ?? message.content;
  if (!content || content.trim().length === 0) {
    return {
      flags: [],
      severity: "none",
      toxicityScore: 0,
      harmScore: 0,
      cascadeToLayer2: true, // empty content still needs metadata check
      confidence: 0,
      explanation: "No text content to classify",
    };
  }

  const mentions = countMentions(content);
  // Strip Discord markdown tokens (emoji/mention snowflakes) before pattern
  // matching so digit-based patterns don't false-positive on them.
  const sanitized = sanitizeDiscordTokens(content);
  const matchedFlags: string[] = [];
  const severityWeights: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  let maxSeverityWeight = 0;
  let totalToxicityScore = 0;
  let totalHarmScore = 0;
  let totalSafetyScore = 0;
  let totalSpamScore = 0;
  const matchedPatternDetails: string[] = [];

  for (const pattern of PATTERNS) {
    if (pattern.test(sanitized, mentions)) {
      matchedFlags.push(pattern.name);
      matchedPatternDetails.push(pattern.name);

      const weight = severityWeights[pattern.severity] || 1;
      maxSeverityWeight = Math.max(maxSeverityWeight, weight);

      switch (pattern.category) {
        case "toxicity":
          totalToxicityScore += pattern.score;
          break;
        case "harm":
          totalHarmScore += pattern.score;
          break;
        case "safety":
          totalSafetyScore += pattern.score;
          break;
        case "spam":
          totalSpamScore += pattern.score;
          break;
      }
    }
  }

  // ── Determine final severity ───────────────────────────────────────

  let finalSeverity: "none" | "low" | "medium" | "high" = "none";
  if (maxSeverityWeight >= 3) finalSeverity = "high";
  else if (maxSeverityWeight >= 2) finalSeverity = "medium";
  else if (maxSeverityWeight >= 1) finalSeverity = "low";

  // ── Determine if we should cascade ─────────────────────────────────
  // Cascade to Layer 2 whenever:
  //   1. No high-severity match was found, OR
  //   2. Only spam/low-quality patterns matched (need LLM for nuance)
  // Do NOT cascade when a clear high-severity harm/safety/toxicity match
  // was found — the heuristic is sufficient.

  const hasHighSeverityPattern = matchedFlags.some((f) => {
    const p = PATTERNS.find((p) => p.name === f);
    return p && p.severity === "high";
  });
  const hasOnlyLowSeveritySpam = matchedFlags.every((f) => {
    const p = PATTERNS.find((p) => p.name === f);
    return p && p.category === "spam" && p.severity !== "high";
  });

  // Cascade if no matches, only spam, or low/medium severity toxicity/safety
  const cascadeToLayer2 =
    matchedFlags.length === 0 ||
    hasOnlyLowSeveritySpam ||
    (finalSeverity !== "high" && hasHighSeverityPattern === false);

  // ── Compute final scores (clamped 0-1) ─────────────────────────────

  const toxicityScore = Math.min(totalToxicityScore, 1);
  const harmScore = Math.min(totalHarmScore, 1);

  // ── Confidence ─────────────────────────────────────────────────────

  const confidence = cascadeToLayer2
    ? 0.4 + 0.1 * matchedFlags.length // low confidence when punting to LLM
    : 0.6 + 0.4 * (1 - matchedFlags.length / PATTERNS.length);

  const explanation =
    matchedFlags.length > 0
      ? `Layer 1 matched: ${matchedPatternDetails.join(", ")}`
      : "No heuristic patterns matched";

  return {
    flags: matchedFlags,
    severity: finalSeverity,
    toxicityScore,
    harmScore,
    cascadeToLayer2,
    confidence: Math.min(confidence, 0.99),
    explanation,
  };
}