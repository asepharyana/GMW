"use client";

export interface StaticFallbackProps {
  variant?: "signal" | "orb";
  count?: number;
  className?: string;
}

/**
 * 2D SVG silhouette used when WebGL is unavailable — so the hero still reads
 * as a living visual, never blank. `variant="signal"` = drifting dot grid;
 * `variant="orb"` = speaker orbs.
 */
export function StaticFallback({
  variant = "signal",
  count = 60,
  className,
}: StaticFallbackProps) {
  if (variant === "orb") {
    const orbs = Array.from({ length: count > 12 ? 12 : count }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      const r = 60;
      return {
        x: 100 + Math.cos(angle) * r,
        y: 100 + Math.sin(angle) * r,
        d: i * 0.3,
      };
    });
    return (
      <svg
        viewBox="0 0 200 200"
        className={className}
        aria-hidden
        preserveAspectRatio="xMidYMid slice"
      >
        <rect width="200" height="200" fill="oklch(0.18 0.02 70)" />
        {orbs.map((o, i) => (
          <g
            key={i}
            style={{ animation: `fade-up 1.2s ${o.d}s infinite alternate` }}
          >
            <circle
              cx={o.x}
              cy={o.y}
              r={12}
              fill="oklch(0.82 0.18 125 / 0.5)"
            />
            <circle
              cx={o.x}
              cy={o.y}
              r={20}
              fill="none"
              stroke="oklch(0.82 0.18 125 / 0.3)"
              strokeWidth={1}
            />
          </g>
        ))}
      </svg>
    );
  }

  const dots = Array.from({ length: count }, (_, i) => ({
    x: (i * 53) % 200,
    y: (i * 89) % 200,
    r: 1.5 + ((i * 7) % 3),
  }));
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="200" height="200" fill="oklch(0.18 0.02 70)" />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r}
          fill="oklch(0.82 0.18 125 / 0.4)"
        >
          <animate
            attributeName="opacity"
            values="0.2;0.8;0.2"
            dur="3s"
            begin={`${i * 0.05}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </svg>
  );
}
