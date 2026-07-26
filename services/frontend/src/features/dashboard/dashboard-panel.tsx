"use client";

import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Clock,
  Hash,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dashboardApi } from "@/lib/api";
import type {
  DashboardChannel,
  DashboardChannelDetail,
  DashboardStats,
  DashboardUser,
  DashboardUserDetail,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type View = "stats" | "users" | "channels" | "user-detail" | "channel-detail";

export function DashboardPanel({ guildId }: { guildId: string }) {
  const [view, setView] = useState<View>("stats");
  const [activeUser, setActiveUser] = useState<DashboardUserDetail | null>(
    null,
  );
  const [activeChannel, setActiveChannel] =
    useState<DashboardChannelDetail | null>(null);

  const renderView = () => {
    switch (view) {
      case "stats":
        return <StatsView />;
      case "users":
        return (
          <UsersView
            onSelectUser={async (userId) => {
              try {
                const detail = await dashboardApi.getUserDetail(userId);
                setActiveUser(detail);
                setView("user-detail");
              } catch {
                // ignore
              }
            }}
          />
        );
      case "channels":
        return (
          <ChannelsView
            guildId={guildId}
            onSelectChannel={async (channelId) => {
              try {
                const detail = await dashboardApi.getChannelDetail(channelId);
                setActiveChannel(detail);
                setView("channel-detail");
              } catch {
                // ignore
              }
            }}
          />
        );
      case "user-detail":
        return activeUser ? (
          <UserDetailView user={activeUser} onBack={() => setView("users")} />
        ) : (
          <UsersView onSelectUser={() => {}} />
        );
      case "channel-detail":
        return activeChannel ? (
          <ChannelDetailView
            channel={activeChannel}
            onBack={() => setView("channels")}
          />
        ) : (
          <ChannelsView guildId={guildId} onSelectChannel={() => {}} />
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation using shadcn Tabs */}
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

      {renderView()}
    </div>
  );
}

// ── Stats View ──────────────────────────────────

function StatsView() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dashboardApi.getStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-3" />
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">{error}</p>
        <Button variant="outline" onClick={fetchStats}>
          <RefreshCw className="size-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Metric cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <>
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
              variant="danger"
              icon={AlertCircle}
            />
            <StatCard
              label="Clean"
              value={stats.total_clean}
              variant="success"
              icon={Shield}
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

          {/* Top Channels + Moderation Queue */}
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
                    {stats.top_channels.map((ch, i) => {
                      const maxCount = stats.top_channels[0].message_count;
                      const pct =
                        maxCount > 0 ? (ch.message_count / maxCount) * 100 : 0;
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
                  <div className="rounded-lg bg-muted/50 p-3 text-center space-y-1.5">
                    <div className="text-2xl font-bold tabular-nums">
                      {stats.moderation_overview.pending}
                    </div>
                    <div className="text-xs text-muted-foreground">Pending</div>
                  </div>
                  <div className="rounded-lg bg-yellow-500/10 p-3 text-center space-y-1.5">
                    <div className="text-2xl font-bold tabular-nums text-yellow-500">
                      {stats.moderation_overview.processing}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Processing
                    </div>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-3 text-center space-y-1.5">
                    <div className="text-2xl font-bold tabular-nums text-destructive">
                      {stats.moderation_overview.error}
                    </div>
                    <div className="text-xs text-muted-foreground">Errors</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  variant,
  icon: Icon,
}: {
  label: string;
  value: number;
  variant?: "default" | "danger" | "success";
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums tracking-tight",
                variant === "danger" && "text-destructive",
                variant === "success" && "text-green-500",
              )}
            >
              {formatNumber(value)}
            </p>
          </div>
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              variant === "danger"
                ? "bg-destructive/10 text-destructive"
                : variant === "success"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-primary/10 text-primary",
            )}
          >
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Users View ──────────────────────────────────

function UsersView({
  onSelectUser,
}: {
  onSelectUser: (userId: string) => void;
}) {
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [_cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async (searchQuery?: string) => {
    setLoading(true);
    try {
      const result = await dashboardApi.listUsers(20, undefined, searchQuery);
      setUsers(result.data);
      setCursor(result.nextCursor);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search) fetchUsers(search);
      else fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchUsers]);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
              <Users className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No users found.</p>
            </div>
          ) : (
            users.map((user) => (
              <Card
                key={user.user_id}
                className="cursor-pointer hover:bg-accent/5 transition-colors"
                onClick={() => onSelectUser(user.user_id)}
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
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Channels View ───────────────────────────────

function ChannelsView({
  onSelectChannel,
  guildId,
}: {
  onSelectChannel: (channelId: string) => void;
  guildId: string;
}) {
  const [channels, setChannels] = useState<DashboardChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchChannels = useCallback(
    async (searchQuery?: string) => {
      setLoading(true);
      try {
        const result = await dashboardApi.listChannels(
          20,
          searchQuery,
          guildId || undefined,
        );
        setChannels(result.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [guildId],
  );

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search) fetchChannels(search);
      else fetchChannels();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchChannels]);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search channels…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {channels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Hash className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                No channels found.
              </p>
            </div>
          ) : (
            channels.map((ch) => (
              <Card
                key={ch.channel_id}
                className="cursor-pointer hover:bg-accent/5 transition-colors"
                onClick={() => onSelectChannel(ch.channel_id)}
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
                      "{ch.culture_summary}"
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
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
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" />
          Back
        </Button>
      </div>

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
              <p className="text-sm text-muted-foreground font-mono text-xs">
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
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" />
          Back
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Hash className="size-5 text-muted-foreground" />
              {channel.channel_name ?? channel.channel_id.slice(0, 8)}
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
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
                "{channel.culture_summary}"
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

// ── Shared Components ───────────────────────────

function DetailStat({
  label,
  value,
  variant,
  suffix,
}: {
  label: string;
  value: number;
  variant?: "default" | "danger" | "success";
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-lg font-bold tabular-nums",
            variant === "danger" && "text-destructive",
            variant === "success" && "text-green-500",
          )}
        >
          {formatNumber(value)}
          {suffix}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Helpers ─────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString();
}
