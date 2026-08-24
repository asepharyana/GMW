"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
/**
 * SceneGraph bridge — views publish their live graph to the stage.
 * The frame provides the setter; the stage consumes the graph.
 * Keeps SSR seed pattern intact: page.tsx seeds view.tsx, view publishes.
 */
import type { ConstellationGraph } from "@/lib/constellation/graph";

export interface SceneGraphState {
  graph: ConstellationGraph;
  /** Node id currently focused (drives fly-to / highlight). */
  focus: string | null;
}

type FocusUpdate = string | null | ((prev: string | null) => string | null);

interface SceneGraphContextValue {
  state: SceneGraphState | null;
  publish: (state: SceneGraphState) => void;
  setFocus: (update: FocusUpdate) => void;
}

const SceneGraphContext = createContext<SceneGraphContextValue>({
  state: null,
  publish: () => {},
  setFocus: () => {},
});

export function SceneGraphProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SceneGraphState | null>(null);
  const stateRef = useRef<SceneGraphState | null>(null);

  const publish = useCallback((next: SceneGraphState) => {
    const prev = stateRef.current;
    const sameShape =
      prev &&
      prev.graph.nodes.length === next.graph.nodes.length &&
      prev.graph.edges.length === next.graph.edges.length &&
      prev.focus === next.focus;
    if (!sameShape) {
      stateRef.current = next;
      setState(next);
      return;
    }
    // Same shape — still update node values/labels in place.
    let changed = false;
    if (prev) {
      for (let i = 0; i < next.graph.nodes.length; i++) {
        const a = prev.graph.nodes[i];
        const b = next.graph.nodes[i];
        if (a?.id !== b?.id || a?.label !== b?.label || a?.value !== b?.value) {
          changed = true;
          break;
        }
      }
    }
    if (changed || !prev) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const setFocus = useCallback((update: FocusUpdate) => {
    setState((prev) => {
      if (!prev) return null;
      const next = typeof update === "function" ? update(prev.focus) : update;
      return next === prev.focus ? prev : { ...prev, focus: next };
    });
  }, []);

  const value = useMemo(
    () => ({ state, publish, setFocus }),
    [state, publish, setFocus],
  );
  return (
    <SceneGraphContext.Provider value={value}>
      {children}
    </SceneGraphContext.Provider>
  );
}

export function useScenePublish(): (state: SceneGraphState) => void {
  return useContext(SceneGraphContext).publish;
}

export function useSceneFocusSetter(): (update: FocusUpdate) => void {
  return useContext(SceneGraphContext).setFocus;
}

export type { FocusUpdate };

export function useSceneGraph(): SceneGraphContextValue {
  return useContext(SceneGraphContext);
}
