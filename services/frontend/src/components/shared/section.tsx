import { cn } from "@/lib/utils";

export function SectionHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-start justify-between gap-2 sm:gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="display text-balance text-xl text-ink">{title}</h2>
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  hint,
  tone = "neutral",
  spark,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "signal" | "amber" | "vermilion";
  spark?: number[];
  icon?: React.ReactNode;
  className?: string;
}) {
  const toneColor =
    tone === "vermilion"
      ? "var(--color-vermilion)"
      : tone === "amber"
        ? "var(--color-amber)"
        : tone === "signal"
          ? "var(--color-signal)"
          : "var(--color-ink)";
  return (
    <div className={cn("glass p-4", className)}>
      <div className="flex items-center justify-between">
        <div className="eyebrow">{label}</div>
        {icon && <span className="text-ink-faint">{icon}</span>}
      </div>
      <div
        className="display mt-1 text-[1.9rem] leading-none"
        style={{ color: tone === "neutral" ? undefined : toneColor }}
      >
        {value}
      </div>
      {hint && (
        <div className="mono mt-1 text-[0.68rem] text-ink-faint">{hint}</div>
      )}
      {spark && spark.length > 1 && (
        <div className="mt-2">
          <div
            className="h-1 w-full overflow-hidden rounded-full"
            style={{ background: "oklch(1 0 0 / 0.08)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (spark[spark.length - 1] / (Math.max(...spark) || 1)) * 100)}%`,
                background: toneColor,
                opacity: 0.7,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
