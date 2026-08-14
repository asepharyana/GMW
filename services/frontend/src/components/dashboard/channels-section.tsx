"use client";

import { Hash, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";
import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { useChannelDetail, useChannels } from "@/hooks";
import type { DashboardChannel } from "@/lib/types";

export function ChannelsSection({ guildId }: { guildId?: string }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: channels = [], isLoading } = useChannels(guildId ?? "", search);
  const { data: detail } = useChannelDetail(selectedId);

  const handleSearch = useCallback((v: string) => setSearch(v), []);

  if (isLoading) return <LoadingSkeleton count={8} />;
  if (channels.length === 0)
    return (
      <EmptyState
        icon={Hash}
        title="No channels"
        description="No channels in this guild."
      />
    );

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
      <div className="surface flex flex-col gap-2 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-soft)]" />
          <Input
            mono
            placeholder="search channels…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {channels.map((c) => (
          <ChannelRow
            key={c.channel_id}
            channel={c}
            selected={selectedId === c.channel_id}
            onSelect={() => setSelectedId(c.channel_id)}
          />
        ))}
      </div>

      <div className="surface p-4">
        {detail ? (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-[var(--radius-r-control)] bg-[var(--color-surface-2)]">
                <Hash className="size-4 text-[var(--color-ink-soft)]" />
              </span>
              <div>
                <div className="font-semibold">
                  {detail.channel_name ?? detail.channel_id}
                </div>
                <div className="text-xs text-[var(--color-ink-soft)]">
                  {detail.total_messages.toLocaleString()} messages
                </div>
              </div>
            </div>
            <Stat
              label="Flagged"
              value={detail.flagged_count}
              tone="vermilion"
            />
            <p className="text-xs text-[var(--color-ink-soft)]">
              {detail.culture_summary ?? "No data yet."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-ink-soft)]">
            Select a channel to inspect.
          </p>
        )}
      </div>
    </div>
  );
}

function ChannelRow({
  channel,
  selected,
  onSelect,
}: {
  channel: DashboardChannel;
  selected: boolean;
  onSelect: () => void;
}) {
  const total = channel.total_messages + channel.flagged_count || 1;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-3 rounded-[var(--radius-r-control)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface-2)] data-[selected]:bg-[var(--color-signal)]/8"
      data-selected={selected}
    >
      <Hash className="size-4 text-[var(--color-ink-soft)]" />
      <span className="min-w-0 flex-1 truncate text-sm">
        {channel.channel_name ?? channel.channel_id}
      </span>
      <span className="mono text-xs text-[var(--color-ink-soft)]">
        {channel.flagged_count}/{channel.total_messages}
      </span>
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-[var(--color-hairline)]">
        <div
          className="h-full bg-[var(--color-signal)]"
          style={{ width: `${(channel.flagged_count / total) * 100}%` }}
        />
      </div>
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "vermilion";
}) {
  return (
    <div className="surface-2 flex items-center justify-between p-2.5">
      <span className="text-xs text-[var(--color-ink-soft)]">{label}</span>
      <span className="mono font-semibold text-[var(--color-vermilion)]">
        {value}
      </span>
    </div>
  );
}
