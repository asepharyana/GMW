import { describe, expect, test } from "bun:test";
import { channelsToGraph, statsToGraph } from "./graph";
import { computeLayout, radiusFor } from "./layout";

const statsFixture = {
  total_messages: 1200,
  total_users: 40,
  total_flagged: 30,
  total_clean: 1100,
  total_warned: 12,
  total_error: 2,
  total_voice_recordings: 8,
  total_profiles: 40,
  today_messages: 55,
  today_flagged: 3,
  active_users_24h: 18,
  top_channels: [
    { channel_id: "c1", channel_name: "general", message_count: 400 },
    { channel_id: "c2", channel_name: "random", message_count: 200 },
  ],
  moderation_overview: { pending: 1, processing: 0, error: 0 },
};

describe("statsToGraph", () => {
  test("guild center + channel nodes + edges", () => {
    const g = statsToGraph(statsFixture);
    expect(g.nodes.length).toBe(3);
    expect(g.nodes[0]?.id).toBe("guild");
    expect(g.edges.length).toBe(2);
    expect(g.edges[0]?.source).toBe("guild");
  });

  test("bigger channel gets bigger value", () => {
    const g = statsToGraph(statsFixture);
    const c1 = g.nodes.find((n) => n.label === "general");
    const c2 = g.nodes.find((n) => n.label === "random");
    expect((c1?.value ?? 0) > (c2?.value ?? 0)).toBe(true);
  });

  test("empty top_channels still yields guild node", () => {
    const g = statsToGraph({ ...statsFixture, top_channels: [] });
    expect(g.nodes.length).toBe(1);
    expect(g.edges.length).toBe(0);
  });
});

describe("channelsToGraph", () => {
  test("maps every channel", () => {
    const chans = [
      {
        channel_id: "a",
        channel_name: "alpha",
        total_messages: 10,
        flagged_count: 1,
      },
      { channel_id: "b", total_messages: 5, flagged_count: 0 },
    ];
    const g = channelsToGraph(chans);
    expect(g.nodes.length).toBe(2);
    expect(g.nodes[1]?.label).toBe("b"); // falls back to id when name null
  });
});

describe("computeLayout", () => {
  const nodes = [
    { id: "guild", kind: "guild", value: 1 },
    { id: "channel:c1", kind: "channel", value: 0.8 },
    { id: "channel:c2", kind: "channel", value: 0.4 },
  ];
  const edges = [
    { source: "guild", target: "channel:c1" },
    { source: "guild", target: "channel:c2" },
  ];

  test("deterministic for same seed", () => {
    const a = computeLayout(nodes, edges, {
      width: 900,
      height: 700,
      seed: 42,
    });
    const b = computeLayout(nodes, edges, {
      width: 900,
      height: 700,
      seed: 42,
    });
    expect(a.map((n) => [n.id, Math.round(n.x), Math.round(n.y)])).toEqual(
      b.map((n) => [n.id, Math.round(n.x), Math.round(n.y)]),
    );
  });

  test("all finite positions within canvas bounds", () => {
    const out = computeLayout(nodes, edges, {
      width: 900,
      height: 700,
      seed: 7,
    });
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.x).toBeGreaterThanOrEqual(-50);
      expect(n.x).toBeLessThanOrEqual(950);
      expect(n.y).toBeGreaterThanOrEqual(-50);
      expect(n.y).toBeLessThanOrEqual(750);
    }
  });

  test("reduced motion returns static ring", () => {
    const out = computeLayout(nodes, edges, {
      width: 900,
      height: 700,
      reduced: true,
    });
    expect(out.length).toBe(3);
    expect(Number.isFinite(out[0]?.y ?? NaN)).toBe(true);
  });
});

describe("radiusFor", () => {
  test("guild larger than channel larger than message", () => {
    expect(radiusFor("guild", 1)).toBeGreaterThan(radiusFor("channel", 1));
    expect(radiusFor("channel", 1)).toBeGreaterThan(radiusFor("message", 1));
  });
});
