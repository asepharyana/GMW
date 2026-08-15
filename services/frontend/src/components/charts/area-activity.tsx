import type { DailyActivityPoint } from "@/lib/types";

/**
 * Dual-area activity chart: total messages (signal) vs flagged (vermilion).
 * Pure SVG, scales to container. Includes a 7-day trailing window hint.
 */
export function AreaActivity({
  daily,
  height = 200,
}: {
  daily: DailyActivityPoint[];
  height?: number;
}) {
  const w = 720;
  const pad = 8;
  const n = daily.length;
  const max = Math.max(...daily.map((d) => d.messages), 1);
  const x = (i: number) => pad + (i / Math.max(n - 1, 1)) * (w - pad * 2);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);

  const msgLine = daily.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.messages).toFixed(1)}`).join(" ");
  const flagLine = daily.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.flagged).toFixed(1)}`).join(" ");
  const msgArea = `${msgLine} L${x(n - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id="area-msg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-signal)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--color-signal)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={height * g} y2={height * g} stroke="var(--color-hairline)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      <path d={msgArea} fill="url(#area-msg)" />
      <path d={msgLine} fill="none" stroke="var(--color-signal)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <path d={flagLine} fill="none" stroke="var(--color-vermilion)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />
      {daily.map((d, i) =>
        i % 2 === 0 ? (
          <text key={d.day} x={x(i)} y={height - 1} fill="var(--color-ink-faint)" fontSize={9} textAnchor="middle" className="mono">
            {d.day.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
