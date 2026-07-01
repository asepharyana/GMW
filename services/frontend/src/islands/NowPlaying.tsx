// ─── NowPlaying.tsx — Current media track display island ───────────────────
// Self-contained: fetches /api/media/status on mount, shows current track or
// "Nothing playing" fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { Music2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getMediaStatus } from "../shared/api/client.js";
import type { MediaState } from "../shared/types/media.js";

export default function NowPlaying() {
  const [mediaState, setMediaState] = useState<MediaState | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getMediaStatus()
      .then((state) => {
        if (!cancelled) setMediaState(state);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (errored) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Nothing playing</p>
      </div>
    );
  }

  if (!mediaState || !mediaState.current) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Nothing playing</p>
      </div>
    );
  }

  const { current } = mediaState;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Music2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{current.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {current.source}
          </div>
        </div>
        {current.mode && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {current.mode}
          </span>
        )}
      </div>
    </div>
  );
}
