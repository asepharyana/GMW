// ─── Mic level meter — vertical bar showing outgoing audio RMS level ─────────

interface MicLevelMeterProps {
  level: number; // 0-1
}

export function MicLevelMeter({ level }: MicLevelMeterProps) {
  const pct = Math.round(level * 100);

  // Color gradient: green <-> yellow <-> red
  const hue = 120 - level * 120; // 120 (green) -> 0 (red)
  const bg = `hsl(${hue}, 80%, 45%)`;

  return (
    <div
      className="relative flex h-6 w-24 overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Microphone level"
    >
      <div
        className="h-full rounded-full transition-[width,background-color] duration-75 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: bg }}
      />
    </div>
  );
}
