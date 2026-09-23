/**
 * jevAnalyzer.test.ts — pure unit tests for the Jev analyzer (no network).
 *
 * Tests the question builder, state builder, acceptance gate, and answer
 * mapper against hand-crafted `JevAnswers` objects (the shape `systemOne`
 * returns). `analyzeBatchWithJev`'s network path is exercised separately
 * by the live smoke harness (no gateway restart).
 */
import { describe, expect, it } from "vitest";
import {
  buildJevQuestions,
  buildJevState,
  isJevAccepted,
  JEV_CATEGORIES,
  JEV_POLICY_VERSION,
  type JevAnswers,
  mapJevAnswersToResult,
} from "../src/modules/ai-moderation/jevAnalyzer.js";

const MID = "m1";

const cleanAnswers: JevAnswers = {
  [`${MID}__v`]: { type: "noul", noul: 0.03 },
  [`${MID}__status`]: { type: "choice", choice: "clean", confidence: 0.99 },
  [`${MID}__severity`]: { type: "choice", choice: "none" },
  [`${MID}__category`]: { type: "choice", choice: "none" },
  [`${MID}__action`]: { type: "choice", choice: "none" },
};

const flaggedAnswers: JevAnswers = {
  ...cleanAnswers,
  [`${MID}__v`]: { type: "noul", noul: 0.98 },
  [`${MID}__status`]: { type: "choice", choice: "flagged", confidence: 0.99 },
  [`${MID}__severity`]: { type: "choice", choice: "high" },
  [`${MID}__category`]: { type: "choice", choice: "vulgar_language" },
  [`${MID}__action`]: { type: "choice", choice: "delete" },
};

function answersFor(overrides: Partial<JevAnswers>): JevAnswers {
  return { ...cleanAnswers, ...overrides } as JevAnswers;
}

describe("buildJevQuestions", () => {
  it("emits 5 id-keyed questions per target", () => {
    const q = buildJevQuestions([
      { id: "a", user: "alice", content: "hi" },
      { id: "b", user: "bob", content: "hey" },
    ]);
    const keys = Object.keys(q);
    expect(keys).toHaveLength(10);
    expect(keys.sort()).toEqual(
      [
        "a__v",
        "a__status",
        "a__severity",
        "a__category",
        "a__action",
        "b__v",
        "b__status",
        "b__severity",
        "b__category",
        "b__action",
      ].sort(),
    );
    for (const k of keys) {
      if (k.endsWith("__v")) expect(q[k].type).toBe("noul");
      else expect(q[k].type).toBe("choice");
    }
    // status question names the message id (not an index)
    expect(
      (q["a__status"] as { instructions?: string }).instructions,
    ).toContain("a");
  });
});

describe("buildJevState", () => {
  it("includes the distilled policy + messages + stripped context facts", () => {
    const state = buildJevState(
      [
        { id: "m1", user: "alice", content: "kontol" },
        { id: "m2", user: "bob", content: "halo <b>bro</b>" },
      ],
      {
        contextBlock:
          "<location_context channel_id='1'/>\nLokasi: channel umum ramai.",
        webSearchBlock: "<web_searches/>\nHasil: tidak ada.",
        glossaryBlock: "<term_glossary/>\nIstilah: none.",
        channelCulture: "channel santai",
      },
      "## contoh koreksi",
    );
    expect(state).toContain("KEBIJAKAN SERVER");
    expect(state).toContain('- Pesan "m1" dari "alice": "kontol"');
    expect(state).toContain("KULTUR CHANNEL");
    expect(state).toContain("KONTEKS:");
    expect(state).toContain("HASIL PENCARIAN WEB:");
    expect(state).toContain("GLOSARIUM:");
    expect(state).toContain("KOREKSI SEBELUMNYA");
    // NO chat-scaffolding artifacts (this is the declarative contract)
    expect(state).not.toContain("<messages_to_analyze>");
    expect(state).not.toContain("<location_context");
  });
});

describe("isJevAccepted", () => {
  it("accepts a clean verdict with high confidence and noul<0.5", () => {
    expect(isJevAccepted(cleanAnswers, MID, 0.9)).toBe(true);
  });

  it("accepts a flagged verdict with noul>=0.5", () => {
    expect(isJevAccepted(flaggedAnswers, MID, 0.9)).toBe(true);
  });

  it("rejects low-confidence status", () => {
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__status`]: {
            type: "choice",
            choice: "clean",
            confidence: 0.5,
          },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
  });

  it("rejects contradictory clean-with-high-noul", () => {
    expect(
      isJevAccepted(
        answersFor({ [`${MID}__v`]: { type: "noul", noul: 0.95 } }),
        MID,
        0.9,
      ),
    ).toBe(false);
  });

  it("rejects flagged-with-low-noul", () => {
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__v`]: { type: "noul", noul: 0.1 },
          [`${MID}__status`]: {
            type: "choice",
            choice: "flagged",
            confidence: 0.99,
          },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
  });

  it("rejects clean with non-none severity/category/action", () => {
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__severity`]: { type: "choice", choice: "low" },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__category`]: { type: "choice", choice: "spam" },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__action`]: { type: "choice", choice: "monitor" },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
  });

  it("rejects flagged with none severity/category/action", () => {
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__v`]: { type: "noul", noul: 0.9 },
          [`${MID}__status`]: {
            type: "choice",
            choice: "flagged",
            confidence: 0.99,
          },
          [`${MID}__severity`]: { type: "choice", choice: "none" },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__v`]: { type: "noul", noul: 0.9 },
          [`${MID}__status`]: {
            type: "choice",
            choice: "flagged",
            confidence: 0.99,
          },
          [`${MID}__category`]: { type: "choice", choice: "none" },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__v`]: { type: "noul", noul: 0.9 },
          [`${MID}__status`]: {
            type: "choice",
            choice: "flagged",
            confidence: 0.99,
          },
          [`${MID}__action`]: { type: "choice", choice: "none" },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
  });

  it("rejects warn with delete/escalate action", () => {
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__v`]: { type: "noul", noul: 0.6 },
          [`${MID}__status`]: {
            type: "choice",
            choice: "warn",
            confidence: 0.92,
          },
          [`${MID}__severity`]: { type: "choice", choice: "low" },
          [`${MID}__category`]: { type: "choice", choice: "spam" },
          [`${MID}__action`]: { type: "choice", choice: "delete" },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
  });

  it("rejects unknown status/severity/category/action labels", () => {
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__status`]: {
            type: "choice",
            choice: "banned",
            confidence: 0.99,
          },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__severity`]: { type: "choice", choice: "severe" },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__category`]: { type: "choice", choice: "doxxing" },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
    expect(
      isJevAccepted(
        answersFor({
          [`${MID}__action`]: { type: "choice", choice: "destroy" },
        }),
        MID,
        0.9,
      ),
    ).toBe(false);
  });

  it("rejects missing questions", () => {
    const { [`${MID}__action`]: _drop, ...partial } = answersFor({});
    expect(isJevAccepted(partial as JevAnswers, MID, 0.9)).toBe(false);
  });
});

describe("mapJevAnswersToResult", () => {
  it("maps a clean answer to a zero-score analysis result", () => {
    const r = mapJevAnswersToResult(cleanAnswers, MID);
    expect(r).toMatchObject({
      messageId: MID,
      status: "clean",
      flags: [],
      score: 0,
      categories: [],
      severity: "none",
      recommendedAction: "none",
      policyVersion: JEV_POLICY_VERSION,
      confidence: 0.99,
    });
    expect(r.analysis).toContain("status=clean");
    expect(r.analysis).toContain("[Jev]");
  });

  it("maps a flagged answer with calibrated score + category flag", () => {
    const r = mapJevAnswersToResult(flaggedAnswers, MID);
    expect(r.status).toBe("flagged");
    expect(r.flags).toEqual(["vulgar_language"]);
    expect(r.categories).toEqual(["vulgar_language"]);
    expect(r.severity).toBe("high");
    expect(r.recommendedAction).toBe("delete");
    expect(r.score).toBeGreaterThanOrEqual(0.9); // clamped to >=0.7, noul 0.98
    expect(r.analysis).toContain("p_melanggar=0.98");
    expect(r.evidence).toEqual([]);
  });

  it("warns become score 0.45 with no flags", () => {
    const r = mapJevAnswersToResult(
      answersFor({
        [`${MID}__status`]: {
          type: "choice",
          choice: "warn",
          confidence: 0.92,
        },
        [`${MID}__severity`]: { type: "choice", choice: "low" },
        [`${MID}__category`]: {
          type: "choice",
          choice: "conflict_instigation",
        },
        [`${MID}__action`]: { type: "choice", choice: "warn" },
        [`${MID}__v`]: { type: "noul", noul: 0.6 },
      }),
      MID,
    );
    expect(r.status).toBe("warn");
    expect(r.score).toBe(0.45);
    expect(r.flags).toEqual(["conflict_instigation"]);
    expect(r.recommendedAction).toBe("warn");
  });

  it("every category label in the vocab is accepted (no unknown rejection)", () => {
    // A self-consistent FLAGGED base (flagged needs non-none severity/action).
    const flaggedBase = {
      [`${MID}__v`]: { type: "noul", noul: 0.9 },
      [`${MID}__status`]: {
        type: "choice",
        choice: "flagged",
        confidence: 0.99,
      },
      [`${MID}__severity`]: { type: "choice", choice: "medium" },
      [`${MID}__category`]: { type: "choice", choice: "none" },
      [`${MID}__action`]: { type: "choice", choice: "monitor" },
    } satisfies JevAnswers;
    for (const c of JEV_CATEGORIES) {
      // "none" is only valid with clean status (flagged+none is contradictory
      // and MUST be rejected — covered by the cross-consistency tests above).
      if (c === "none") continue;
      const answers = {
        ...flaggedBase,
        [`${MID}__category`]: { type: "choice", choice: c },
      } satisfies JevAnswers;
      expect(isJevAccepted(answers, MID, 0.9)).toBe(true);
    }
  });
});
