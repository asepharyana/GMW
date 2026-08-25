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
        {eyebrow && (
          <div className="font-mono text-[10px] font-medium tracking-wider uppercase text-[#8a8f98] mb-0.5">
            {eyebrow}
          </div>
        )}
        <h2 className="font-sans text-[1.1rem] font-semibold tracking-tight text-[#f7f8f8]">
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
  const toneColor =
    tone === "vermilion"
      ? "#f43f5e"
      : tone === "amber"
        ? "#f59e0b"
        : tone === "signal"
          ? "#7170ff"
          : "#f7f8f8";

  return (
    <div
      className={cn(
        "relative rounded-[8px] border border-white/[0.07] bg-white/[0.025] p-4 transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.04]",
        className,
      )}
      style={style}
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#8a8f98]">
          {label}
        </div>
        {icon && <span className="text-[#8a8f98]">{icon}</span>}
      </div>
      <div
        className="font-sans mt-1.5 text-[1.65rem] font-semibold leading-none tracking-tight"
        style={{ color: tone === "neutral" ? undefined : toneColor }}
      >
        {value}
      </div>
      {hint && (
        <div className="font-mono mt-1 text-[10px] text-[#62666d]">{hint}</div>
      )}
      {spark && spark.length > 1 && (
        <div className="mt-2.5">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (spark[spark.length - 1] / (Math.max(...spark) || 1)) * 100)}%`,
                background: toneColor,
                opacity: 0.8,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
