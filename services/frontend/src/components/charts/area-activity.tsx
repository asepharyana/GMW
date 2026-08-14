"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

export interface AreaPoint {
  label: string;
  value: number;
}

export interface AreaActivityProps {
  data: AreaPoint[];
  height?: number;
  stroke?: string;
  className?: string;
  label?: string;
}

export function AreaActivity({
  data,
  height = 160,
  stroke = "var(--color-signal)",
  className,
  label,
}: AreaActivityProps) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const width = 600;
  if (data.length === 0)
    return <div className={className} style={{ height }} />;

  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = width / Math.max(data.length - 1, 1);
  const pts = data.map((d, i) => {
    const x = i * stepX;
    const y = height - (d.value / max) * (height - 10) - 5;
    return [x, y] as const;
  });
  const line = pts
    .map(
      (p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const pathLen = 1400;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width: "100%", height }}
      preserveAspectRatio="none"
      role="img"
      aria-label={label ?? "Activity chart"}
    >
      <defs>
        <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <motion.path
        d={area}
        fill={`url(#area-${id})`}
        initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={{ strokeDasharray: pathLen }}
      />
    </svg>
  );
}
