"use client";

import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Hash,
  RefreshCw,
  Search,
  Shield,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { dashboardApi } from "@/lib/api";
import type {
  DashboardChannel,
  DashboardChannelDetail,
  DashboardStats,
  DashboardUser,
  DashboardUserDetail,
} from "@/lib/types";

type View = "stats" | "users" | "channels" | "user-detail" | "channel-detail";

export function DashboardPanel() {
  const [view, setView] = useState<View>("stats");
  const [activeUser, setActiveUser] = useState<DashboardUserDetail | null>(
    null,
  );
  const [activeChannel, setActiveChannel] =
    useState<DashboardChannelDetail | null>(null);

  const renderView = () => {
    switch (view) {
      case "stats":
        return <StatsView onNavigate={(v) => setView(v)} />;
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
          <ChannelsView onSelectChannel={() => {}} />
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex gap-1 rounded-lg border p-1 w-fit">
        <button
          onClick={() => setView("stats")}
          data-active={view === "stats" ? "" : undefined}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors data-[active]:bg-primary data-[active]:text-primary-foreground hover:bg-muted"
        >
          <BarChart3 className="size-4 inline mr-1.5" />
          Stats
        </button>
        <button
          onClick={() => setView("users")}
          data-active={
            view === "users" || view === "user-detail" ? "" : undefined
          }
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors data-[active]:bg-primary data-[active]:text-primary-foreground hover:bg-muted"
        >
          <Users className="size-4 inline mr-1.5" />
          Users
        </button>
        <button
          onClick={() => setView("channels")}
          data-active={
            view === "channels" || view === "channel-detail" ? "" : undefined
          }
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors data-[active]:bg-primary data-[active]:text-primary-foreground hover:bg-muted"
        >
          <Hash className="size-4 inline mr-1.5" />
          Channels
        </button>
      </div>

      {renderView()}
    </div>
  );
}

// ── Stats View ────────────────────────────────────────────

function StatsView({ onNavigate }: { onNavigate: (view: View) => void }) {
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
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="size-8 text-destructive mb-2" />
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button
          onClick={fetchStats}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <RefreshCw className="size-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-2">
              <div className="h-3 w-16 bg-muted rounded animate-pulse" />
              <div className="h-8 w-20 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Messages" value={stats.total_messages} />
            <MetricCard label="Today" value={stats.today_messages} />
            <MetricCard label="Users" value={stats.total_users} />
            <MetricCard label="Active 24h" value={stats.active_users_24h} />
            <MetricCard
              label="Flagged"
              value={stats.total_flagged}
              variant="destructive"
            />
            <MetricCard
              label="Clean"
              value={stats.total_clean}
              variant="success"
            />
            <MetricCard
              label="Voice Recordings"
              value={stats.total_voice_recordings}
            />
            <MetricCard label="AI Profiles" value={stats.total_profiles} />
          </div>

          {/* Top Channels + Moderation Queue */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Hash className="size-4 text-muted-foreground" />
                Top Channels
              </h3>
              {stats.top_channels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No channel data yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {stats.top_channels.map((ch) => (
                    <div
                      key={ch.channel_id}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm truncate">
                        #{ch.channel_name ?? ch.channel_id.slice(0, 8)}
                      </span>
                      <span className="text-sm font-semibold">
                        {formatNumber(ch.message_count)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="size-4 text-muted-foreground" />
                Moderation Queue
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted p-3 text-center space-y-1">
                  <div className="text-2xl font-semibold">
                    {stats.moderation_overview.pending}
                  </div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </div>
                <div className="rounded-lg bg-yellow-500/10 p-3 text-center space-y-1">
                  <div className="text-2xl font-semibold text-yellow-600 dark:text-yellow-400">
                    {stats.moderation_overview.processing}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Processing
                  </div>
                </div>
                <div className="rounded-lg bg-destructive/10 p-3 text-center space-y-1">
                  <div className="text-2xl font-semibold text-destructive">
                    {stats.moderation_overview.error}
                  </div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "default" | "destructive" | "success";
}) {
  const colorMap = {
    default: "",
    destructive: "text-destructive",
    success: "text-green-600 dark:text-green-400",
  };

  return (
    <div className="rounded-lg border p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${colorMap[variant ?? "default"]}`}>
        {formatNumber(value)}
      </p>
    </div>
  );
}

// ── Users View ────────────────────────────────────────────

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
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 rounded-lg border border-input bg-background pl-9 pr-3 text-sm"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users.map((user) => (
            <button
              key={user.user_id}
              onClick={() => onSelectUser(user.user_id)}
              className="rounded-lg border p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 shrink-0 rounded-full bg-muted flex items-center justify-center text-sm font-medium overflow-hidden">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
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
                  <p className="text-xs text-muted-foreground">
                    {user.total_messages} msgs
                    {user.flagged_count > 0 && (
                      <span className="text-destructive ml-2">
                        {user.flagged_count} flagged
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Channels View ─────────────────────────────────────────

function ChannelsView({
  onSelectChannel,
}: {
  onSelectChannel: (channelId: string) => void;
}) {
  const [channels, setChannels] = useState<DashboardChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchChannels = useCallback(async (searchQuery?: string) => {
    setLoading(true);
    try {
      const result = await dashboardApi.listChannels(20, searchQuery);
      setChannels(result.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

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
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search channels…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 rounded-lg border border-input bg-background pl-9 pr-3 text-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-2">
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              <div className="h-3 w-24 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((ch) => (
            <button
              key={ch.channel_id}
              onClick={() => onSelectChannel(ch.channel_id)}
              className="w-full rounded-lg border p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    #{ch.channel_name ?? ch.channel_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ch.total_messages} messages
                    {ch.flagged_count > 0 && (
                      <span className="text-destructive ml-2">
                        {ch.flagged_count} flagged
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </div>
              {ch.culture_summary && (
                <p className="text-xs text-muted-foreground mt-2 italic line-clamp-2">
                  {ch.culture_summary}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── User Detail View ──────────────────────────────────────

function UserDetailView({
  user,
  onBack,
}: {
  user: DashboardUserDetail;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to users
      </button>

      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center text-xl font-medium overflow-hidden">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              (user.username ?? "?").charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h2 className="text-xl font-semibold">
              {user.username ?? "Unknown"}
            </h2>
            <p className="text-sm text-muted-foreground">#{user.user_id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DetailStat label="Messages" value={user.total_messages} />
          <DetailStat
            label="Flagged"
            value={user.flagged_count}
            variant="destructive"
          />
          <DetailStat label="Clean Streak" value={user.clean_message_streak} />
          <DetailStat
            label="Trust Score"
            value={user.trust_score ?? 0}
            suffix="%"
          />
        </div>

        {user.profile_summary && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">AI Profile</p>
            <p className="text-sm">{user.profile_summary}</p>
          </div>
        )}

        {/* Recent messages */}
        {user.recent_messages.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Recent Messages</h3>
            {user.recent_messages.slice(0, 5).map((msg) => (
              <div key={msg.id} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">
                  {new Date(msg.created_at).toLocaleString()}
                </p>
                <p className="text-sm">{msg.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Channel Detail View ───────────────────────────────────

function ChannelDetailView({
  channel,
  onBack,
}: {
  channel: DashboardChannelDetail;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to channels
      </button>

      <div className="rounded-lg border p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">
            #{channel.channel_name ?? channel.channel_id.slice(0, 8)}
          </h2>
          <p className="text-sm text-muted-foreground">{channel.channel_id}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DetailStat label="Messages" value={channel.total_messages} />
          <DetailStat
            label="Flagged"
            value={channel.flagged_count}
            variant="destructive"
          />
          <DetailStat
            label="Clean"
            value={channel.clean_count}
            variant="success"
          />
        </div>

        {channel.culture_summary && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">
              Channel Culture
            </p>
            <p className="text-sm">{channel.culture_summary}</p>
          </div>
        )}

        {channel.recent_messages.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Recent Messages</h3>
            {channel.recent_messages.slice(0, 5).map((msg) => (
              <div key={msg.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{msg.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{msg.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────

function DetailStat({
  label,
  value,
  variant,
  suffix,
}: {
  label: string;
  value: number;
  variant?: "default" | "destructive" | "success";
  suffix?: string;
}) {
  const colorMap = {
    default: "",
    destructive: "text-destructive",
    success: "text-green-600 dark:text-green-400",
  };

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${colorMap[variant ?? "default"]}`}>
        {formatNumber(value)}
        {suffix}
      </p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString();
}
