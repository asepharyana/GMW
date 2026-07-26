"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
import { DashboardPanel } from "@/features/dashboard/dashboard-panel";
import { LivePanel } from "@/features/live/live-panel";
import { MessagesPanel } from "@/features/messages/messages-panel";
import { voiceApi } from "@/lib/api";
import { useAppConfig } from "@/lib/hooks/use-config";
import type { Guild } from "@/lib/types";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "messages";
  const urlGuildId = searchParams.get("guildId");

  const { config, loading: configLoading } = useAppConfig();

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(true);
  const [guildsError, setGuildsError] = useState<string | null>(null);
  const [selectedGuildId, setSelectedGuildId] = useState("");

  // Resolve the active guild ID from:
  //   1. URL param (?guildId=xxx)
  //   2. Config monitorGuildId
  //   3. First available guild from /api/guilds
  //   4. Empty (user needs to select)
  const resolveGuild = useCallback(() => {
    if (urlGuildId) return urlGuildId;
    if (config?.monitorGuildId) return config.monitorGuildId;
    if (guilds.length > 0) return guilds[0].id;
    return "";
  }, [urlGuildId, config?.monitorGuildId, guilds]);

  // Fetch guilds list from backend
  useEffect(() => {
    let cancelled = false;
    setGuildsLoading(true);
    setGuildsError(null);
    voiceApi
      .getGuilds()
      .then((g) => {
        if (!cancelled) setGuilds(g);
      })
      .catch((err) => {
        if (!cancelled)
          setGuildsError(
            err instanceof Error ? err.message : "Failed to load guilds",
          );
      })
      .finally(() => {
        if (!cancelled) setGuildsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve guild ID once config and guilds are loaded
  useEffect(() => {
    if (configLoading || guildsLoading) return;
    const resolved = resolveGuild();
    if (resolved && resolved !== selectedGuildId) {
      setSelectedGuildId(resolved);
    }
  }, [configLoading, guildsLoading, resolveGuild, selectedGuildId]);

  const handleGuildChange = useCallback((guildId: string | null) => {
    if (guildId) setSelectedGuildId(guildId);
  }, []);

  const handleRetry = useCallback(() => {
    setGuildsLoading(true);
    setGuildsError(null);
    voiceApi
      .getGuilds()
      .then(setGuilds)
      .catch((err) =>
        setGuildsError(
          err instanceof Error ? err.message : "Failed to load guilds",
        ),
      )
      .finally(() => setGuildsLoading(false));
  }, []);

  const isReady = !configLoading && !guildsLoading;

  return (
    <div className="space-y-5">
      {/* Guild selector bar */}
      <GuildBar
        guilds={guilds}
        loading={guildsLoading}
        error={guildsError}
        selectedGuildId={selectedGuildId}
        onChange={handleGuildChange}
        onRetry={handleRetry}
      />

      {/* Main panel */}
      {isReady ? (
        <div className="animate-fade-in-up">
          {tab === "live" && <LivePanel />}
          {tab === "dashboard" && <DashboardPanel guildId={selectedGuildId} />}
          {tab === "messages" && <MessagesPanel guildId={selectedGuildId} />}
        </div>
      ) : (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading dashboard…</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Guild Bar ────────────────────────────────────

function GuildBar({
  guilds,
  loading,
  error,
  selectedGuildId,
  onChange,
  onRetry,
}: {
  guilds: Guild[];
  loading: boolean;
  error: string | null;
  selectedGuildId: string;
  onChange: (id: string | null) => void;
  onRetry: () => void;
}) {
  // No guild bar if there's only one guild and it's already selected
  if (guilds.length <= 1 && !loading && !error) return null;

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
        <Button variant="outline" size="sm" onClick={onRetry}>
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
      <Select value={selectedGuildId} onValueChange={onChange}>
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
