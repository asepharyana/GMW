"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export interface WaveformProps {
  seed: string | number;
  bars?: number;
  height?: number;
  className?: string;
  tone?: "signal" | "amber" | "vermilion";
}

// deterministic pseudo-random from seed so the shape is stable per recording
function hashSeed(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function Waveform({
  seed,
  bars = 40,
  height = 40,
  className,
  tone = "signal",
}: WaveformProps) {
  const reduce = useReducedMotion();
  const values = useMemo(() => {
    let state = hashSeed(seed) || 1;
    const out: number[] = [];
    for (let i = 0; i < bars; i++) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      const r = (state % 1000) / 1000;
      // envelope: louder in the middle, quieter at edges
      const env = Math.sin((i / (bars - 1)) * Math.PI);
      out.push(0.18 + r * 0.82 * (0.4 + env * 0.6));
    }
    return out;
  }, [seed, bars]);

  const color = {
    signal: "var(--color-signal)",
    amber: "var(--color-amber)",
    vermilion: "var(--color-vermilion)",
  }[tone];

  return (
    <div
      className={cn("flex items-end gap-[2px]", className)}
      style={{ height }}
      aria-hidden
    >
      {values.map((v, i) => (
        <motion.span
          key={i}
          className="flex-1 rounded-[2px]"
          style={{ background: color, height: `${Math.max(8, v * 100)}%` }}
          initial={reduce ? false : { scaleY: 0.2, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          whileHover={{ scaleY: 1.15 }}
          transition={{
            duration: 0.3,
            delay: reduce ? 0 : i * 0.006,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      ))}
    </div>
  );
}
