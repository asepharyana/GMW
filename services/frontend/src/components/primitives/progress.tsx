import { cn } from "@/lib/utils";

export function Progress({
  value,
  tone = "signal",
  className,
}: {
  value: number;
  tone?: "signal" | "amber" | "vermilion";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const color =
    tone === "vermilion"
      ? "var(--color-vermilion)"
      : tone === "amber"
        ? "var(--color-amber)"
        : "var(--color-signal)";
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-white/8",
        className,
      )}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${pct}%`,
          background: color,
          boxShadow: `0 0 12px -2px ${color}`,
        }}
      />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-white/20 border-t-signal",
        className,
      )}
    />
  );
}
