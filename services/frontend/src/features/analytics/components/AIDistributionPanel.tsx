import type { AIStats } from "../../../shared/api/client";
import { cn } from "../../../shared/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui";

interface AIDistributionPanelProps {
  stats: AIStats | null;
  loading: boolean;
}

const SEVERITY_LABELS: Record<
  string,
  { label: string; color: string; bar: string }
> = {
  critical: {
    label: "Critical",
    color: "text-accent",
    bar: "bg-gradient-to-r from-accent to-red-400",
  },
  high: {
    label: "High",
    color: "text-red-500",
    bar: "bg-gradient-to-r from-red-400 to-red-300",
  },
  medium: {
    label: "Medium",
    color: "text-orange-500",
    bar: "bg-gradient-to-r from-orange-400 to-yellow-300",
  },
  low: {
    label: "Low",
    color: "text-yellow-600",
    bar: "bg-gradient-to-r from-yellow-300 to-primary/60",
  },
  none: {
    label: "None",
    color: "text-muted-foreground",
    bar: "bg-sky-200/50",
  },
};

const ACTION_LABELS: Record<
  string,
  { label: string; color: string; bar: string }
> = {
  escalate: {
    label: "Escalate",
    color: "text-accent",
    bar: "bg-gradient-to-r from-accent to-red-400",
  },
  delete: {
    label: "Delete",
    color: "text-red-500",
    bar: "bg-gradient-to-r from-red-400 to-red-300",
  },
  review: {
    label: "Review",
    color: "text-orange-500",
    bar: "bg-gradient-to-r from-orange-400 to-yellow-300",
  },
  warn: {
    label: "Warn",
    color: "text-yellow-600",
    bar: "bg-gradient-to-r from-yellow-300 to-primary/60",
  },
  monitor: {
    label: "Monitor",
    color: "text-primary",
    bar: "bg-gradient-to-r from-primary to-teal-300",
  },
  none: {
    label: "None",
    color: "text-muted-foreground",
    bar: "bg-sky-200/50",
  },
};

export function AIDistributionPanel({
  stats,
  loading,
}: AIDistributionPanelProps) {
  if (loading && !stats) {
    return <LoadingBox />;
  }

  if (!stats || stats.total_analyzed === 0) {
    return (
      <Card>
        <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          Belum ada data analisis AI.
        </CardContent>
      </Card>
    );
  }

  const severityEntries = Object.entries(stats.severity);
  const maxSeverity = Math.max(...severityEntries.map(([, v]) => v), 1);

  const actionEntries = Object.entries(stats.recommended_actions);
  const maxAction = Math.max(...actionEntries.map(([, v]) => v), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-lg">🤖</span>
          Distribusi Analisis AI
        </CardTitle>
        <CardDescription className="text-xs">
          Sebaran tingkat keparahan dan rekomendasi dari {stats.total_analyzed} pesan
          yang dianalisis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Severity */}
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Severity
            </h4>
            <div className="space-y-1.5">
              {severityEntries.reverse().map(([key, value]) => {
                const s = SEVERITY_LABELS[key] ?? {
                  label: key,
                  color: "text-muted-foreground",
                  bar: "bg-sky-200/50",
                };
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "w-16 text-[10px] font-medium",
                        s.color,
                      )}
                    >
                      {s.label}
                    </span>
                    <div className="flex-1 h-2 overflow-hidden rounded-full bg-sky-50">
                      <div
                        className={cn("h-full rounded-full", s.bar)}
                        style={{
                          width: `${(value / maxSeverity) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                      {value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommended Actions */}
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rekomendasi Tindakan
            </h4>
            <div className="space-y-1.5">
              {actionEntries.map(([key, value]) => {
                const a = ACTION_LABELS[key] ?? {
                  label: key,
                  color: "text-muted-foreground",
                  bar: "bg-sky-200/50",
                };
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "w-16 text-[10px] font-medium",
                        a.color,
                      )}
                    >
                      {a.label}
                    </span>
                    <div className="flex-1 h-2 overflow-hidden rounded-full bg-sky-50">
                      <div
                        className={cn("h-full rounded-full", a.bar)}
                        style={{
                          width: `${(value / maxAction) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                      {value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer metrics */}
          <div className="flex flex-wrap gap-3 border-t border-sky-100 pt-3 text-[10px] text-muted-foreground">
            <span>
              Rerata confidence:{" "}
              <strong>{(stats.avg_confidence * 100).toFixed(0)}%</strong>
            </span>
            <span>
              Rerata score:{" "}
              <strong>{(stats.avg_score * 100).toFixed(0)}%</strong>
            </span>
            <span>
              Error:{" "}
              <strong className="text-red-500">{stats.analysis_errors}</strong>
            </span>
            <span>
              Pending:{" "}
              <strong className="text-yellow-600">
                {stats.analysis_pending}
              </strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingBox() {
  return (
    <Card>
      <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="ml-2">Memuat data...</span>
      </CardContent>
    </Card>
  );
}
