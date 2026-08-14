import { cn } from "@/lib/utils";

export interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  tone?: "signal" | "amber" | "vermilion";
  showLabel?: boolean;
}

export function Progress({
  value,
  max = 100,
  className,
  tone = "signal",
  showLabel,
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const stroke = {
    signal: "var(--color-signal)",
    amber: "var(--color-amber)",
    vermilion: "var(--color-vermilion)",
  }[tone];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-hairline)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: stroke }}
        />
      </div>
      {showLabel && (
        <span className="mono text-xs text-[var(--color-ink-soft)]">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
