"use client";

import { Moon, Server, Shield, Sun, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/glass/card";
import { GlassDivider } from "@/components/glass/divider";
import { SubNav } from "@/components/layout/sub-nav";
import { LoadingSkeleton } from "@/components/shared";
import { useConfig } from "@/hooks";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

type SettingsTab = "connection" | "appearance" | "config" | "about";

export default function SettingsPage() {
  const { status } = useWebSocket();
  const { data: config, isLoading: configLoading } = useConfig();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [tab, setTab] = useState<SettingsTab>("connection");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    if (stored) setTheme(stored);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  };

  const statusDot = {
    connected:
      "bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60 animate-pulse",
    connecting: "bg-accent-amber animate-pulse",
    disconnected: "bg-destructive",
    error: "bg-destructive",
  }[status];

  const statusLabel = {
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Disconnected",
    error: "Error",
  }[status];

  return (
    <div className="space-y-4 animate-fade-in-up max-w-2xl">
      <SubNav
        tabs={[
          {
            id: "connection",
            label: "Connection",
            icon: <Wifi className="size-3" />,
          },
          {
            id: "appearance",
            label: "Appearance",
            icon: <Sun className="size-3" />,
          },
          {
            id: "config",
            label: "Config",
            icon: <Server className="size-3" />,
          },
          { id: "about", label: "About", icon: <Shield className="size-3" /> },
        ]}
        activeTab={tab}
        onTabChange={(t) => setTab(t as SettingsTab)}
      />

      {tab === "connection" && (
        <GlassCard variant="base">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-text-primary">
                WebSocket
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", statusDot)} />
              <span className="text-xs font-mono text-text-secondary">
                {statusLabel}
              </span>
            </div>
          </div>
        </GlassCard>
      )}

      {tab === "appearance" && (
        <GlassCard variant="base">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {theme === "dark" ? (
                <Moon className="size-4 text-primary" />
              ) : (
                <Sun className="size-4 text-primary" />
              )}
              <span className="text-sm font-semibold text-text-primary">
                Theme
              </span>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md glass hover:glass-elevated transition-all text-xs"
            >
              <span className="font-mono">{theme}</span>
            </button>
          </div>
        </GlassCard>
      )}

      {tab === "config" && (
        <GlassCard variant="base">
          <div className="space-y-3">
            {configLoading ? (
              <LoadingSkeleton count={6} height="h-6" />
            ) : config ? (
              <>
                <ConfigRow
                  label="Monitor Guild"
                  value={config.monitorGuildId || "Not configured"}
                />
                <GlassDivider />
                <ConfigRow
                  label="Voice Guild"
                  value={config.voiceGuildId || "Not configured"}
                />
                <GlassDivider />
                <ConfigRow
                  label="Voice Channel"
                  value={config.voiceChannelId || "Not configured"}
                />
                <GlassDivider />
                <ConfigRow
                  label="AI Analysis"
                  value={config.aiAnalysisEnabled ? "Enabled" : "Disabled"}
                />
                <GlassDivider />
                <ConfigRow
                  label="Auto-Delete Flagged"
                  value={
                    config.autoDeleteFlaggedEnabled ? "Enabled" : "Disabled"
                  }
                />
              </>
            ) : (
              <p className="text-xs text-text-secondary/60">
                Unable to load config.
              </p>
            )}
          </div>
        </GlassCard>
      )}

      {tab === "about" && (
        <GlassCard variant="base">
          <div className="space-y-2">
            <h2 className="text-base font-bold text-primary">
              Discord Automod
            </h2>
            <p className="text-xs text-text-secondary/80 leading-relaxed">
              AI-powered message moderation, voice recording, and real-time
              monitoring for Discord communities.
            </p>
            <div className="text-[10px] font-mono text-text-secondary/40 mt-4">
              v0.1.0
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-[11px] font-mono text-text-primary/80 max-w-[240px] truncate text-right">
        {value}
      </span>
    </div>
  );
}
