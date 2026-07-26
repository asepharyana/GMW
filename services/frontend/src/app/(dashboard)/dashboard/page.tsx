"use client";

import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Clock,
  Hash,
  Search,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useState } from "react";
import {
  DetailStat,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  StatCard,
} from "@/components/shared";
import { GuildSelector } from "@/components/shared/guild-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useChannelDetail,
  useChannels,
  useStats,
  useUserDetail,
  useUsers,
} from "@/hooks";
import { dashboardApi } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { DashboardUser } from "@/lib/types";

type View = "stats" | "users" | "channels" | "user-detail" | "channel-detail";

export default function DashboardPage() {
  const [view, setView] = useState<View>("stats");
  const [guildId, setGuildId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );

  return (
    <div className="space-y-5">
      <GuildSelector value={guildId} onChange={setGuildId} />

      <Tabs
        value={
          view === "user-detail"
            ? "users"
            : view === "channel-detail"
              ? "channels"
              : view
        }
        onValueChange={(v) => setView(v as View)}
      >
        <TabsList>
          <TabsTrigger value="stats" onClick={() => setView("stats")}>
            <BarChart3 className="size-4" /> Stats
          </TabsTrigger>
          <TabsTrigger value="users" onClick={() => setView("users")}>
            <Users className="size-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="channels" onClick={() => setView("channels")}>
            <Hash className="size-4" /> Channels
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "stats" && <StatsSection />}
      {view === "channels" && (
        <ChannelsSection
          guildId={guildId}
          onSelect={(chId) => {
            setSelectedChannelId(chId);
            setView("channel-detail");
          }}
        />
      )}
      {view === "channel-detail" && selectedChannelId && (
        <ChannelDetailSection
          channelId={selectedChannelId}
          onBack={() => setView("channels")}
        />
      )}
    </div>
  );
}

// ── Stats ──────────────────────────────────────────────────────

function StatsSection() {
  const { data: stats, isLoading, error, refetch } = useStats();
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (isLoading || !stats)
    return (
      <div className="space-y-5 animate-fade-in-up">
        <LoadingSkeleton count={8} height="h-28" columns={4} />
      </div>
    );

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Messages"
          value={stats.total_messages}
          icon={Hash}
        />
        <StatCard label="Today" value={stats.today_messages} icon={Clock} />
        <StatCard label="Users" value={stats.total_users} icon={Users} />
        <StatCard
          label="Active 24h"
          value={stats.active_users_24h}
          icon={Sparkles}
        />
        <StatCard
          label="Flagged"
          value={stats.total_flagged}
          icon={AlertCircle}
          variant="danger"
        />
        <StatCard
          label="Clean"
          value={stats.total_clean}
          icon={Shield}
          variant="success"
        />
        <StatCard
          label="Voice Recordings"
          value={stats.total_voice_recordings}
          icon={Hash}
        />
        <StatCard
          label="AI Profiles"
          value={stats.total_profiles}
          icon={Sparkles}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Hash className="size-4 text-muted-foreground" /> Top Channels
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.top_channels.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No channel data yet.
              </p>
            ) : (
              <div className="space-y-2">
                {stats.top_channels.map((ch) => {
                  const max = stats.top_channels[0].message_count;
                  const pct = max > 0 ? (ch.message_count / max) * 100 : 0;
                  return (
                    <div key={ch.channel_id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">
                          #{ch.channel_name ?? ch.channel_id.slice(0, 8)}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatNumber(ch.message_count)}
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="size-4 text-muted-foreground" /> Moderation
              Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Pending",
                  value: stats.moderation_overview.pending,
                  cls: "bg-muted/50",
                },
                {
                  label: "Processing",
                  value: stats.moderation_overview.processing,
                  cls: "bg-yellow-500/10 text-yellow-500",
                },
                {
                  label: "Errors",
                  value: stats.moderation_overview.error,
                  cls: "bg-destructive/10 text-destructive",
                },
              ].map(({ label, value, cls }) => (
                <div
                  key={label}
                  className={`rounded-lg p-3 text-center space-y-1.5 ${cls}`}
                >
                  <div
                    className={`text-2xl font-bold tabular-nums ${cls.includes("yellow") ? "text-yellow-500" : cls.includes("destructive") ? "text-destructive" : ""}`}
                  >
                    {value}
                  </div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Channels ──────────────────────────────────────────────────

function ChannelsSection({
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

// ── Channel Detail ────────────────────────────────────────────

function ChannelDetailSection({
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
