// ═══════════════════════════════════════════════════════════════════════════
// Trust model v2 — pure math tests (no DB required)
// ═══════════════════════════════════════════════════════════════════════════
import { describe, expect, it } from "vitest";
import {
  computeCleanTrustGain,
  computeInfractionPenalty,
  INFRACTION_FLOORS,
  INFRACTION_PENALTIES,
  TRUST_DEFAULTS,
} from "../src/modules/ai-moderation/userReputationStore.js";

describe("computeCleanTrustGain — trust CAN rise", () => {
  it("grants +1 every CLEAN_MESSAGES_PER_POINT clean messages", () => {
    const before = computeCleanTrustGain(14);
    expect(before.newStreak).toBe(15);
    expect(before.trustGain).toBe(1);

    const after = computeCleanTrustGain(15);
    expect(after.newStreak).toBe(16);
    expect(after.trustGain).toBe(0);
  });

  it("keeps compounding past the threshold (no wasted progress)", () => {
    expect(computeCleanTrustGain(29).trustGain).toBe(1);
    expect(computeCleanTrustGain(44).trustGain).toBe(1);
    // 45 clean messages from a fresh start → 3 points of recovery
    let gain = 0;
    let streak = 0;
    for (let i = 0; i < 45; i++) {
      const r = computeCleanTrustGain(streak);
      streak = r.newStreak;
      gain += r.trustGain;
    }
    expect(gain).toBe(3);
  });
});

describe("computeInfractionPenalty — fair and escalating", () => {
  const NOW = Date.now();

  it("applies base penalty for a repeat offender outside the window", () => {
    const r = computeInfractionPenalty({
      totalInfractions: 3,
      lastInfractionAt: NOW - TRUST_DEFAULTS.REPEAT_OFFENSE_WINDOW_MS - 1000,
      severity: "medium",
      now: NOW,
    });
    expect(r.penalty).toBe(INFRACTION_PENALTIES.medium); // 6
    expect(r.appliedRules.firstOffense).toBe(false);
    expect(r.appliedRules.repeatEscalation).toBe(false);
  });

  it("halves the penalty for a first offense (leniency)", () => {
    const r = computeInfractionPenalty({
      totalInfractions: 0,
      lastInfractionAt: null,
      severity: "high",
      now: NOW,
    });
    expect(r.penalty).toBe(Math.ceil(INFRACTION_PENALTIES.high / 2)); // 6
    expect(r.appliedRules.firstOffense).toBe(true);
  });

  it("escalates ×1.5 for a repeat offense within 7 days", () => {
    const r = computeInfractionPenalty({
      totalInfractions: 2,
      lastInfractionAt: NOW - 60 * 60 * 1000, // 1h ago
      severity: "medium",
      now: NOW,
    });
    expect(r.penalty).toBe(Math.ceil(INFRACTION_PENALTIES.medium * 1.5)); // 9
    expect(r.appliedRules.repeatEscalation).toBe(true);
  });

  it("critical first offense still hurts but is halved", () => {
    const r = computeInfractionPenalty({
      totalInfractions: 0,
      lastInfractionAt: null,
      severity: "critical",
      now: NOW,
    });
    expect(r.penalty).toBe(Math.ceil(INFRACTION_PENALTIES.critical / 2)); // 13
  });

  it("severity floors prevent minor offenses from zeroing a user", () => {
    expect(INFRACTION_FLOORS.low).toBeGreaterThan(0);
    expect(INFRACTION_FLOORS.medium).toBeGreaterThan(0);
    // high/critical can still reach zero — severe behavior has consequences
    expect(INFRACTION_FLOORS.high).toBe(0);
    expect(INFRACTION_FLOORS.critical).toBe(0);
  });
});
