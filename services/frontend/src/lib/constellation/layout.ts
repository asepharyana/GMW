/**
 * Deterministic constellation layout — pure functions over graph data.
 * d3-force with a seeded PRNG so every render produces the same sky.
 * `prefers-reduced-motion` callers use the static radial fallback.
 */
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force";

export interface LayoutNode extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
  /** Screen-space radius in px (already scaled by value + kind). */
  r: number;
}

export interface LayoutOptions {
  /** Canvas width in CSS px. */
  width: number;
  height: number;
  seed?: number;
  /** Static radial ring layout (no simulation). */
  reduced?: boolean;
}

/** Mulberry32 — small, fast, deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function radiusFor(kind: string, value = 0.5): number {
  const base =
    kind === "guild"
      ? 34
      : kind === "channel"
        ? 16
        : kind === "flagged"
          ? 11
          : 9;
  return base * (0.55 + 0.9 * Math.max(0, Math.min(1, value)));
}

/**
 * Compute final positions. Same inputs (+seed) ⇒ identical output positions.
 */
export function computeLayout(
  nodesIn: { id: string; kind: string; value?: number }[],
  edges: { source: string; target: string }[],
  opts: LayoutOptions,
): LayoutNode[] {
  const rand = mulberry32(opts.seed ?? 42);
  const cx = opts.width / 2;
  const cy = opts.height / 2;

  if (opts.reduced || nodesIn.length === 0) {
    return nodesIn.map((n, i) => ({
      ...n,
      x: cx + radiusFor(n.kind, n.value),
      y:
        cy +
        Math.sin((i / Math.max(1, nodesIn.length)) * Math.PI * 2) *
          Math.min(cx, cy) *
          0.62,
      r: radiusFor(n.kind, n.value),
    }));
  }

  const simNodes = nodesIn.map((n) => ({
    id: n.id,
    kind: n.kind,
    value: n.value ?? 0.5,
    r: radiusFor(n.kind, n.value),
    x: cx + (rand() - 0.5) * opts.width * 0.8,
    y: cy + (rand() - 0.5) * opts.height * 0.8,
  }));

  const sim = forceSimulation(simNodes)
    .force("charge", forceManyBody().strength(-420))
    .force(
      "link",
      forceLink(edges.map((e) => ({ ...e })))
        .id((d) => (d as { id: string }).id)
        .distance(120)
        .strength(0.6),
    )
    .force("center", forceCenter(cx, cy))
    .force(
      "collide",
      forceCollide((d) => (d as { r: number }).r + 14),
    )
    .stop();

  // Fixed tick budget keeps the result deterministic across machines.
  for (let i = 0; i < 240; i++) sim.tick();
  sim.on("tick", null);

  return simNodes.map((n) => ({
    id: n.id,
    x: Number.isFinite(n.x) ? n.x : cx,
    y: Number.isFinite(n.y) ? n.y : cy,
    r: n.r,
  }));
}
