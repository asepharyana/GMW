"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AmbientCanvas } from "./ambient-canvas";

export type SignalTone = "signal" | "amber" | "vermilion";

/** sRGB triplets for the three semantic signals (matches globals.css). */
export const SIGNAL_RGB: Record<SignalTone, [number, number, number]> = {
  signal: [0.42, 1.0, 0.52],
  amber: [1.0, 0.76, 0.28],
  vermilion: [1.0, 0.34, 0.28],
};

export interface AmbientState {
  tone: SignalTone;
  /** 0..1 — drives haze density + drift speed (e.g. server load). */
  intensity: number;
  label?: string;
}

export interface AmbientControls {
  set: (tone: SignalTone, intensity?: number, label?: string) => void;
  reset: () => void;
  state: AmbientState;
}

const DEFAULT: AmbientState = { tone: "signal", intensity: 0.35, label: "nominal" };

const AmbientContext = createContext<AmbientControls | null>(null);

/**
 * Holds the live ambient signal. The canvas reads `targetRef` inside its
 * render loop (no React re-render per frame); `state` is mirrored into React
 * only so small UI bits (topbar) can reflect the current tone.
 */
export function AmbientProvider({ children }: { children: React.ReactNode }) {
  const targetRef = useRef<AmbientState>({ ...DEFAULT });
  const [state, setState] = useState<AmbientState>(DEFAULT);

  const set = useCallback((tone: SignalTone, intensity?: number, label?: string) => {
    targetRef.current = {
      tone,
      intensity: intensity ?? targetRef.current.intensity,
      label: label ?? targetRef.current.label,
    };
    setState({ ...targetRef.current });
  }, []);

  const reset = useCallback(() => {
    targetRef.current = { ...DEFAULT };
    setState({ ...DEFAULT });
  }, []);

  const value = useMemo<AmbientControls>(
    () => ({ set, reset, state }),
    [set, reset, state],
  );

  return (
    <AmbientContext.Provider value={value}>
      <AmbientCanvas targetRef={targetRef} />
      {children}
    </AmbientContext.Provider>
  );
}

export function useAmbient(): AmbientControls {
  const ctx = useContext(AmbientContext);
  if (!ctx) throw new Error("useAmbient must be used within <AmbientProvider>");
  return ctx;
}
