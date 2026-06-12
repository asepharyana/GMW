import { MonitorUp, Music2 } from "lucide-react";
import type { MediaItem } from "../../../shared/api/client";
import { Badge } from "../../../shared/ui";

interface NowPlayingProps {
  current: MediaItem | null;
  queue: MediaItem[];
}

export function NowPlaying({ current, queue }: NowPlayingProps) {
  if (!current) return null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {current.mode === "screen" ? (
              <MonitorUp className="h-5 w-5" />
            ) : (
              <Music2 className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{current.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {current.source}
            </div>
          </div>
          <Badge variant={current.mode === "screen" ? "warning" : "success"}>
            {current.mode ?? "music"}
          </Badge>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="border-t border-border p-4">
          <div className="mb-2 text-sm font-medium">Queue ({queue.length})</div>
          <div className="space-y-1.5">
            {queue.map((item, i) => (
              <div
                key={`${item.source}-${i}`}
                className="flex items-center gap-3 rounded-lg border-l-2 border-l-primary border-border bg-card p-2.5 text-sm"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.source}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
