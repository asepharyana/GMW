"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";

import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Select } from "@/components/primitives/select";
import { Skeleton } from "@/components/primitives/skeleton";
import { useConfig, useGuilds } from "@/hooks";

export interface GuildSelectorProps {
  /** Currently selected guild ID */
  value: string;
  /** Called when user selects a different guild */
  onChange: (guildId: string) => void;
  /** If true, the bar is hidden when there's only one guild */
  autoHide?: boolean;
}

export function GuildSelector({
  value,
  onChange,
  autoHide = true,
}: GuildSelectorProps) {
  const { data: guilds = [], isLoading, error, mutate: refetch } = useGuilds();
  const { data: config } = useConfig();

  const initDone = useRef(false);

  useEffect(() => {
    if (value || guilds.length === 0 || initDone.current) return;
    initDone.current = true;
    const preferred = config?.monitorGuildId ?? guilds[0].id;
    if (preferred) onChange(preferred);
  }, [value, guilds, config, onChange]);

  if (autoHide && guilds.length <= 1 && !isLoading && !error) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-r)] bg-[var(--color-surface)] p-3">
        <Skeleton className="h-8 w-36" />
        <Skeleton rounded className="h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius-r)] bg-[var(--color-vermilion)]/10 p-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-[var(--color-vermilion)] shrink-0" />
          <p className="text-sm text-[var(--color-ink-soft)]">
            Could not load guilds: {error?.message ?? "Failed to load"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="size-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="rounded-[var(--radius-r)] bg-[var(--color-amber)]/10 p-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-[var(--color-amber)] shrink-0" />
          <p className="text-sm text-[var(--color-ink-soft)]">
            No guilds available. Make sure the Discord gateway is connected.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-r)] bg-[var(--color-surface)] p-3">
      <Badge tone="neutral" className="shrink-0 text-xs font-normal">
        Guild
      </Badge>
      <Select
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-10 w-full max-w-sm"
      >
        {guilds.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
