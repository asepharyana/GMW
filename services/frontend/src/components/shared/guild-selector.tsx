"use client";

import { AlertCircle, RefreshCw, Server } from "lucide-react";
import { useEffect, useRef } from "react";

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
import { useConfig, useGuilds } from "@/hooks";

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
  const { data: guilds = [], isLoading, error, mutate: refetch } = useGuilds();
  const { data: config } = useConfig();

  const initDone = useRef(false);

  useEffect(() => {
    if (value || guilds.length === 0 || initDone.current) return;
    initDone.current = true;
    const preferred = config?.monitorGuildId ?? guilds[0].id;
    if (preferred) onChange(preferred);
  }, [value, guilds, config, onChange]);

  // Auto-hide when there's exactly one guild and autoHide is on
  if (autoHide && guilds.length <= 1 && !isLoading && !error) return null;

  if (isLoading) {
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
        <SelectTrigger className="h-10 w-full max-w-sm">
          <SelectValue placeholder="Select a guild…">
            {guilds.find((g) => g.id === value)?.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {guilds.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              <span className="flex items-center gap-2">
                {g.icon ? (
                  // biome-ignore lint/performance/noImgElement: guild icon is a remote Discord CDN URL
                  <img
                    src={g.icon}
                    alt=""
                    className="size-4 rounded-full object-cover"
                  />
                ) : (
                  <Server className="size-4 text-muted-foreground" />
                )}
                <span className="line-clamp-1">{g.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
