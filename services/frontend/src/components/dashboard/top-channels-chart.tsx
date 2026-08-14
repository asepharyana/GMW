import { Hash } from "lucide-react";
import type { TopChannel } from "@/lib/types";

export interface TopChannelsChartProps {
  channels: TopChannel[];
}

export function TopChannelsChart({ channels }: TopChannelsChartProps) {
  const max = Math.max(...channels.map((c) => c.message_count), 1);
  const top = [...channels]
    .sort((a, b) => b.message_count - a.message_count)
    .slice(0, 8);
  return (
    <div className="surface p-4">
      <h3 className="mb-3 text-sm font-semibold">Top channels</h3>
      <div className="flex flex-col gap-2.5">
        {top.map((c) => (
          <div key={c.channel_id} className="flex items-center gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-r-control)] bg-[var(--color-surface-2)] text-[var(--color-ink-soft)]">
              <Hash className="size-3.5" />
            </span>
            <span className="w-32 shrink-0 truncate text-xs text-[var(--color-ink)]">
              {c.channel_name ?? c.channel_id}
            </span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-signal)] transition-[width] duration-500"
                style={{ width: `${(c.message_count / max) * 100}%` }}
              />
            </div>
            <span className="mono w-12 shrink-0 text-right text-xs text-[var(--color-ink-soft)]">
              {c.message_count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
