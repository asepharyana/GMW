import { cn } from "@/lib/utils";

/** Live equalizer bars. `bars` are 0..1 levels. */
export function Equalizer({
  bars,
  color = "var(--color-signal)",
  className,
}: {
  bars: number[];
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex h-10 items-end gap-[3px]", className)}>
      {bars.length === 0 ? (
        <div className="flex w-full items-end gap-[3px]">
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} className="flex-1 rounded-full bg-white/10" style={{ height: "12%" }} />
          ))}
        </div>
      ) : (
        bars.map((b, i) => (
          <span
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${Math.max(6, b * 100)}%`,
              background: color,
              boxShadow: b > 0.05 ? `0 0 8px ${color}` : "none",
              transition: "height 90ms linear",
            }}
          />
        ))
      )}
    </div>
  );
}
