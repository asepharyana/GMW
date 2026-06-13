import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Hash, RefreshCw } from "lucide-react";
import type { DashboardChannelDetail } from "../../../shared/api/client";
import { cardItem, cardStagger } from "../../../shared/hooks/useFramerStagger";
import { cn } from "../../../shared/lib/utils";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "../../../shared/ui";

interface ChannelProfileDetailProps {
  detail: DashboardChannelDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onRefetch: () => void;
}

export function ChannelProfileDetail({
  detail,
  loading,
  error,
  onBack,
  onRefetch,
}: ChannelProfileDetailProps) {
  return (
    <motion.div
      className="grid gap-6"
      variants={cardStagger}
      initial="initial"
      animate="animate"
    >
      {/* Back button */}
      <motion.div variants={cardItem}>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to channels
        </button>
      </motion.div>

      {/* Loading */}
      {loading && <DetailSkeleton />}

      {/* Error */}
      {error && (
        <motion.div
          variants={cardItem}
          className="flex flex-col items-center gap-4 py-20 text-muted-foreground"
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

      {detail && !error && (
        <>
          {/* Channel header */}
          <motion.div variants={cardItem}>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-border">
                    <Hash className="h-8 w-8 text-muted-foreground" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold">
                      #{detail.channel_name ?? detail.channel_id}
                    </h2>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {detail.channel_id}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {detail.flagged_count > 0 && (
                        <Badge variant="destructive">
                          {detail.flagged_count} flagged
                        </Badge>
                      )}
                      {detail.culture_summary && (
                        <Badge variant="default">AI Profile</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Culture summary */}
                {detail.culture_summary && (
                  <div className="mt-4 rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      AI Channel Summary
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {detail.culture_summary}
                    </p>
                    {detail.last_analyzed_at && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Last analyzed:{" "}
                        {new Date(detail.last_analyzed_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Stats grid */}
          <motion.div variants={cardItem} className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">
                  {detail.total_messages.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total Messages
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">
                  {detail.clean_count.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Clean</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p
                  className={cn(
                    "text-2xl font-bold",
                    detail.flagged_count > 0
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {detail.flagged_count.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Flagged</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent messages */}
          <motion.div variants={cardItem}>
            <Card>
              <CardHeader>
                <CardTitle className="text-primary">Recent Messages</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.recent_messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No messages found.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {detail.recent_messages.map((msg) => (
                      <div
                        key={msg.id}
                        className="rounded-lg border border-border p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 flex-1 break-words text-xs text-foreground">
                            {msg.content}
                          </p>
                          {msg.ai_status && (
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                                msg.ai_status === "flagged"
                                  ? "bg-red-100 text-red-700"
                                  : msg.ai_status === "clean"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : msg.ai_status === "warn"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-muted text-muted-foreground",
                              )}
                            >
                              {msg.ai_status}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {msg.username ?? "unknown"} ·{" "}
                          {new Date(msg.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-60" />
              <div className="flex gap-2 mt-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </div>
          </div>
          <Skeleton className="mt-4 h-20 w-full rounded-lg" />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 text-center space-y-1">
              <Skeleton className="mx-auto h-7 w-16" />
              <Skeleton className="mx-auto h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
