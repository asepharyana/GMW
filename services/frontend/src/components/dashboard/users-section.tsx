"use client";

import { Search, Users } from "lucide-react";
import { useCallback, useState } from "react";
import { Avatar } from "@/components/primitives/avatar";
import { Badge } from "@/components/primitives/badge";
import { Input } from "@/components/primitives/input";
import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { useUserDetail, useUsers } from "@/hooks";

const TRUST_TIERS = [
  { min: 75, label: "Trusted", tone: "signal" as const },
  { min: 40, label: "Neutral", tone: "neutral" as const },
  { min: 10, label: "At Risk", tone: "amber" as const },
  { min: 0, label: "Critical", tone: "vermilion" as const },
];

function trustTier(score?: number | null) {
  const s = score ?? 0;
  return (
    TRUST_TIERS.find((t) => s >= t.min) ?? TRUST_TIERS[TRUST_TIERS.length - 1]
  );
}

export function UsersSection() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useUsers(search);
  const { data: detail } = useUserDetail(selectedId);

  const handleSearch = useCallback((v: string) => setSearch(v), []);

  if (isLoading) return <LoadingSkeleton count={6} />;
  if (users.length === 0)
    return (
      <EmptyState
        icon={Users}
        title="No users found"
        description="Try a different search."
      />
    );

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
      <div className="surface flex flex-col gap-2 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-soft)]" />
          <Input
            mono
            placeholder="search users…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-col">
          {users.map((u) => {
            const tier = trustTier(u.trust_score);
            return (
              <button
                key={u.user_id}
                type="button"
                onClick={() => setSelectedId(u.user_id)}
                className="flex items-center gap-3 rounded-[var(--radius-r-control)] px-2 py-2 text-left transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <Avatar src={u.avatar_url} name={u.username} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {u.username ?? "unknown"}
                  </div>
                  <div className="mono text-xs text-[var(--color-ink-soft)]">
                    {u.total_messages.toLocaleString()} msg
                  </div>
                </div>
                <Badge tone={tier.tone}>{tier.label}</Badge>
              </button>
            );
          })}
        </div>
      </div>

      <div className="surface p-4">
        {detail ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar
                src={detail.avatar_url}
                name={detail.username}
                size={44}
              />
              <div>
                <div className="font-semibold">{detail.username}</div>
                <div className="text-xs text-[var(--color-ink-soft)]">
                  {detail.total_messages.toLocaleString()} messages
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Trust" value={`${detail.trust_score ?? 0}`} />
              <Stat
                label="Clean streak"
                value={`${detail.clean_message_streak ?? 0}`}
              />
              <Stat
                label="Infractions"
                value={`${detail.total_infractions ?? 0}`}
                tone="vermilion"
              />
              <Stat
                label="Flagged"
                value={`${detail.flagged_count}`}
                tone="amber"
              />
            </div>
            <p className="text-xs text-[var(--color-ink-soft)]">
              {detail.profile_summary}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-ink-soft)]">
            Select a user to inspect.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "vermilion";
}) {
  return (
    <div className="surface-2 p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">
        {label}
      </div>
      <div
        className={`mono text-lg font-semibold ${tone === "amber" ? "text-[var(--color-amber)]" : tone === "vermilion" ? "text-[var(--color-vermilion)]" : "text-[var(--color-ink)]"}`}
      >
        {value}
      </div>
    </div>
  );
}
