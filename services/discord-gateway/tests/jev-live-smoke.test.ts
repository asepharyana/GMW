/**
 * jev-live-smoke.test.ts — LIVE smoke test for the Jev analyzer (real 9router).
 *
 * Gated behind `AI_LLM_JEV_SMOKE=1` (and the Jev env vars) so plain
 * `pnpm test` / CI skips it. Verifies the ACTUAL question set + state
 * builder + acceptance gate + mapper end-to-end against the real
 * `analyzeBatchWithJev` module (no gateway restart needed).
 *
 * Run:
 *   AI_LLM_JEV_SMOKE=1 AI_LLM_JEV_API_KEY=sk-... npx vitest run tests/jev-live-smoke.test.ts
 */
import { describe, expect, it } from "vitest";
import { analyzeBatchWithJev } from "../src/modules/ai-moderation/jevAnalyzer.js";
import type { AnalysisResult } from "../src/modules/message-capture/types.js";

const SMOKE = process.env.AI_LLM_JEV_SMOKE === "1";
const SKIP_REASON =
  "AI_LLM_JEV_SMOKE != 1 — set it + AI_LLM_JEV_API_KEY to run the live smoke against 9router";

describe("Jev live smoke (real 9router /v1/systemone)", () => {
  it.runIf(SMOKE)(
    "analyzes 4 mixed messages with the production question set",
    async () => {
      const targets = [
        {
          id: "m_vulgar",
          user: "alerte",
          content: "kontol lu semua pada goblok, dasar tolol",
        },
        {
          id: "m_clean",
          user: "devganteng",
          content: "gimana hasil compile nya bang? error terus nih",
        },
        {
          id: "m_sara",
          user: "anon",
          content: "agama lu palestina itu sampah, mending dibom habis",
        },
        {
          id: "m_help",
          user: "helper",
          content:
            "nggak papa bang, nanti gw bantu debug, coba pnpm install dulu",
        },
      ];

      const outcome = await analyzeBatchWithJev(
        targets,
        {
          contextBlock:
            "<location_context channel_id='42424242' channel_name='dev-chat'/>\n" +
            "<conversation_context>\n[conversation_flow] status=sparse context_msgs=3 dropped=0\n" +
            "[context] id='c1' time='2026-09-23T08:00:00Z' user='alice': lagi pada error compile nih\n" +
            "</conversation_context>",
          webSearchBlock: "",
          glossaryBlock: "",
          channelCulture: "channel santai developer coding",
        },
        undefined,
        "",
      );

      expect(outcome.error).toBeNull();
      expect(outcome.rejectedIds).toHaveLength(0);

      const byId = Object.fromEntries(
        outcome.results.map((r) => [r.messageId, r]),
      );
      // Vulgar attack → flagged, vulgar_language
      expect(byId.m_vulgar?.status).toBe("flagged");
      expect(byId.m_vulgar?.categories).toContain("vulgar_language");
      // SARA religious slur → flagged (zero-tolerance rule)
      expect(byId.m_sara?.status).toBe("flagged");
      // Clean technical messages → clean
      expect(byId.m_clean?.status).toBe("clean");
      expect(byId.m_help?.status).toBe("clean");

      // Verdicts are calibration-honest (typed by the real pipeline shape)
      const verdicts = outcome.results as AnalysisResult[];
      for (const r of verdicts) {
        expect(r.confidence).toBeGreaterThanOrEqual(0.9);
        if (r.status === "clean") expect(r.score).toBe(0);
        expect(r.analysis).toContain("[Jev]");
        expect(r.analysis).toContain("p_melanggar=");
      }
    },
    SMOKE ? 60_000 : 0,
  );

  it.skipIf(!SMOKE)("skipped when AI_LLM_JEV_SMOKE is unset", () => {
    expect(SKIP_REASON).toBeTruthy();
  });
});
