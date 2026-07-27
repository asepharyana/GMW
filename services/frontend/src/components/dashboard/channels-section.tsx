"use client";

import { ChevronRight, Hash, Search } from "lucide-react";
import { useState } from "react";

import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChannels } from "@/hooks";

export function ChannelsSection({
  guildId,
  onSelect,
}: {
  guildId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const {
    data: channels,
    isLoading,
    refetch,
  } = useChannels(guildId, search || undefined);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search channels…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      {isLoading ? (
        <LoadingSkeleton count={6} height="h-20" />
      ) : !channels || channels.length === 0 ? (
        <EmptyState icon={Hash} title="No channels found." />
      ) : (
        <div className="space-y-2">
          {channels.map((ch) => (
            <Card
              key={ch.channel_id}
              className="cursor-pointer hover:bg-accent/5 transition-colors"
              onClick={() => onSelect(ch.channel_id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Hash className="size-3.5 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium truncate">
                        {ch.channel_name ?? ch.channel_id.slice(0, 8)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ch.total_messages} messages
                      {ch.flagged_count > 0
                        ? ` · ${ch.flagged_count} flagged`
                        : ""}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0 ml-2" />
                </div>
                {ch.culture_summary && (
                  <p className="text-xs text-muted-foreground/70 mt-2 italic line-clamp-2 border-t border-border/50 pt-2">
                    &ldquo;{ch.culture_summary}&rdquo;
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
