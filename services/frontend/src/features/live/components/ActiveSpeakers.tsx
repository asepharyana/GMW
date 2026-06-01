import type { ActiveSpeaker } from "../../../shared/api/client";
import { Skeleton } from "../../../shared/ui";

interface ActiveSpeakersProps {
  speakers: ActiveSpeaker[];
}

export function ActiveSpeakers({ speakers }: ActiveSpeakersProps) {
  if (speakers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No active speakers.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {speakers.map((s) => {
        // BUG 4 FIX: stable key — no index fallback
        const key = s.userId ?? s.id ?? `speaker-${s.username}`;
        return (
          <div
            key={key}
            className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3"
          >
            <img
              src={s.avatar}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{s.username}</div>
              <div className="text-xs text-emerald-300">Speaking</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ActiveSpeakersSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3"
        >
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
