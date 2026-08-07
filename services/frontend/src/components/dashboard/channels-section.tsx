"use client";

import { Hash, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChannelDetail, useChannels } from "@/hooks";
import { renderMessageContent } from "@/lib/format";
import type { DashboardChannel } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChannelsSection({ guildId }: { guildId?: string }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    data: channels = [],
    isLoading,
    error,
    mutate: refetch,
  } = useChannels(guildId ?? "", search);
  const { data: detail } = useChannelDetail(selectedId);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setSelectedId(null);
  }, []);

  if (error) {
    return (
      <Card
        className={cn(
          "p-6 text-sm",
          "border border-red-500/30 ring-red-500/20",
          "[--card-spacing:0px]",
          "rounded-2xl",
        )}
      >
        Failed to load channels: {error.message}
        <Button
          variant="outline"
          size="sm"
          className="ml-2"
          onClick={() => refetch()}
        >
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by channel ID or name…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {isLoading ? (
          <LoadingSkeleton count={5} height="h-14" />
        ) : channels.length === 0 ? (
          <EmptyState icon={Hash} title="No channels found" />
        ) : (
          <div className="space-y-2">
            {channels.map((channel) => (
              <ChannelRow
                key={channel.channel_id}
                channel={channel}
                active={selectedId === channel.channel_id}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        )}
      </div>

      <Card
        className={cn("h-fit", "[--card-spacing:0px]", "rounded-2xl", "p-5")}
      >
        {detail ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Hash className="size-4 text-primary" />
              <p className="text-sm font-semibold text-text-primary">
                {detail.channel_name ?? detail.channel_id}
              </p>
              <p className="text-[10px] font-mono text-text-secondary/50 ml-auto">
                {detail.channel_id}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">Messages: {detail.total_messages}</Badge>
              <Badge variant="destructive">
                Flagged: {detail.flagged_count}
              </Badge>
              <Badge
                variant="outline"
                className="border-green-500/40 text-green-500"
              >
                Clean: {detail.clean_count}
              </Badge>
            </div>

            {detail.culture_summary && (
              <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary/50 mb-1">
                  Culture summary
                </p>
                <p className="text-xs leading-relaxed text-text-secondary">
                  {detail.culture_summary}
                </p>
              </div>
            )}

            {detail.recent_messages.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary/50">
                  Recent messages
                </p>
                {detail.recent_messages.slice(0, 5).map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-lg border border-border/40 bg-card/40 px-3 py-2"
                  >
                    <p className="text-xs leading-relaxed text-text-secondary line-clamp-2">
                      {msg.username}:{" "}
                      {renderMessageContent(msg.content, msg.metadata) ||
                        "(no text content)"}
                    </p>
                    <p className="mt-1 text-[10px] font-mono text-text-secondary/40">
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <Hash className="size-8 text-text-secondary/30 mb-2" />
            <p className="text-xs text-text-secondary/60">
              Select a channel to see its culture summary and recent messages.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function ChannelRow({
  channel,
  active,
  onSelect,
}: {
  channel: DashboardChannel;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Card
      className={active ? "border-primary/40 bg-primary/5" : undefined}
      onClick={() => onSelect(channel.channel_id)}
    >
      <CardContent className="flex cursor-pointer items-center gap-3 p-3">
        <Hash className="size-4 shrink-0 text-text-secondary/50" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {channel.channel_name ?? channel.channel_id}
          </p>
          <p className="truncate text-[10px] font-mono text-text-secondary/50">
            {channel.channel_id}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Badge variant="outline">{channel.total_messages}</Badge>
          {channel.flagged_count > 0 && (
            <Badge variant="destructive">{channel.flagged_count}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
