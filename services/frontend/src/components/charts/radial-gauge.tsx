import { cn } from "@/lib/utils";

/** Circular progress gauge. value 0..1. */
export function RadialGauge({
  value,
  label,
  sublabel,
  tone = "signal",
  size = 120,
}: {
  value: number;
  label: string;
  sublabel?: string;
  tone?: "signal" | "amber" | "vermilion";
  size?: number;
}) {
  const v = Math.max(0, Math.min(1, value));
  const stroke =
    tone === "vermilion"
      ? "var(--color-vermilion)"
      : tone === "amber"
        ? "var(--color-amber)"
        : "var(--color-signal)";
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label="Progress gauge"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{
            transition: "stroke-dashoffset 0.6s ease",
            filter: `drop-shadow(0 0 6px ${stroke})`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "display text-xl",
            tone === "vermilion" && "text-vermilion",
            tone === "amber" && "text-amber",
            tone === "signal" && "text-signal",
          )}
        >
          {label}
        </span>
        {sublabel && (
          <span className="mono text-[0.6rem] text-ink-faint">{sublabel}</span>
        )}
      </div>
    </div>
  );
}
