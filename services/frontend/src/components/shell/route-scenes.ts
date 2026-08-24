/**
 * Scene config: maps pathname → constellation scene definition.
 * Pure data; the stage reads it to build graphs and place overlays.
 */

import type { ConstellationGraph } from "@/lib/constellation/graph";
import {
  channelsToGraph,
  culturesToGraph,
  statsToGraph,
} from "@/lib/constellation/graph";

export interface SceneDef {
  route: string;
  label: string;
  /** Build the graph from typed SSR seed data. */
  build: (seed: SceneSeed) => ConstellationGraph;
}

/** Everything a scene may need — all optional, scenes pick what they use. */
export interface SceneSeed {
  stats?: import("@/lib/types").DashboardStats;
  channels?: import("@/lib/types").DashboardChannel[];
  cultures?: import("@/lib/types").ChannelCultureRow[];
  guildLabel?: string;
}

export const SCENES: SceneDef[] = [
  {
    route: "/dashboard/",
    label: "Deck",
    build: (s) => (s.stats ? statsToGraph(s.stats) : { nodes: [], edges: [] }),
  },
  {
    route: "/channels/",
    label: "Channels",
    build: (s) => {
      if (s.cultures && s.cultures.length > 0)
        return culturesToGraph(s.cultures);
      if (s.channels) return channelsToGraph(s.channels);
      return { nodes: [], edges: [] };
    },
  },
];

export function resolveScene(pathname: string): SceneDef | undefined {
  return SCENES.find((sc) => sc.route === pathname);
}

export function buildDefaultGraph(
  scene: SceneDef,
  seed: SceneSeed,
): ConstellationGraph {
  try {
    return scene.build(seed);
  } catch {
    return { nodes: [], edges: [] };
  }
}
