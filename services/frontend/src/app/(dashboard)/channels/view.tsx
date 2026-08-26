"use client";

import { ChannelCultureGlossary } from "@/components/ChannelCultureGlossary";
import { SkeletonPanel } from "@/components/shared";
import { useChannelCultures } from "@/hooks";
import type { ChannelCultureRow } from "@/lib/types";

export function ChannelsView({
  initialCultures,
}: {
  initialCultures?: ChannelCultureRow[];
}) {
  const { data: cultures } = useChannelCultures(100, initialCultures);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-signal" />
          </div>
          <h1 className="font-mono text-xs font-semibold tracking-widest text-ink uppercase">
            CHANNEL ROSTER · SIGNAL_MAP
          </h1>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-soft">
          <span className="text-ink-faint">NODES:</span>
          <span className="font-bold text-signal">{cultures?.length ?? 0}</span>
        </div>
      </div>

      {cultures ? (
        <ChannelCultureGlossary cultures={cultures} />
      ) : (
        <SkeletonPanel rows={6} />
      )}
    </div>
  );
}
