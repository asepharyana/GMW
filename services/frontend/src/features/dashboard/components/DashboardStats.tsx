import { motion } from "framer-motion";
import {
  AlertCircle,
  BarChart3,
  MessageSquare,
  Mic,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { cardItem, cardStagger } from "../../../shared/hooks/useFramerStagger";
import { cn } from "../../../shared/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "../../../shared/ui";
import { useDashboardStats } from "../hooks/useDashboard";

export function DashboardStatsContent() {
  const { stats, loading, error, refetch } = useDashboardStats();

  if (loading) {
    return <StatsSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm">{error}</p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
        <BarChart3 className="h-10 w-10" />
        <p className="text-sm">No data available yet.</p>
      </div>
    );
  }

  const cards = [
    {
      title: "Total Messages",
      value: stats.total_messages.toLocaleString(),
      icon: MessageSquare,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "Today's Messages",
      value: stats.today_messages.toLocaleString(),
      icon: MessageSquare,
      color: "text-emerald-500",
      bg: "bg-emerald-100",
    },
    {
      title: "Total Users",
      value: stats.total_users.toLocaleString(),
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-100",
    },
    {
      title: "Active Users (24h)",
      value: stats.active_users_24h.toLocaleString(),
      icon: UserCheck,
      color: "text-violet-500",
      bg: "bg-violet-100",
    },
    {
      title: "Flagged",
      value: stats.total_flagged.toLocaleString(),
      icon: ShieldAlert,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      title: "Clean",
      value: stats.total_clean.toLocaleString(),
      icon: ShieldAlert,
      color: "text-emerald-600",
      bg: "bg-emerald-100",
    },
    {
      title: "Voice Recordings",
      value: stats.total_voice_recordings.toLocaleString(),
      icon: Mic,
      color: "text-cyan-500",
      bg: "bg-cyan-100",
    },
    {
      title: "AI Profiles",
      value: stats.total_profiles.toLocaleString(),
      icon: Users,
      color: "text-amber-500",
      bg: "bg-amber-100",
    },
  ];

  return (
    <motion.div
      className="grid gap-6"
      variants={cardStagger}
      initial="initial"
      animate="animate"
    >
      {/* Summary cards grid */}
      <motion.div
        variants={cardItem}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {cards.map((card) => (
          <Card key={card.title} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold tracking-tight">
                    {card.value}
                  </p>
                </div>
                <div className={cn("rounded-xl p-2.5", card.bg)}>
                  <card.icon className={cn("h-5 w-5", card.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Top channels */}
      <motion.div variants={cardItem}>
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Top Channels</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.top_channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No channel data yet.
              </p>
            ) : (
              <div className="space-y-2">
                {stats.top_channels.map((ch, i) => (
                  <div
                    key={ch.channel_id}
                    className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
                  >
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      #{ch.channel_id}
                    </span>
                    <span className="ml-2 shrink-0 font-medium">
                      {ch.message_count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Moderation overview */}
      <motion.div variants={cardItem}>
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Moderation Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-muted-foreground">
                  {stats.moderation_overview.pending}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Pending</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-amber-500">
                  {stats.moderation_overview.processing}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Processing</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-destructive">
                  {stats.moderation_overview.error}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Errors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
