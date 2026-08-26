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
        "mb-3.5 flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
        <h2 className="font-sans text-[1.1rem] font-semibold tracking-tight text-ink">
          {title}
        </h2>
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
  style,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "signal" | "amber" | "vermilion";
  spark?: number[];
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const toneClass =
    tone === "vermilion"
      ? "text-vermilion"
      : tone === "amber"
        ? "text-amber"
        : tone === "signal"
          ? "text-signal"
          : "text-ink";

  return (
    <div
      className={cn("hud-card p-4 transition-all duration-200", className)}
      style={style}
    >
      <div className="flex items-center justify-between">
        <div className="eyebrow">{label}</div>
        {icon && <span className="text-ink-muted">{icon}</span>}
      </div>
      <div
        className={cn(
          "font-sans mt-2 text-[1.65rem] font-semibold leading-none tracking-tight",
          toneClass,
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="font-mono mt-1.5 text-[11px] text-ink-muted">
          {hint}
        </div>
      )}
      {spark && spark.length > 1 && (
        <div className="mt-2.5">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn("h-full rounded-full bg-current", toneClass)}
              style={{
                width: `${Math.min(100, (spark[spark.length - 1] / (Math.max(...spark) || 1)) * 100)}%`,
                opacity: 0.8,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
