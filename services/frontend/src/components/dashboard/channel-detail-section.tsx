"use client";

import { ArrowLeft, Clock, Hash, Sparkles } from "lucide-react";

import { DetailStat, ErrorState, LoadingSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useChannelDetail } from "@/hooks";

export function ChannelDetailSection({
  channelId,
  onBack,
}: {
  channelId: string;
  onBack: () => void;
}) {
  const { data: channel, isLoading } = useChannelDetail(channelId);
  if (isLoading) return <LoadingSkeleton count={1} height="h-64" />;
  if (!channel) return <ErrorState message="Channel not found." />;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4 mr-1" /> Back
      </Button>
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Hash className="size-5 text-muted-foreground" />
              {channel.channel_name ?? channel.channel_id.slice(0, 8)}
            </h2>
            <p className="text-xs text-muted-foreground font-mono">
              {channel.channel_id}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailStat label="Messages" value={channel.total_messages} />
            <DetailStat
              label="Flagged"
              value={channel.flagged_count}
              variant="danger"
            />
            <DetailStat
              label="Clean"
              value={channel.clean_count}
              variant="success"
            />
          </div>
          {channel.culture_summary && (
            <div className="rounded-lg bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="size-4 text-primary" />
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Channel Culture
                </p>
              </div>
              <p className="text-sm leading-relaxed italic">
                &ldquo;{channel.culture_summary}&rdquo;
              </p>
            </div>
          )}
          {channel.recent_messages.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" /> Recent
                Messages
              </h3>
              <div className="space-y-2">
                {channel.recent_messages.slice(0, 5).map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">
                        {msg.username}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
