"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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

  const handleGuildChange = useCallback((guildId: string) => {
    setSelectedGuildId(guildId);
  }, []);

  const isReady = !configLoading && !guildsLoading;

  return (
    <div className="space-y-4">
      {/* Guild selector bar */}
      <GuildBar
        guilds={guilds}
        loading={guildsLoading}
        error={guildsError}
        selectedGuildId={selectedGuildId}
        onChange={handleGuildChange}
        onRetry={() => {
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
        }}
      />

      {/* Main panel */}
      {isReady ? (
        <>
          {tab === "live" && <LivePanel />}
          {tab === "dashboard" && <DashboardPanel guildId={selectedGuildId} />}
          {tab === "messages" && <MessagesPanel guildId={selectedGuildId} />}
        </>
      ) : (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
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
  onChange: (id: string) => void;
  onRetry: () => void;
}) {
  // No guild bar if there's only one guild and it's already selected
  if (guilds.length <= 1 && !loading && !error) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading guilds…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm text-muted-foreground">
          Could not load guilds: {error}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors"
        >
          <RefreshCw className="size-3" />
          Retry
        </button>
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
        <p className="text-sm text-muted-foreground">
          No guilds available. Make sure the Discord gateway is connected.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border p-3">
      <label
        htmlFor="guild-select"
        className="text-sm font-medium text-muted-foreground whitespace-nowrap"
      >
        Guild:
      </label>
      <select
        id="guild-select"
        value={selectedGuildId}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm"
      >
        {guilds.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );
}
