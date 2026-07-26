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
import { useEffect, useState } from "react";
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
import { useChannels, useStats, useUsers } from "@/hooks";
import { formatNumber } from "@/lib/format";
import type { DashboardChannelDetail, DashboardUserDetail } from "@/lib/types";

type View = "stats" | "users" | "channels" | "user-detail" | "channel-detail";

export default function DashboardPage() {
  const [view, setView] = useState<View>("stats");
  const [guildId, setGuildId] = useState("");
  const [activeUser, setActiveUser] = useState<DashboardUserDetail | null>(
    null,
  );
  const [activeChannel, setActiveChannel] =
    useState<DashboardChannelDetail | null>(null);

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
            <BarChart3 className="size-4" />
            Stats
          </TabsTrigger>
          <TabsTrigger value="users" onClick={() => setView("users")}>
            <Users className="size-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="channels" onClick={() => setView("channels")}>
            <Hash className="size-4" />
            Channels
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "stats" && <StatsSection />}
      {view === "users" && (
        <UsersSection
          onSelect={async (userId) => {
            try {
              const { dashboardApi } = await import("@/lib/api");
              const detail = await dashboardApi.getUserDetail(userId);
              setActiveUser(detail);
              setView("user-detail");
            } catch (err) {
              console.error("dashboard/userDetail:", err);
            }
          }}
        />
      )}
      {view === "channels" && (
        <ChannelsSection
          guildId={guildId}
          onSelect={async (chId) => {
            try {
              const { dashboardApi } = await import("@/lib/api");
              const detail = await dashboardApi.getChannelDetail(chId);
              setActiveChannel(detail);
              setView("channel-detail");
            } catch (err) {
              console.error("dashboard/channelDetail:", err);
            }
          }}
        />
      )}
      {view === "user-detail" && activeUser && (
        <UserDetailView user={activeUser} onBack={() => setView("users")} />
      )}
      {view === "channel-detail" && activeChannel && (
        <ChannelDetailView
          channel={activeChannel}
          onBack={() => setView("channels")}
        />
      )}
    </div>
  );
}

// ── Stats Section ───────────────────────────────

function StatsSection() {
  const { stats, loading, error, refetch } = useStats();

  if (error) return <ErrorState message={error} onRetry={refetch} />;

  if (loading || !stats) {
    return (
      <div className="space-y-5 animate-fade-in-up">
        <LoadingSkeleton count={8} height="h-28" columns={4} />
      </div>
    );
  }

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
              <Hash className="size-4 text-muted-foreground" />
              Top Channels
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
              <Shield className="size-4 text-muted-foreground" />
              Moderation Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <QueueStat
                label="Pending"
                value={stats.moderation_overview.pending}
              />
              <QueueStat
                label="Processing"
                value={stats.moderation_overview.processing}
                variant="warning"
              />
              <QueueStat
                label="Errors"
                value={stats.moderation_overview.error}
                variant="danger"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QueueStat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "default" | "warning" | "danger";
}) {
  return (
    <div
      className={`rounded-lg p-3 text-center space-y-1.5 ${
        variant === "danger"
          ? "bg-destructive/10"
          : variant === "warning"
            ? "bg-yellow-500/10"
            : "bg-muted/50"
      }`}
    >
      <div
        className={`text-2xl font-bold tabular-nums ${
          variant === "danger"
            ? "text-destructive"
            : variant === "warning"
              ? "text-yellow-500"
              : ""
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ── Users Section ───────────────────────────────

function UsersSection({ onSelect }: { onSelect: (id: string) => void }) {
  const { users, loading, search, setSearch, refetch } = useUsers();

  useEffect(() => {
    const timer = setTimeout(refetch, 300);
    return () => clearTimeout(timer);
  }, [refetch]);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {loading ? (
        <LoadingSkeleton count={6} height="h-20" columns={2} />
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users found." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users.map((user) => (
            <Card
              key={user.user_id}
              className="cursor-pointer hover:bg-accent/5 transition-colors"
              onClick={() => onSelect(user.user_id)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 shrink-0 rounded-full bg-muted flex items-center justify-center text-sm font-medium overflow-hidden ring-1 ring-border">
                    {user.avatar_url ? (
                      <Image
                        src={user.avatar_url}
                        alt=""
                        width={40}
                        height={40}
                        className="size-full object-cover"
                      />
                    ) : (
                      (user.username ?? "?").charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.username ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{user.total_messages} messages</span>
                      {user.flagged_count > 0 && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] px-1.5 py-0 h-4"
                        >
                          {user.flagged_count} flagged
                        </Badge>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Channels Section ────────────────────────────

function ChannelsSection({
  guildId,
  onSelect,
}: {
  guildId: string;
  onSelect: (id: string) => void;
}) {
  const { channels, loading, search, setSearch, refetch } =
    useChannels(guildId);

  useEffect(() => {
    const timer = setTimeout(refetch, 300);
    return () => clearTimeout(timer);
  }, [refetch]);

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

      {loading ? (
        <LoadingSkeleton count={6} height="h-20" />
      ) : channels.length === 0 ? (
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
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{ch.total_messages} messages</span>
                      {ch.flagged_count > 0 && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] px-1.5 py-0 h-4"
                        >
                          {ch.flagged_count} flagged
                        </Badge>
                      )}
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

// ── User Detail View ────────────────────────────

function UserDetailView({
  user,
  onBack,
}: {
  user: DashboardUserDetail;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5 animate-fade-in-up">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4 mr-1" />
        Back
      </Button>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="size-14 shrink-0 rounded-full bg-muted flex items-center justify-center text-xl font-medium overflow-hidden ring-2 ring-border">
              {user.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt=""
                  width={56}
                  height={56}
                  className="size-full object-cover"
                />
              ) : (
                (user.username ?? "?").charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">
                {user.username ?? "Unknown"}
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                {user.user_id}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailStat label="Messages" value={user.total_messages} />
            <DetailStat
              label="Flagged"
              value={user.flagged_count}
              variant="danger"
            />
            <DetailStat
              label="Clean Streak"
              value={user.clean_message_streak ?? 0}
            />
            <DetailStat
              label="Trust Score"
              value={user.trust_score ?? 0}
              suffix="%"
            />
          </div>

          {user.profile_summary && (
            <div className="rounded-lg bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="size-4 text-primary" />
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  AI Profile
                </p>
              </div>
              <p className="text-sm leading-relaxed">{user.profile_summary}</p>
            </div>
          )}

          {user.recent_messages.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                Recent Messages
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {user.recent_messages.slice(0, 5).map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm"
                  >
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                      <Clock className="size-3" />
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
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

// ── Channel Detail View ─────────────────────────

function ChannelDetailView({
  channel,
  onBack,
}: {
  channel: DashboardChannelDetail;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5 animate-fade-in-up">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4 mr-1" />
        Back
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
                <Clock className="size-4 text-muted-foreground" />
                Recent Messages
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
