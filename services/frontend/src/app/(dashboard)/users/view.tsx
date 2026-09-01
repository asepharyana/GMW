"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Hash,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users as UsersIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import {
  Avatar,
  Badge,
  GlassPanel,
  Input,
  Skeleton,
} from "@/components/primitives";
import {
  EmptyState,
  ErrorState,
  PageTransition,
  SectionHeader,
  SkeletonRows,
} from "@/components/shared";
import { useUserDetail, useUsers } from "@/hooks";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import type {
  DashboardUser,
  DashboardUserDetail,
  PaginatedUsers,
} from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

function trustTone(score?: number | null) {
  if (score == null) return "neutral";
  if (score >= 70) return "signal";
  if (score >= 45) return "amber";
  return "vermilion";
}

function trustLabel(score?: number | null) {
  if (score == null) return "UNKNOWN";
  if (score >= 80) return "TRUSTED";
  if (score >= 60) return "LOW RISK";
  if (score >= 45) return "MONITOR";
  if (score >= 30) return "WATCH";
  return "HIGH RISK";
}

export function UsersView({ initialUsers }: { initialUsers?: PaginatedUsers }) {
  const { data: usersData, isLoading, error } = useUsers(initialUsers);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useUserDetail(selectedId);
  const ambient = useAmbient();

  const users = usersData?.data;

  useEffect(() => {
    ambient.set("signal", 0.25, "members");
  }, [ambient]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter(
      (u) =>
        u.username?.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q),
    );
  }, [users, search]);

  const containerRef = useStaggerReveal<HTMLDivElement>(".user-tile", {
    stagger: 0.03,
    y: 8,
    dependencies: [users?.length],
  });

  if (error && !users) return <ErrorState error={error} onRetry={() => {}} />;
  if (isLoading && !users) return <SkeletonRows rows={10} />;

  return (
    <PageTransition>
      <div ref={containerRef} className="space-y-4">
        {/* Tactical HUD Header Bar */}
        <div className="user-tile flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-signal glow-pulse" />
            <h1 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">
              Member Intelligence · Persona Registry
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
            <span>NODES:</span>
            <span className="rounded bg-signal/15 px-2 py-0.5 font-medium text-signal border border-signal/30">
              {filtered.length} REGISTERED
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="user-tile relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by name or ID..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-5">
          {/* Member List */}
          <GlassPanel className="user-tile lg:col-span-3">
            <SectionHeader
              eyebrow="registry"
              title="Member Roster"
              action={
                <span className="mono text-xs text-[#8a8f98]">
                  {filtered.length} members
                </span>
              }
            />
            {filtered.length === 0 ? (
              <EmptyState
                icon={<UsersIcon className="size-7" />}
                title="No members found"
                description="Members appear once messages are captured."
              />
            ) : (
              <div className="mt-3 max-h-[65vh] space-y-1.5 overflow-y-auto pr-1">
                {filtered.map((u) => (
                  <UserRow
                    key={u.user_id}
                    user={u}
                    selected={selectedId === u.user_id}
                    onSelect={() =>
                      setSelectedId((prev) =>
                        prev === u.user_id ? null : u.user_id,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </GlassPanel>

          {/* Detail Panel */}
          <GlassPanel className="user-tile lg:col-span-2">
            <SectionHeader eyebrow="persona" title="Member Inspector" />
            {!selectedId ? (
              <EmptyState
                title="Select a member"
                description="Click any member to see trust profile, activity, and recent messages."
              />
            ) : detail.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-24" />
                <Skeleton className="h-32" />
              </div>
            ) : detail.data ? (
              <MemberDetail user={detail.data} />
            ) : (
              <EmptyState title="Member not found" />
            )}
          </GlassPanel>
        </div>
      </div>
    </PageTransition>
  );
}

function UserRow({
  user,
  selected,
  onSelect,
}: {
  user: DashboardUser;
  selected: boolean;
  onSelect: () => void;
}) {
  const flagPct =
    user.total_messages > 0
      ? (user.flagged_count / user.total_messages) * 100
      : 0;
  const tone = trustTone(user.trust_score);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-[8px] border p-2.5 text-left transition-all ${
        selected
          ? "border-signal/50 bg-signal/10 shadow-xs"
          : "border-hairline bg-surface-2 hover:border-hairline-focus hover:bg-surface"
      }`}
    >
      <Avatar src={user.avatar_url} name={user.username ?? "?"} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold text-ink">
            {user.username ?? "unknown"}
          </span>
          {user.trust_score != null && (
            <Badge tone={tone} className="font-mono text-[9px]">
              {Math.round(user.trust_score)} TRUST
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] text-ink-faint">
          <span className="truncate">#{user.user_id.slice(0, 10)}</span>
          <span>·</span>
          <span className="text-ink-muted">
            {formatNumber(user.total_messages)} msgs
          </span>
          {user.flagged_count > 0 && (
            <span className="text-vermilion">
              {formatNumber(user.flagged_count)} flagged
            </span>
          )}
        </div>
      </div>
      {flagPct > 5 && (
        <span className="shrink-0 rounded bg-vermilion/10 px-1.5 py-0.5 font-mono text-[9px] text-vermilion">
          {flagPct.toFixed(0)}%
        </span>
      )}
    </button>
  );
}

function MemberDetail({ user }: { user: DashboardUserDetail }) {
  const flagPct =
    user.total_messages > 0
      ? (user.flagged_count / user.total_messages) * 100
      : 0;
  const cleanPct =
    user.total_messages > 0
      ? (user.clean_count / user.total_messages) * 100
      : 0;

  return (
    <div className="space-y-3 text-sm">
      {/* Identity */}
      <div className="flex items-center gap-3">
        <Avatar src={user.avatar_url} name={user.username ?? "?"} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-ink">
            {user.username ?? "unknown"}
          </div>
          <div className="truncate font-mono text-[10px] text-ink-faint">
            #{user.user_id}
          </div>
        </div>
        <Badge
          tone={trustTone(user.trust_score)}
          className="font-mono text-[9px]"
        >
          {trustLabel(user.trust_score)}
        </Badge>
      </div>

      {/* Trust Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="hud-card px-2.5 py-2 text-center">
          <div className="eyebrow">Trust</div>
          <div className="font-mono text-sm font-semibold text-signal">
            {user.trust_score ?? "—"}
          </div>
        </div>
        <div className="hud-card px-2.5 py-2 text-center">
          <div className="eyebrow">Clean Streak</div>
          <div className="font-mono text-sm font-semibold text-success">
            {user.clean_message_streak ?? 0}
          </div>
        </div>
        <div className="hud-card px-2.5 py-2 text-center">
          <div className="eyebrow">Infractions</div>
          <div className="font-mono text-sm font-semibold text-vermilion">
            {user.total_infractions ?? 0}
          </div>
        </div>
      </div>

      {/* Activity Breakdown */}
      <div className="space-y-1.5">
        {[
          {
            label: "Clean",
            count: user.clean_count,
            pct: cleanPct,
            tone: "bg-success",
          },
          {
            label: "Flagged",
            count: user.flagged_count,
            pct: flagPct,
            tone: "bg-vermilion",
          },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-[10px]">
            <span className="w-14 shrink-0 font-mono text-ink-muted">
              {row.label}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${row.tone}`}
                style={{ width: `${Math.min(100, row.pct)}%` }}
              />
            </div>
            <span className="w-8 text-right font-mono text-ink-faint">
              {formatNumber(row.count)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1 font-mono text-[9px] text-ink-faint">
          <span>Total: {formatNumber(user.total_messages)} messages</span>
          {user.last_message_at && (
            <span suppressHydrationWarning>
              last {formatRelativeTime(user.last_message_at)}
            </span>
          )}
        </div>
      </div>

      {/* Profile summary */}
      {user.profile_summary && (
        <div>
          <div className="eyebrow mb-1 flex items-center gap-1">
            <Sparkles className="size-3 text-signal" /> AI profile
          </div>
          <div className="hud-card line-clamp-4 p-2.5 text-[11px] text-ink-muted leading-relaxed">
            {user.profile_summary}
          </div>
        </div>
      )}

      {/* Recent messages */}
      {user.recent_messages.length > 0 && (
        <div>
          <div className="eyebrow mb-1.5">Recent Messages</div>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {user.recent_messages.slice(0, 8).map((m) => (
              <div
                key={m.id}
                className="rounded-[6px] border border-hairline bg-surface-2/60 p-2 text-[11px]"
              >
                <div className="flex items-center gap-2 font-mono text-[9px] text-ink-faint">
                  <Hash className="size-2.5 text-signal" />
                  <span className="truncate">#{m.channel_id.slice(0, 12)}</span>
                  <span className="ml-auto" suppressHydrationWarning>
                    {formatRelativeTime(m.created_at)}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-ink-soft">
                  {m.content || "(attachment/embed)"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
