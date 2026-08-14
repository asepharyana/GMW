"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

export interface RadialGaugeProps {
  /** 0..1 health ratio */
  value: number;
  size?: number;
  label?: string;
  sublabel?: string;
  tone?: "signal" | "amber" | "vermilion";
}

const toneColor = {
  signal: "var(--color-signal)",
  amber: "var(--color-amber)",
  vermilion: "var(--color-vermilion)",
};

export function RadialGauge({
  value,
  size = 160,
  label,
  sublabel,
  tone = "signal",
}: RadialGaugeProps) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const dash = c * pct;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`${Math.round(pct * 100)}% ${label ?? "gauge"}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneColor[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - dash }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="display text-2xl mono"
          style={{ color: toneColor[tone] }}
        >
          {Math.round(pct * 100)}%
        </span>
        {label && (
          <span className="text-[11px] font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">
            {label}
          </span>
        )}
        {sublabel && (
          <span className="text-[10px] text-[var(--color-ink-soft)]/70">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
