import { motion } from "framer-motion";
import { AlertCircle, Hash, Loader2, RefreshCw, Search } from "lucide-react";
import type { DashboardChannel } from "../../../shared/api/client";
import { cardItem, cardStagger } from "../../../shared/hooks/useFramerStagger";
import { cn } from "../../../shared/lib/utils";
import { Card, CardContent, Input, Skeleton } from "../../../shared/ui";

interface ChannelSummaryListProps {
  channels: DashboardChannel[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  onRefetch: () => void;
  onSelectChannel: (channelId: string) => void;
}

export function ChannelSummaryList({
  channels,
  loading,
  error,
  search,
  onSearchChange,
  onLoadMore,
  hasMore,
  onRefetch,
  onSelectChannel,
}: ChannelSummaryListProps) {
  return (
    <motion.div
      className="grid gap-6"
      variants={cardStagger}
      initial="initial"
      animate="animate"
    >
      {/* Search bar */}
      <motion.div variants={cardItem} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input
            className="pl-9 rounded-full focus-visible:ring-primary"
            placeholder="Search by channel name or ID..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Error state */}
      {error && (
        <motion.div
          variants={cardItem}
          className="flex flex-col items-center gap-4 py-10 text-muted-foreground"
        >
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm">{error}</p>
          <button
            onClick={onRefetch}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </motion.div>
      )}

      {/* Loading state */}
      {loading && channels.length === 0 && !error && <ChannelListSkeleton />}

      {/* Empty state */}
      {!loading && !error && channels.length === 0 && (
        <motion.div
          variants={cardItem}
          className="flex flex-col items-center gap-4 py-20 text-muted-foreground"
        >
          <Hash className="h-10 w-10" />
          <p className="text-sm">No channels found.</p>
        </motion.div>
      )}

      {/* Channel cards */}
      {channels.length > 0 && (
        <motion.div variants={cardItem} className="grid gap-3 sm:grid-cols-2">
          {channels.map((ch) => (
            <button
              key={ch.channel_id}
              onClick={() => onSelectChannel(ch.channel_id)}
              className="group w-full text-left"
            >
              <Card className="transition-all hover:ring-1 hover:ring-primary/30 cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Hash className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          #{ch.channel_name ?? ch.channel_id}
                        </span>
                        {ch.flagged_count > 0 && (
                          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                            {ch.flagged_count} flagged
                          </span>
                        )}
                      </div>

                      {ch.culture_summary && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {ch.culture_summary}
                        </p>
                      )}

                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{ch.total_messages} messages</span>
                        {ch.last_message_at && (
                          <span>
                            Last{" "}
                            {new Date(ch.last_message_at).toLocaleDateString()}
                          </span>
                        )}
                        {ch.culture_summary && (
                          <span className="text-emerald-600">AI Summary</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </motion.div>
      )}

      {/* Load more */}
      {hasMore && (
        <motion.div variants={cardItem} className="flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Loading..." : "Load More"}
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

function ChannelListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
