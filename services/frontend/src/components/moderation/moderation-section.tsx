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
import { GlassCard } from "@/components/glass/card";
import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { useModerationActions, useModerationStats } from "@/hooks";
import { renderMessageContent } from "@/lib/format";
import type { ModerationAction, ModerationActionType } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACTION_META: Record<
  ModerationActionType,
  { label: string; Icon: typeof Trash2; className: string }
> = {
  delete_message: {
    label: "Delete message",
    Icon: Trash2,
    className: "text-red-500",
  },
  mute_user: { label: "Mute user", Icon: MicOff, className: "text-orange-500" },
  warn_user: {
    label: "Warn user",
    Icon: AlertTriangle,
    className: "text-amber-500",
  },
  kick_user: { label: "Kick user", Icon: UserX, className: "text-orange-500" },
  ban_user: { label: "Ban user", Icon: Ban, className: "text-red-500" },
};

const STATUS_META: Record<
  ModerationAction["status"],
  { label: string; className: string; dot: string }
> = {
  executed: {
    label: "Executed",
    className: "border-green-500/40 text-green-500",
    dot: "bg-green-500",
  },
  failed: {
    label: "Failed",
    className: "border-red-500/40 text-red-500",
    dot: "bg-red-500",
  },
  pending: {
    label: "Pending",
    className: "border-amber-500/40 text-amber-500",
    dot: "bg-amber-500",
  },
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

export function ModerationSection() {
  const [status, setStatus] = useState<string>("");
  const [actionType, setActionType] = useState<string>("");
  const { data: stats } = useModerationStats();
  const { data: actions, isLoading: actionsLoading } = useModerationActions(
    status,
    actionType,
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
    <div className="space-y-4 animate-fade-in-up">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total aksi"
          value={s.total}
          color="text-text-primary"
        />
        <SummaryCard
          label="Executed"
          value={s.executed}
          color="text-green-500"
        />
        <SummaryCard
          label="Failed"
          value={s.failed}
          color="text-red-500"
          hint={s.total > 0 ? `${s.failed_rate}%` : undefined}
        />
        <SummaryCard label="Pending" value={s.pending} color="text-amber-500" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary/50">
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
        <span className="ml-3 text-[10px] font-semibold uppercase tracking-wide text-text-secondary/50">
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
      {actionsLoading ? (
        <LoadingSkeleton count={6} height="h-16" />
      ) : !actions || actions.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState
            icon={ShieldAlert}
            title="Belum ada aksi moderasi"
            description="Aksi auto- moderasi (delete, warn, kick, ban) akan muncul di sini."
          />
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {actions.map((a) => (
            <ActionRow key={a.id} action={a} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-text-secondary/40">
        {actions?.length ?? 0} aksi ditampilkan · log moderasi gateway Discord
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: number;
  color: string;
  hint?: string;
}) {
  return (
    <GlassCard className="p-4">
      <p className="text-[10px] uppercase tracking-wide text-text-secondary/50">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-bold", color)}>
        {value}
        {hint && (
          <span className="ml-1 text-xs font-medium opacity-80">({hint})</span>
        )}
      </p>
    </GlassCard>
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
          ? "bg-primary/20 text-primary"
          : "text-text-secondary/60 hover:text-text-primary glass",
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
    <GlassCard className="flex items-start gap-3 p-3">
      <span className={cn("mt-0.5 shrink-0", meta.className)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-text-primary">
            {meta.label}
          </span>
          {action.username && (
            <span className="text-xs text-text-secondary">
              @{action.username}
            </span>
          )}
          <Badge variant="outline" className={cn("text-[10px]", st.className)}>
            <span
              className={cn("mr-1 inline-block size-1.5 rounded-full", st.dot)}
            />
            {st.label}
          </Badge>
        </div>
        {action.content && (
          <p className="mt-1 line-clamp-2 text-xs text-text-secondary/80">
            {renderMessageContent(action.content, null)}
          </p>
        )}
        {action.reason && (
          <p className="mt-1 text-[11px] text-text-secondary/60">
            Alasan: {action.reason}
          </p>
        )}
        {action.error && (
          <p className="mt-1 text-[11px] text-red-500/80 line-clamp-2">
            Error: {action.error}
          </p>
        )}
        <p className="mt-1.5 text-[10px] font-mono text-text-secondary/40">
          dibuat {fmtTime(action.created_at)}
          {action.executed_at
            ? ` · dieksekusi ${fmtTime(action.executed_at)}`
            : ""}
        </p>
      </div>
      {action.status === "executed" ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-500" />
      ) : action.status === "failed" ? (
        <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
      ) : (
        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-amber-500" />
      )}
    </GlassCard>
  );
}

export default ModerationSection;
