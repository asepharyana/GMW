// ─── MessageFeed.tsx — Standalone message feed island ─────────────────────────
// Self-contained message list with WebSocket bridging, infinite scroll,
// loading/empty/error states, and re-analyze per message.
// ──────────────────────────────────────────────────────────────────────────────

import type { MessageRecord } from "@bete/shared";
import { AlertCircle, RefreshCw, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getAppConfig } from "../shared/api/client.js";
import { Badge, Button, Skeleton } from "../shared/components/index.js";
import { useMessages } from "../shared/hooks/useMessages.js";
import { useDashboardSocket } from "../shared/ws/socket.js";
import { useMessageStore } from "../stores/message-store.js";

interface MessageFeedProps {
  /** Guild to fetch messages for. If omitted, the list stays empty. */
  guildId?: string;
}

// ─── Severity badge colouring ─────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical:
    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  high: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  medium:
    "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
  low: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
};

function severityColor(severity: string): string {
  return (
    SEVERITY_COLORS[severity] ?? "bg-muted text-muted-foreground border-border"
  );
}

// ─── Single message card ──────────────────────────────────────────────────────

function MessageCard({
  message,
  onReanalyze,
}: {
  message: MessageRecord;
  onReanalyze: (id: string) => Promise<void>;
}) {
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const isDeleted = !!message.deleted_at;

  const handleReanalyze = async () => {
    setIsReanalyzing(true);
    try {
      await onReanalyze(message.id);
    } finally {
      setIsReanalyzing(false);
    }
  };

  return (
    <article
      className={`group rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md ${
        isDeleted
          ? "border-red-200 dark:border-red-900/50 opacity-50"
          : "border-border"
      }`}
    >
      <div className="flex gap-3">
        {/* Avatar */}
        <img
          src={
            message.avatar_url ??
            "https://cdn.discordapp.com/embed/avatars/0.png"
          }
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-primary/30"
          onError={(e) => {
            e.currentTarget.src =
              "https://cdn.discordapp.com/embed/avatars/0.png";
          }}
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Row: username + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm text-foreground">
              {message.username || message.user_id}
            </span>

            {message.ai_severity && message.ai_severity !== "none" && (
              <Badge
                className={`text-[10px] px-1.5 py-0 ${severityColor(message.ai_severity)}`}
              >
                {message.ai_severity}
              </Badge>
            )}

            {isDeleted && (
              <span className="text-[11px] text-destructive/70">deleted</span>
            )}

            <span
              className="ml-auto text-[11px] text-muted-foreground/60"
              title={new Date(message.created_at).toLocaleString()}
            >
              {formatTimeAgo(message.created_at)}
            </span>
          </div>

          {/* Content */}
          <p
            className={`whitespace-pre-wrap break-words text-sm leading-6 ${
              isDeleted ? "text-muted-foreground/60" : "text-foreground/90"
            }`}
          >
            {message.content}
          </p>

          {/* Re-analyze button */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant={
                message.ai_status === "error" ? "destructive" : "outline"
              }
              onClick={handleReanalyze}
              disabled={isReanalyzing || message.ai_status === "pending"}
              className="text-[11px] h-7 px-2.5"
            >
              <RotateCw
                className={`h-3 w-3 mr-1 ${isReanalyzing ? "animate-spin" : ""}`}
              />
              {isReanalyzing ? "Reanalyzing..." : "Re-analyze"}
            </Button>
            {message.ai_status === "error" && (
              <span className="text-[11px] text-pink-600/70 dark:text-pink-400/70">
                Click to retry
              </span>
            )}
          </div>

          {/* AI analysis summary */}
          {message.ai_analysis && (
            <div
              className={`mt-2 rounded-lg border-l-[3px] px-3 py-2 ${
                message.ai_status === "flagged"
                  ? "border-l-pink-400 dark:border-l-pink-600 bg-pink-50/40 dark:bg-pink-950/30"
                  : "border-l-emerald-400 dark:border-l-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30"
              }`}
            >
              <p className="text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {message.ai_analysis}
              </p>
            </div>
          )}

          {/* AI error */}
          {message.ai_error && (
            <div className="mt-2 rounded-lg bg-pink-50/40 dark:bg-pink-950/30 px-3 py-2 text-[12px] text-pink-600 dark:text-pink-400">
              AI error: {message.ai_error}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Skeleton placeholder ─────────────────────────────────────────────────────

function MessageSkeleton() {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </article>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <p className="text-muted-foreground font-medium">No messages captured</p>
      <p className="text-sm text-muted-foreground/60">
        Messages will appear here once they are captured from the monitored
        guild.
      </p>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <p className="text-destructive font-medium">Failed to load messages</p>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        {message}
      </p>
      <Button onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Retry
      </Button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MessageFeed({
  guildId: propGuildId,
}: MessageFeedProps) {
  const {
    messages,
    loading,
    loadingMore,
    error,
    fetchMessages,
    loadMore,
    reanalyze,
    hasMore,
  } = useMessages();
  const { prependMessage, updateMessage } = useMessageStore();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const [resolvedGuildId, setResolvedGuildId] = useState<string | undefined>(
    propGuildId,
  );

  // ── Resolve guildId from app config when not provided as prop ────────────
  useEffect(() => {
    if (propGuildId) {
      setResolvedGuildId(propGuildId);
      return;
    }
    getAppConfig()
      .then((config) => {
        if (config.monitorGuildId) setResolvedGuildId(config.monitorGuildId);
      })
      .catch(() => {
        // config unavailable — messages will stay empty until guildId is set
      });
  }, [propGuildId]);

  // ── WebSocket bridge ──────────────────────────────────────────────────────
  // Forward real-time Discord events into the zustand store so the message list
  // updates without refetching the entire page.
  useDashboardSocket({
    onMessageCreated: (data) => prependMessage(data),
    onMessageUpdated: (data) => updateMessage(data.id, data),
    onMessageDeleted: (data) =>
      updateMessage(data.id, {
        type: "deleted" as const,
        deleted_at: data.deleted_at,
      }),
    onMessageAnalyzed: (data) => updateMessage(data.id, data),
  });

  // ── Initial fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (resolvedGuildId && !initialFetchDone) {
      setInitialFetchDone(true);
      fetchMessages(resolvedGuildId).catch(() => {
        // error is captured by the hook's state
      });
    }
  }, [resolvedGuildId, initialFetchDone, fetchMessages]);

  // ── Infinite scroll via IntersectionObserver ──────────────────────────────
  useEffect(() => {
    if (!loadMore || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading && messages.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <MessageSkeleton key={i} />
        ))}
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error && messages.length === 0) {
    return (
      <ErrorState
        message={error}
        onRetry={() => resolvedGuildId && fetchMessages(resolvedGuildId)}
      />
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!loading && messages.length === 0) {
    return <EmptyState />;
  }

  // ── Success — message list with infinite scroll ───────────────────────────
  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <MessageCard key={msg.id} message={msg} onReanalyze={reanalyze} />
      ))}

      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center py-4"
        >
          {loadingMore ? (
            <MessageSkeleton />
          ) : (
            <div className="h-2 w-2 rounded-full bg-primary/40" />
          )}
        </div>
      )}
    </div>
  );
}
