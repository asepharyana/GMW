"use client";

import { Hash } from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { ChannelCultureGlossary } from "@/components/ChannelCultureGlossary";
import { GlassPanel } from "@/components/primitives";
import {
  EmptyState,
  ErrorState,
  PageTransition,
  SectionHeader,
  SkeletonPanel,
} from "@/components/shared";
import { useChannelCultures, useChannels } from "@/hooks";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { formatNumber } from "@/lib/format";
import type { DashboardChannel } from "@/lib/types";

type ViewMode = "roster" | "culture";

export function ChannelsView({
  initialCultures,
}: {
  initialCultures?: import("@/lib/types").ChannelCultureRow[];
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("roster");
  const { data: channels, isLoading, error } = useChannels();
  const ambient = useAmbient();

  const containerRef = useStaggerReveal<HTMLDivElement>(
    ".channel-roster-card",
    {
      stagger: 0.03,
      y: 8,
      dependencies: [channels?.length],
    },
  );

  useEffect(() => {
    ambient.set("signal", 0.25, "channels");
  }, [ambient]);

  if (error && !channels) return <ErrorState error={error} />;

  return (
    <PageTransition>
      <div ref={containerRef} className="space-y-4">
        {/* Tactical HUD Header Bar */}
        <div className="channel-roster-card flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex size-3 items-center justify-center">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-signal" />
            </div>
            <h1 className="font-mono text-xs font-semibold tracking-widest text-ink uppercase">
              Channel Roster · Signal Map
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("roster")}
                className={`rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
                  viewMode === "roster"
                    ? "bg-surface text-ink border border-hairline-focus shadow-xs"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                ROSTER
              </button>
              <button
                type="button"
                onClick={() => setViewMode("culture")}
                className={`rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
                  viewMode === "culture"
                    ? "bg-surface text-ink border border-hairline-focus shadow-xs"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                CULTURE
              </button>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-soft">
              <span className="text-ink-faint">NODES:</span>
              <span className="font-bold text-signal">
                {channels?.length ?? 0}
              </span>
            </div>
          </div>
        </div>

        {viewMode === "culture" ? (
          <ChannelsCultureView initialCultures={initialCultures} />
        ) : (
          <>
            {isLoading && !channels ? (
              <SkeletonPanel rows={8} />
            ) : !channels || channels.length === 0 ? (
              <EmptyState
                icon={<Hash className="size-7" />}
                title="No channels discovered"
                description="Channels appear here once the Discord gateway captures messages."
              />
            ) : (
              <GlassPanel className="channel-roster-card">
                <SectionHeader
                  eyebrow="registry"
                  title="Channel Roster"
                  action={
                    <span className="mono text-xs text-[#8a8f98]">
                      {channels.length} channels
                    </span>
                  }
                />
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-hairline font-mono text-[10px] text-ink-muted uppercase">
                        <th className="px-3 py-2">Channel</th>
                        <th className="px-3 py-2 text-right">Messages</th>
                        <th className="px-3 py-2 text-right">Clean</th>
                        <th className="px-3 py-2 text-right">Flagged</th>
                        <th className="px-3 py-2">Risk</th>
                        <th className="px-3 py-2 text-right">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channels.map((ch) => (
                        <ChannelRow key={ch.channel_id} channel={ch} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassPanel>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}

function ChannelRow({ channel }: { channel: DashboardChannel }) {
  const total = channel.total_messages || 1;
  const flaggedPct = channel.flagged_count
    ? (channel.flagged_count / total) * 100
    : 0;
  const riskTone =
    flaggedPct > 10 ? "vermilion" : flaggedPct > 3 ? "amber" : "signal";

  return (
    <tr className="border-b border-hairline/50 transition-colors hover:bg-surface-2/50">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Hash className="size-3.5 text-signal" />
          <div>
            <div className="font-medium text-ink">
              {channel.channel_name ?? channel.channel_id.slice(0, 20)}
            </div>
            {channel.guild_id && (
              <div className="font-mono text-[9px] text-ink-faint">
                guild: {channel.guild_id.slice(0, 12)}…
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-[11px] font-semibold text-ink">
        {formatNumber(channel.total_messages)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className="font-mono text-[11px] text-success">
          {formatNumber(channel.total_messages - channel.flagged_count)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <span
          className={`font-mono text-[11px] ${
            channel.flagged_count > 0 ? "text-vermilion" : "text-ink-muted"
          }`}
        >
          {formatNumber(channel.flagged_count)}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full ${
                riskTone === "vermilion"
                  ? "bg-vermilion"
                  : riskTone === "amber"
                    ? "bg-amber"
                    : "bg-signal"
              }`}
              style={{ width: `${Math.min(100, flaggedPct * 3)}%` }}
            />
          </div>
          <span className="font-mono text-[9px] text-ink-faint">
            {flaggedPct.toFixed(1)}%
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        {channel.last_message_at ? (
          <span
            className="font-mono text-[10px] text-ink-muted"
            suppressHydrationWarning
          >
            {new Date(channel.last_message_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </td>
    </tr>
  );
}

function ChannelsCultureView({
  initialCultures,
}: {
  initialCultures?: import("@/lib/types").ChannelCultureRow[];
}) {
  const { data: cultures } = useChannelCultures(100, initialCultures);

  return cultures ? (
    <ChannelCultureGlossary cultures={cultures} />
  ) : (
    <SkeletonPanel rows={6} />
  );
}
