import { ArrowLeft, RefreshCw } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Card, CardContent } from "./card";
import { Skeleton } from "./skeleton";
import { StatusBadge, type StatusType } from "./status-badge";

export interface ProfileDetailStats {
  totalLabel: string;
  totalValue: number;
  cleanLabel: string;
  cleanValue: number;
  flaggedLabel: string;
  flaggedValue: number;
}

export interface ProfileDetailMessage {
  id: string;
  content: string | null;
  created_at: string | null;
  ai_status: string | null;
}

interface ProfileDetailProps {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  summaryLabel: string;
  summaryText?: string;
  lastAnalyzedLabel?: string;
  stats: ProfileDetailStats;
  messages: ProfileDetailMessage[];
  messagesTitle?: string;
  messagesEmptyText?: string;
  className?: string;
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-24" />
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-8 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ProfileDetail({
  loading,
  error,
  onRetry,
  onBack,
  icon,
  title,
  subtitle,
  summaryLabel,
  summaryText,
  lastAnalyzedLabel,
  stats,
  messages,
  messagesTitle = "Recent Messages",
  messagesEmptyText = "No messages found",
  className,
}: ProfileDetailProps) {
  if (loading) return <DetailSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
        <p className="text-sm">{error}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {icon}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold truncate">{title}</h2>
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {summaryLabel}: {summaryText ?? "N/A"}
              </p>
              {lastAnalyzedLabel && (
                <p className="text-xs text-muted-foreground">
                  {lastAnalyzedLabel}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {stats.totalLabel}
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {stats.totalValue}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {stats.cleanLabel}
            </p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600">
              {stats.cleanValue}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {stats.flaggedLabel}
            </p>
            <p className="text-2xl font-bold tabular-nums text-red-600">
              {stats.flaggedValue}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Messages */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          {messagesTitle}
        </h3>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {messagesEmptyText}
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <Card key={msg.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm line-clamp-2 flex-1">
                      {msg.content ?? "(no content)"}
                    </p>
                    <StatusBadge status={msg.ai_status} />
                  </div>
                  {msg.created_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
