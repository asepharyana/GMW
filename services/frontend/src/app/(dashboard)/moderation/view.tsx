"use client";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Filter,
  MessageSquareWarning,
  MicOff,
  ShieldAlert,
  Trash2,
  UserX,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Donut } from "@/components/charts";
import { LiveModerationFeed } from "@/components/LiveModerationFeed";
import {
  Badge,
  GlassPanel,
  Select,
  type SelectOption,
} from "@/components/primitives";
import {
  ErrorState,
  MetricTile,
  SectionHeader,
  SkeletonMetricRow,
  SkeletonPanel,
  SkeletonRows,
} from "@/components/shared";
import { TopicTrends } from "@/components/TopicTrends";
import {
  useLiveModeration,
  useModerationActions,
  useModerationStats,
  useModerationTrends,
} from "@/hooks";
import { aiTone } from "@/lib/ai-status";
import { downloadCsv } from "@/lib/csv";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import type {
  ModerationAction,
  ModerationActionType,
  ModerationStats,
} from "@/lib/types";
import { staggerDelay } from "@/lib/utils";

const ACTION_ICON: Record<ModerationActionType, React.ReactNode> = {
  delete_message: <Trash2 className="size-3.5" />,
  mute_user: <MicOff className="size-3.5" />,
  warn_user: <MessageSquareWarning className="size-3.5" />,
  kick_user: <UserX className="size-3.5" />,
  ban_user: <Ban className="size-3.5" />,
};

const ACTION_LABEL: Record<ModerationActionType, string> = {
  delete_message: "Delete",
  mute_user: "Mute",
  warn_user: "Warn",
  kick_user: "Kick",
  ban_user: "Ban",
};

export function ModerationView({
  initialStats,
  initialActions,
}: {
  initialStats?: ModerationStats;
  initialActions?: ModerationAction[];
}) {
  const { data: stats, isLoading, error } = useModerationStats(initialStats);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const { data: actions } = useModerationActions(
    statusFilter || undefined,
    typeFilter || undefined,
    !statusFilter && !typeFilter ? initialActions : undefined,
  );
  const liveActions = useLiveModeration(initialActions ?? [], 50);
  const { data: trends } = useModerationTrends(30);

  const failedRate = stats ? stats.failed_rate * 100 : 0;

  const byAction = stats?.by_action ?? {};
  const segments = Object.entries(byAction).map(([k, _v]) => ({
    value: 1,
    color:
      k === "ban_user" || k === "kick_user"
        ? "var(--color-vermilion)"
        : k === "warn_user"
          ? "var(--color-amber)"
          : "var(--color-signal)",
    label: k,
  }));

  const ambient = useAmbient();
  useEffect(() => {
    ambient.set(
      failedRate > 20 ? "vermilion" : failedRate > 5 ? "amber" : "signal",
      0.3 + Math.min(0.4, failedRate / 50),
      "moderation",
    );
  }, [failedRate, ambient]);

  if (error && !stats) return <ErrorState error={error} />;
  if (!stats && isLoading)
    return (
      <div className="space-y-5">
        <SkeletonMetricRow cols={4} />
        <SkeletonPanel rows={5} />
        <SkeletonRows rows={6} />
      </div>
    );
  if (!stats) return <ErrorState error={error ?? new Error("No data")} />;

  const statusOpts: SelectOption[] = [
    { value: "", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "executed", label: "Executed" },
    { value: "failed", label: "Failed" },
  ];
  const typeOpts: SelectOption[] = [
    { value: "", label: "All actions" },
    ...Object.keys(byAction).map((k) => ({
      value: k,
      label: ACTION_LABEL[k as ModerationActionType] ?? k,
    })),
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile
          label="Total actions"
          value={formatNumber(stats.total)}
          tone="signal"
          icon={<ShieldAlert className="size-3.5" />}
        />
        <MetricTile
          label="Executed"
          value={formatNumber(stats.executed)}
          tone="signal"
          icon={<CheckCircle2 className="size-3.5" />}
        />
        <MetricTile
          label="Failed"
          value={formatNumber(stats.failed)}
          tone={stats.failed > 0 ? "vermilion" : "neutral"}
          icon={<XCircle className="size-3.5" />}
        />
        <MetricTile
          label="Pending"
          value={formatNumber(stats?.pending)}
          tone={stats?.pending > 0 ? "amber" : "neutral"}
          icon={<Clock className="size-3.5" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2">
          {trends ? (
            <TopicTrends trends={trends} />
          ) : (
            <SkeletonPanel rows={6} />
          )}
        </div>

        <div className="lg:col-span-5">
          <LiveModerationFeed actions={liveActions} />
        </div>

        <GlassPanel className="lg:col-span-2">
          <SectionHeader eyebrow="health" title="Breakdown" />
          <div className="flex items-center gap-5">
            <Donut
              segments={
                segments.length
                  ? segments
                  : [
                      {
                        value: 1,
                        color: "var(--color-ink-faint)",
                        label: "none",
                      },
                    ]
              }
              centerLabel={`${Math.round(failedRate)}%`}
              centerSub="fail rate"
            />
            <div className="flex-1 space-y-2 text-sm">
              {Object.entries(byAction).map(([k, v]) => {
                const count = typeof v === "number" ? v : null;
                return (
                  <div key={k} className="flex items-center gap-2.5">
                    <span className="text-ink-soft">
                      {ACTION_ICON[k as ModerationActionType]}
                    </span>
                    <span className="flex-1 text-ink-soft">
                      {ACTION_LABEL[k as ModerationActionType] ?? k}
                    </span>
                    {count !== null && (
                      <span className="mono text-ink">{count}</span>
                    )}
                  </div>
                );
              })}
              {Object.keys(byAction).length === 0 && (
                <div className="text-xs text-ink-faint">
                  No actions recorded yet.
                </div>
              )}
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="lg:col-span-3">
          <SectionHeader
            eyebrow="filter"
            title="Action log"
            action={
              <div className="flex items-center gap-2">
                <Filter className="size-3.5 text-ink-faint" />
                <Select
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={typeOpts}
                  size="sm"
                  className="w-36"
                />
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOpts}
                  size="sm"
                  className="w-32"
                />
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      "moderation-actions.csv",
                      (actions ?? []).map((a) => ({
                        id: a.id,
                        user: a.username ?? a.user_id,
                        action_type: a.action_type,
                        status: a.status,
                        severity: a.severity ?? "",
                        categories: (a.categories ?? []).join("|"),
                        reason: a.reason ?? "",
                        created_at: a.created_at
                          ? new Date(a.created_at).toISOString()
                          : "",
                      })),
                    )
                  }
                  className="rounded-full border border-hairline bg-white/[0.03] px-3 py-1 text-xs text-ink-soft transition-colors hover:bg-white/[0.06]"
                  title="Download moderation actions as CSV"
                >
                  CSV
                </button>
              </div>
            }
          />
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
            {(actions ?? []).map((a, i) => (
              <ActionRow key={a.id} a={a} index={i} />
            ))}
            {(actions ?? []).length === 0 && (
              <div className="py-10 text-center text-xs text-ink-faint">
                No matching actions.
              </div>
            )}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}

function ActionRow({ a, index = 0 }: { a: ModerationAction; index?: number }) {
  const tone =
    a.status === "executed"
      ? "signal"
      : a.status === "failed"
        ? "vermilion"
        : "amber";
  const icon = ACTION_ICON[a.action_type] ?? (
    <AlertTriangle className="size-3.5" />
  );
  // Map moderation severity → design-system tone (reuse aiTone with a
  // severity→status projection so "none" reads as clean/signal).
  const severityTone =
    a.severity == null
      ? null
      : aiTone(
          a.severity === "none"
            ? "clean"
            : a.severity === "low" || a.severity === "medium"
              ? "warn"
              : "flagged",
        );
  return (
    <div
      className="animate-stagger flex items-start gap-3 rounded-[10px] border border-hairline bg-white/[0.03] p-3"
      style={staggerDelay(index)}
    >
      <span
        className={`mt-0.5 ${tone === "vermilion" ? "text-vermilion" : tone === "amber" ? "text-amber" : "text-signal"}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">
            {a.username ?? "unknown"}
          </span>
          <Badge tone={tone}>{a.status}</Badge>
          <span className="mono ml-auto text-[0.6rem] text-ink-faint">
            {formatRelativeTime(a.created_at)}
          </span>
        </div>
        {a.reason && (
          <div className="mt-0.5 text-xs text-ink-soft">“{a.reason}”</div>
        )}
        {severityTone && a.severity && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge tone={severityTone}>{a.severity}</Badge>
            {a.confidence != null && (
              <span className="mono text-[0.6rem] text-ink-faint">
                conf {(a.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        )}
        {a.flags?.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {a.flags.slice(0, 6).map((f) => (
              <Badge key={f} tone="amber">
                {f}
              </Badge>
            ))}
          </div>
        ) : null}
        {a.evidence?.length ? (
          <div className="mt-1 border-l-2 border-hairline pl-2 text-xs text-ink-faint">
            &ldquo;{a.evidence[0]}&rdquo;
          </div>
        ) : null}
        {a.executed_by && (
          <div className="mono mt-0.5 text-[0.6rem] text-ink-faint">
            by {a.executed_by}
            {a.executed_at ? ` · ${formatRelativeTime(a.executed_at)}` : ""}
          </div>
        )}
        {a.content && (
          <div className="mt-1 line-clamp-2 rounded-[8px] bg-white/[0.03] px-2 py-1 text-xs text-ink-faint">
            {a.content}
          </div>
        )}
        {a.error && (
          <div className="mt-1 text-xs text-vermilion">{a.error}</div>
        )}
      </div>
    </div>
  );
}
