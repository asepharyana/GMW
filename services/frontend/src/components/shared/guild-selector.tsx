"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { configApi, voiceApi } from "@/lib/api";
import type { Guild } from "@/lib/types";

export interface GuildSelectorProps {
  /** Currently selected guild ID */
  value: string;
  /** Called when user selects a different guild */
  onChange: (guildId: string) => void;
  /** If true, the bar is hidden when there's only one guild */
  autoHide?: boolean;
}

/**
 * Guild selector bar — fetches the guild list and renders a <Select>.
 * Optionally auto-hides when there's exactly one guild.
 */
export function GuildSelector({
  value,
  onChange,
  autoHide = true,
}: GuildSelectorProps) {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initDone = useRef(false);

  const fetchGuilds = useCallback(() => {
    setLoading(true);
    setError(null);

    const tryAutoSelect = (list: Guild[]) => {
      if (value || list.length === 0 || initDone.current) return;
      initDone.current = true;
      // Try config's monitorGuildId first, then fall back to first guild
      configApi
        .get()
        .then((cfg) => {
          const preferred = cfg.monitorGuildId ?? list[0].id;
          if (preferred) onChange(preferred);
        })
        .catch(() => {
          onChange(list[0].id);
        });
    };

    voiceApi
      .getGuilds()
      .then((list) => {
        setGuilds(list);
        tryAutoSelect(list);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load guilds"),
      )
      .finally(() => setLoading(false));
  }, [value, onChange]);

  useEffect(() => {
    fetchGuilds();
  }, [fetchGuilds]);

  // Auto-hide when there's exactly one guild and autoHide is on
  if (autoHide && guilds.length <= 1 && !loading && !error) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 p-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-destructive shrink-0" />
          <p className="text-sm text-muted-foreground">
            Could not load guilds: {error}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchGuilds}>
          <RefreshCw className="size-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-yellow-500 shrink-0" />
          <p className="text-sm text-muted-foreground">
            No guilds available. Make sure the Discord gateway is connected.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
      <Badge variant="outline" className="shrink-0 text-xs font-normal">
        Guild
      </Badge>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-8 w-full max-w-xs">
          <SelectValue placeholder="Select a guild…" />
        </SelectTrigger>
        <SelectContent>
          {guilds.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
