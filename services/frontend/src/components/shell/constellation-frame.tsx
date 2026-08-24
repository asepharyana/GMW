"use client";

/**
 * ConstellationFrame — replaces the classic AppFrame chrome.
 * The stage canvas sits fixed behind everything; page content is an
 * overlay layer (no top bar / nav rail / scroll shell). Views publish
 * their live graph via SceneGraphProvider; the frame renders whatever
 * the active view published (fallback: route-scenes default builder).
 * Chatbot + CommandPalette keep mounting at the layout level.
 */
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import { MiniPlayer } from "@/components/media/mini-player";
import { ConstellationStage } from "@/components/shell/constellation-stage";
import { FloatingChrome } from "@/components/shell/floating-chrome";
import {
  buildDefaultGraph,
  resolveScene,
  type SceneSeed,
} from "@/components/shell/route-scenes";
import { SceneA11yMirror } from "@/components/shell/scene-a11y-mirror";
import {
  SceneGraphProvider,
  useSceneGraph,
} from "@/components/shell/scene-graph-context";

function StageFromContext({ seed }: { seed?: SceneSeed }) {
  const pathname = usePathname() ?? "/";
  const { state, setFocus } = useSceneGraph();
  const onChannelsRoute = pathname.startsWith("/channels");

  const graph = useMemo(() => {
    if (state) return state.graph;
    const scene = resolveScene(pathname);
    return scene
      ? buildDefaultGraph(scene, seed ?? {})
      : { nodes: [], edges: [] };
  }, [state, pathname, seed]);

  return (
    <ConstellationStage
      graph={graph}
      selectedId={state?.focus ?? null}
      onNodeClick={(id) => {
        // On /channels/ a click selects the star (opens its dossier).
        if (onChannelsRoute && id.startsWith("channel:")) {
          setFocus((prev) => (prev === id ? null : id));
          return;
        }
        const meta = state?.graph.nodes.find((n) => n.id === id);
        if (meta?.href) window.location.assign(meta.href);
      }}
    />
  );
}

export function ConstellationFrame({
  children,
  sceneSeed,
}: ConstellationFrameProps_) {
  return (
    <SceneGraphProvider>
      <div className="relative h-dvh w-full overflow-hidden">
        <StageFromContext seed={sceneSeed} />
        <FloatingChrome />
        <SceneA11yMirror />
        <MiniPlayer />
        {/* Overlay content region — scenes place floating panels inside. */}
        <main className="pointer-events-none absolute inset-0 z-10 overflow-y-auto overscroll-contain">
          {/* no pointer-events here: empty areas stay click-through to the sky */}
          <div className="h-full">{children}</div>
        </main>
      </div>
    </SceneGraphProvider>
  );
}

interface ConstellationFrameProps_ {
  children: ReactNode;
  /** Typed SSR seed for the route-scenes fallback builder. */
  sceneSeed?: SceneSeed;
}
