"use client";

/**
 * Moderation scene — flagged actions orbit a verdict hub on the stage
 * (vermilion stars); the overlay carries the metric whisper (left),
 * the live feed as a bottom ribbon, and an intel dossier (right) with
 * trends / coverage / domains / heatmap / drilldown.
 */
import {
  AlertTriangle,
  Ban,
  Filter,
  MessageSquareWarning,
  MicOff,
  ShieldAlert,
  Trash2,
  UserX,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { CategoryDrilldown } from "@/components/CategoryDrilldown";
import { CoverageTiles } from "@/components/CoverageTiles";
import { Donut } from "@/components/charts";
import { ModerationHeatmap } from "@/components/ModerationHeatmap";
import { Badge, Select, type SelectOption } from "@/components/primitives";
import { ScamDomains } from "@/components/ScamDomains";
import { ErrorState } from "@/components/shared";
import {
  useSceneFocusSetter,
  useScenePublish,
} from "@/components/shell/scene-graph-context";
import { TopChannels } from "@/components/TopChannels";
import { TopicTrends } from "@/components/TopicTrends";
import {
  useHourlyModeration,
  useLiveModeration,
  useModerationActions,
  useModerationByCategory,
  useModerationCoverage,
  useModerationStats,
  useModerationTrends,
  useTopFlaggedChannels,
  useTopFlaggedDomains,
} from "@/hooks";
import { aiTone } from "@/lib/ai-status";
import type { ConstellationGraph } from "@/lib/constellation/graph";
import { downloadCsv } from "@/lib/csv";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import type {
  ModerationAction,
  ModerationActionType,
  ModerationStats,
} from "@/lib/types";

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

/** Flagged actions → vermilion satellites around a verdict hub. */
function moderationGraph(
  liveActions: ModerationAction[],
  stats?: ModerationStats,
): ConstellationGraph {
  const recent = liveActions.slice(0, 24);
  const nodes = [
    { id: "verdict", label: "verdict hub", kind: "guild" as const, value: 1 },
    ...recent.map((a) => ({
      id: `mod:${a.id}`,
      label: a.username ?? (a.user_id ?? "unknown").slice(0, 8),
      kind:
        a.status === "failed"
          ? ("flagged" as const)
          : a.status === "pending"
            ? ("message" as const)
            : ("channel" as const),
      value: a.status === "executed" ? 0.55 : 0.35,
      href: undefined,
      meta: { mod_status: a.status },
    })),
  ];
  void stats;
  return {
    nodes,
    edges: recent.map((a) => ({ source: "verdict", target: `mod:${a.id}` })),
  };
}

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
  const { data: domains } = useTopFlaggedDomains(30);
  const { data: channels } = useTopFlaggedChannels(30);
  const { data: hourly } = useHourlyModeration(30);
  const { data: coverage } = useModerationCoverage(30);
  const [drilldown, setDrilldown] = useState<string | null>(null);
  const [intelOpen, setIntelOpen] = useState(false);
  const { data: categoryActions, isValidating: categoryLoading } =
    useModerationByCategory(drilldown ? 30 : 0, drilldown);

  const publish = useScenePublish();
  const setFocus = useSceneFocusSetter();

  const failedRate = stats ? stats.failed_rate * 100 : 0;

  const byAction = stats?.by_action ?? {};
  const segments = Object.entries(byAction).map(([k]) => ({
    value: 1,
    color:
      k === "ban_user" || k === "kick_user"
        ? "var(--color-vermilion)"
        : k === "warn_user"
          ? "var(--color-amber)"
          : "var(--color-signal)",
    label: k,
  }));

  const graph = useMemo(
    () => moderationGraph(liveActions, stats),
    [liveActions, stats],
  );

  useEffect(() => {
    publish({ graph, focus: null });
  }, [graph, publish]);

  useEffect(
    () => () => {
      publish({ graph: { nodes: [], edges: [] }, focus: null });
      setFocus(null);
    },
    [publish, setFocus],
  );

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
      <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-sm text-[var(--color-ink-faint)]">
        menghubungkan verdict hub…
      </p>
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
    <div className="min-h-full">
      {/* Metric whisper — left */}
      <section
        className="pointer-events-auto absolute left-5 top-16 w-56"
        aria-label="Moderation metrics"
      >
        <p className="eyebrow mb-2 flex items-center gap-1.5">
          <ShieldAlert className="size-3.5 text-signal" /> Enforcement
        </p>
        <div className="space-y-1.5">
          <Whisper
            label="total actions"
            value={formatNumber(stats.total)}
            tone="ink"
          />
          <Whisper
            label="executed"
            value={formatNumber(stats.executed)}
            tone="signal"
          />
          <Whisper
            label="failed"
            value={formatNumber(stats.failed)}
            tone={stats.failed > 0 ? "vermilion" : "ink"}
          />
          <Whisper
            label="pending"
            value={formatNumber(stats.pending)}
            tone={stats.pending > 0 ? "amber" : "ink"}
          />
        </div>
        <div className="mt-4">
          <Donut
            segments={
              segments.length
                ? segments
                : [{ value: 1, color: "var(--color-ink-faint)", label: "none" }]
            }
            centerLabel={`${Math.round(failedRate)}%`}
            centerSub="fail rate"
          />
          <div className="mt-2 space-y-1 font-mono text-xs text-[var(--color-ink-soft)]">
            {Object.entries(byAction).map(([k, v]) => {
              const count = typeof v === "number" ? v : null;
              return (
                <p key={k} className="flex items-center gap-2">
                  <span>{ACTION_ICON[k as ModerationActionType]}</span>
                  <span className="flex-1">
                    {ACTION_LABEL[k as ModerationActionType] ?? k}
                  </span>
                  {count !== null ? <span>{count}</span> : null}
                </p>
              );
            })}
          </div>
        </div>
      </section>

      {/* Intel dossier — right */}
      <div className="pointer-events-auto absolute right-5 top-16 hidden w-[min(24rem,90vw)] md:block">
        <button
          type="button"
          onClick={() => setIntelOpen((v) => !v)}
          className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
            intelOpen
              ? "border-signal/40 bg-signal/10 text-signal"
              : "border-[var(--color-hairline)] bg-[var(--color-canvas)]/60 text-[var(--color-ink-soft)] backdrop-blur-md hover:text-[var(--color-ink)]"
          }`}
        >
          intel {intelOpen ? "▲" : "▼"}
        </button>
        {intelOpen ? (
          <div className="mt-2 max-h-[64vh] space-y-4 overflow-y-auto rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/78 p-3 backdrop-blur-xl">
            {trends ? <TopicTrends trends={trends} /> : null}
            {coverage ? <CoverageTiles coverage={coverage} /> : null}
            {domains ? <ScamDomains domains={domains} /> : null}
            {hourly ? <ModerationHeatmap hours={hourly} /> : null}
            {channels ? <TopChannels channels={channels} /> : null}
            <CategoryDrilldown
              trends={trends ?? { categories: [], severities: [], actions: [] }}
              selected={drilldown}
              actions={categoryActions ?? []}
              loading={categoryLoading}
              onSelect={setDrilldown}
            />
          </div>
        ) : null}
      </div>

      {/* Live feed ribbon — bottom */}
      <section
        className="pointer-events-auto absolute inset-x-4 bottom-20 max-h-[46vh] overflow-hidden rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/75 backdrop-blur-xl lg:left-80 lg:right-[26rem]"
        aria-label="Live moderation feed"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-2">
          <span className="eyebrow flex items-center gap-2">
            <Filter className="size-3 text-[var(--color-ink-faint)]" />
            action log
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              options={typeOpts}
              size="sm"
              className="w-32"
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOpts}
              size="sm"
              className="w-28"
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
              className="rounded-full border border-[var(--color-hairline)] px-3 py-1 font-mono text-xs text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
              title="Download moderation actions as CSV"
            >
              CSV
            </button>
          </div>
        </div>
        <div className="max-h-[40vh] overflow-y-auto p-2">
          <ActionRows actions={actions ?? []} liveCount={liveActions.length} />
        </div>
      </section>
    </div>
  );
}

function ActionRows({
  actions,
  liveCount,
}: {
  actions: ModerationAction[];
  liveCount: number;
}) {
  if (actions.length === 0 && liveCount === 0) {
    return (
      <div className="py-6 text-center font-mono text-xs text-[var(--color-ink-faint)]">
        No matching actions.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {actions.map((a, i) => (
        <ActionRow key={a.id} a={a} index={i} />
      ))}
    </div>
  );
}

function Whisper({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ink" | "signal" | "vermilion" | "amber";
}) {
  const color =
    tone === "vermilion"
      ? "text-vermilion"
      : tone === "amber"
        ? "text-amber"
        : tone === "signal"
          ? "text-signal"
          : "text-ink";
  return (
    <p className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        {label}
      </span>
      <span className={`display text-lg leading-none ${color}`}>{value}</span>
    </p>
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
      className="animate-stagger flex items-start gap-3 rounded-xl border border-[var(--color-hairline)] p-3"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <span
        className={`mt-0.5 ${tone === "vermilion" ? "text-vermilion" : tone === "amber" ? "text-amber" : "text-signal"}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--color-ink)]">
            {a.username ?? "unknown"}
          </span>
          <Badge tone={tone}>{a.status}</Badge>
          <span className="ml-auto font-mono text-[0.6rem] text-[var(--color-ink-faint)]">
            {formatRelativeTime(a.created_at)}
          </span>
        </div>
        {a.reason ? (
          <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            &ldquo;{a.reason}&rdquo;
          </div>
        ) : null}
        {severityTone && a.severity ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge tone={severityTone}>{a.severity}</Badge>
            {a.confidence != null ? (
              <span className="font-mono text-[0.6rem] text-[var(--color-ink-faint)]">
                conf {(a.confidence * 100).toFixed(0)}%
              </span>
            ) : null}
          </div>
        ) : null}
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
          <div className="mt-1 border-l-2 border-[var(--color-hairline)] pl-2 text-xs text-[var(--color-ink-faint)]">
            &ldquo;{a.evidence[0]}&rdquo;
          </div>
        ) : null}
        {a.executed_by ? (
          <div className="mt-0.5 font-mono text-[0.6rem] text-[var(--color-ink-faint)]">
            by {a.executed_by}
            {a.executed_at ? ` · ${formatRelativeTime(a.executed_at)}` : ""}
          </div>
        ) : null}
        {a.content ? (
          <div className="mt-1 line-clamp-2 rounded-lg bg-white/[0.03] px-2 py-1 text-xs text-[var(--color-ink-faint)]">
            {a.content}
          </div>
        ) : null}
        {a.error ? (
          <div className="mt-1 text-xs text-vermilion">{a.error}</div>
        ) : null}
      </div>
    </div>
  );
}
