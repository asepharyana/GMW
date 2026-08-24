"use client";

/**
 * ConstellationFrame — replaces the classic AppFrame chrome.
 * The stage canvas sits fixed behind everything; page content is an
 * overlay layer (absolute, no top bar / nav rail / scroll shell).
 * MiniPlayer + Chatbot + CommandPalette keep mounting at the layout level.
 */
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import { ConstellationStage } from "@/components/shell/constellation-stage";
import { FloatingChrome } from "@/components/shell/floating-chrome";
import { resolveScene, type SceneSeed } from "@/components/shell/route-scenes";

export interface ConstellationFrameProps {
  children: ReactNode;
  /** Typed SSR seed consumed by the active scene's graph builder. */
  sceneSeed?: SceneSeed;
}

export function ConstellationFrame({
  children,
  sceneSeed,
}: ConstellationFrameProps) {
  const pathname = usePathname() ?? "/";
  const scene = useMemo(() => resolveScene(pathname), [pathname]);
  const graph = useMemo(
    () => (scene ? scene.build(sceneSeed ?? {}) : { nodes: [], edges: [] }),
    [scene, sceneSeed],
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <ConstellationStage
        graph={graph}
        onNodeClick={(id) => {
          if (id.startsWith("channel:")) window.location.assign("/channels/");
        }}
      />
      <FloatingChrome />
      {/* Overlay content region — scenes place floating panels inside. */}
      <main className="pointer-events-none absolute inset-0 z-10 overflow-y-auto overscroll-contain">
        <div className="pointer-events-auto min-h-full">{children}</div>
      </main>
    </div>
  );
}
