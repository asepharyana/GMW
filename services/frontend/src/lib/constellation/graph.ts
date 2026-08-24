/**
 * Constellation graph model — pure data, no React/DOM.
 * Builders convert existing API payloads into star-graph structures.
 */
import type { DashboardChannel, DashboardStats } from "@/lib/types";

export type NodeKind =
  | "guild"
  | "channel"
  | "message"
  | "flagged"
  | "speaker"
  | "media"
  | "term"
  | "metric";

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  /** Optional route this node navigates to (plain <a href>, trailingSlash). */
  href?: string;
  /** Relative magnitude used for radius/glow (0..1 normalized by caller). */
  value?: number;
  /** Extra scene-specific payload (e.g. flagged count, culture summary). */
  meta?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** Edge thickness/pulse driver. Defaults to 0.5. */
  weight?: number;
}

export interface ConstellationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const clamp01 = (n: number, max: number): number =>
  max <= 0 ? 0.25 : Math.min(1, Math.max(0.05, n / max));

/** Dashboard scene: guild star at center, top channels orbiting it. */
export function statsToGraph(stats: DashboardStats): ConstellationGraph {
  const top = stats.top_channels ?? [];
  const maxCount = top.reduce((m, c) => Math.max(m, c.message_count), 0);
  const nodes: GraphNode[] = [
    {
      id: "guild",
      label: "GMW",
      kind: "guild",
      value: 1,
      meta: {
        total_messages: stats.total_messages,
        total_flagged: stats.total_flagged,
        active_users_24h: stats.active_users_24h,
      },
    },
  ];
  const edges: GraphEdge[] = [];
  for (const ch of top) {
    nodes.push({
      id: `channel:${ch.channel_id}`,
      label: ch.channel_name || ch.channel_id,
      kind: "channel",
      href: "/channels/",
      value: clamp01(ch.message_count, maxCount),
      meta: { message_count: ch.message_count },
    });
    edges.push({
      source: "guild",
      target: `channel:${ch.channel_id}`,
      weight: clamp01(ch.message_count, maxCount),
    });
  }
  return { nodes, edges };
}

/** Channels scene: every channel is a star; size = traffic, color = flags. */
export function channelsToGraph(
  channels: DashboardChannel[],
): ConstellationGraph {
  const maxMsg = channels.reduce((m, c) => Math.max(m, c.total_messages), 0);
  const nodes: GraphNode[] = channels.map((c) => ({
    id: `channel:${c.channel_id}`,
    label: c.channel_name || c.channel_id,
    kind: "channel",
    value: clamp01(c.total_messages, maxMsg),
    meta: {
      flagged_count: c.flagged_count,
      culture_summary: c.culture_summary,
    },
  }));
  return { nodes, edges: [] };
}
