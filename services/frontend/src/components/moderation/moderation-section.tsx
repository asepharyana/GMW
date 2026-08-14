"use client";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  MicOff,
  ShieldAlert,
  Trash2,
  UserX,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/primitives/badge";
import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { useModerationActions, useModerationStats } from "@/hooks";
import { renderMessageContent } from "@/lib/format";
import type {
  ModerationAction,
  ModerationActionType,
  ModerationStats,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const ACTION_META: Record<
  ModerationActionType,
  { label: string; Icon: typeof Trash2; tone: "vermilion" | "amber" }
> = {
  delete_message: { label: "Delete message", Icon: Trash2, tone: "vermilion" },
  mute_user: { label: "Mute user", Icon: MicOff, tone: "amber" },
  warn_user: { label: "Warn user", Icon: AlertTriangle, tone: "amber" },
  kick_user: { label: "Kick user", Icon: UserX, tone: "amber" },
  ban_user: { label: "Ban user", Icon: Ban, tone: "vermilion" },
};

const STATUS_META: Record<
  ModerationAction["status"],
  { label: string; tone: "signal" | "vermilion" | "amber" }
> = {
  executed: { label: "Executed", tone: "signal" },
  failed: { label: "Failed", tone: "vermilion" },
  pending: { label: "Pending", tone: "amber" },
};

function fmtTime(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  const rel =
    hours < 1
      ? "baru saja"
      : hours < 24
        ? `${hours} jam lalu`
        : `${Math.floor(hours / 24)} hari lalu`;
  return `${d.toLocaleString("id-ID")} (${rel})`;
}

const EMPTY_ACTION_RATE = {
  total: 0,
  executed: 0,
  failed: 0,
  pending: 0,
  failed_rate: 0,
};

export function ModerationSection({
  initialStats,
  initialActions,
}: {
  initialStats?: ModerationStats;
  initialActions?: ModerationAction[];
} = {}) {
  const [status, setStatus] = useState<string>("");
  const [actionType, setActionType] = useState<string>("");
  const { data: stats } = useModerationStats(initialStats);
  const { data: actions, isLoading: actionsLoading } = useModerationActions(
    status,
    actionType,
    initialActions,
  );

  const s = stats ?? EMPTY_ACTION_RATE;

  const statusFilters = ["", "executed", "failed", "pending"];
  const typeFilters = [
    "",
    "delete_message",
    "warn_user",
    "kick_user",
    "ban_user",
    "mute_user",
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Total aksi" value={s.total} />
        <SummaryCard
          label="Executed"
          value={s.executed}
          tone="signal"
          hint={undefined}
        />
        <SummaryCard
          label="Failed"
          value={s.failed}
          tone="vermilion"
          hint={s.total > 0 ? `${s.failed_rate}%` : undefined}
        />
        <SummaryCard label="Pending" value={s.pending} tone="amber" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Status
        </span>
        {statusFilters.map((f) => (
          <FilterChip
            key={f || "all"}
            active={status === f}
            label={
              f === ""
                ? "Semua"
                : STATUS_META[f as keyof typeof STATUS_META].label
            }
            onClick={() => setStatus(f)}
          />
        ))}
        <span className="ml-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Tipe
        </span>
        {typeFilters.map((f) => (
          <FilterChip
            key={f || "all"}
            active={actionType === f}
            label={
              f === "" ? "Semua" : ACTION_META[f as ModerationActionType].label
            }
            onClick={() => setActionType(f)}
          />
        ))}
      </div>

      {/* Timeline */}
      {actionsLoading && !actions ? (
        <LoadingSkeleton count={6} height="h-16" />
      ) : !actions || actions.length === 0 ? (
        <div className="surface p-6">
          <EmptyState
            icon={ShieldAlert}
            title="Belum ada aksi moderasi"
            description="Aksi auto-moderasi (delete, warn, kick, ban) akan muncul di sini."
          />
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((a) => (
            <ActionRow key={a.id} action={a} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-[var(--color-ink-soft)]">
        {actions?.length ?? 0} aksi ditampilkan · log moderasi gateway Discord
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: "signal" | "vermilion" | "amber";
  hint?: string;
}) {
  return (
    <div className="surface p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold",
          tone === "signal" && "text-[var(--color-signal)]",
          tone === "vermilion" && "text-[var(--color-vermilion)]",
          tone === "amber" && "text-[var(--color-amber)]",
          !tone && "text-[var(--color-ink)]",
        )}
      >
        {value}
        {hint && (
          <span className="ml-1 text-xs font-medium opacity-80">({hint})</span>
        )}
      </p>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-[11px] transition-colors",
        active
          ? "bg-[var(--color-signal)] text-[var(--color-signal-ink)]"
          : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]",
      )}
    >
      {label}
    </button>
  );
}

function ActionRow({ action }: { action: ModerationAction }) {
  const meta = ACTION_META[action.action_type] ?? ACTION_META.delete_message;
  const st = STATUS_META[action.status];
  const Icon = meta.Icon;
  return (
    <div className="surface flex items-start gap-3 p-3">
      <span
        className={cn(
          "mt-0.5 shrink-0",
          meta.tone === "vermilion"
            ? "text-[var(--color-vermilion)]"
            : "text-[var(--color-amber)]",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-ink)]">
            {meta.label}
          </span>
          {action.username && (
            <span className="text-xs text-[var(--color-ink-soft)]">
              @{action.username}
            </span>
          )}
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        {action.content && (
          <p className="mt-1 line-clamp-2 text-xs text-[var(--color-ink-soft)]">
            {renderMessageContent(action.content, null)}
          </p>
        )}
        {action.reason && (
          <p className="mt-1 text-[11px] text-[var(--color-ink-soft)]">
            Alasan: {action.reason}
          </p>
        )}
        {action.error && (
          <p className="mt-1 text-[11px] text-[var(--color-vermilion)] line-clamp-2">
            Error: {action.error}
          </p>
        )}
        <p className="mt-1.5 text-[10px] font-mono text-[var(--color-ink-soft)]">
          dibuat {fmtTime(action.created_at)}
          {action.executed_at
            ? ` · dieksekusi ${fmtTime(action.executed_at)}`
            : ""}
        </p>
      </div>
      {action.status === "executed" ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--color-signal)]" />
      ) : action.status === "failed" ? (
        <XCircle className="mt-0.5 size-3.5 shrink-0 text-[var(--color-vermilion)]" />
      ) : (
        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-[var(--color-amber)]" />
      )}
    </div>
  );
}

export default ModerationSection;
