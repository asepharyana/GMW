"use client";

import {
  Moon,
  Server,
  Shield,
  Sun,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { configApi } from "@/lib/api";
import type { AppConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export default function SettingsPage() {
  const { status } = useWebSocket();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    configApi
      .get()
      .then(setConfig)
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  };

  const statusConfig = {
    connected: {
      label: "Connected",
      variant: "default" as const,
      dot: "bg-green-500 shadow-[0_0_6px] shadow-green-500/60",
    },
    connecting: {
      label: "Connecting",
      variant: "secondary" as const,
      dot: "bg-yellow-500 animate-pulse",
    },
    disconnected: {
      label: "Disconnected",
      variant: "destructive" as const,
      dot: "bg-destructive",
    },
    error: {
      label: "Error",
      variant: "destructive" as const,
      dot: "bg-destructive",
    },
  }[status];

  return (
    <div className="space-y-5 animate-fade-in-up max-w-2xl">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Wifi className="size-4 text-primary" />
            Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">WebSocket</span>
            <Badge
              variant={statusConfig.variant}
              className="gap-1.5 px-2.5 py-1"
            >
              <span
                className={cn("size-1.5 rounded-full", statusConfig.dot)}
              />
              {statusConfig.label}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            {theme === "dark" ? (
              <Moon className="size-4 text-primary" />
            ) : (
              <Sun className="size-4 text-primary" />
            )}
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center justify-between w-full text-sm cursor-pointer"
          >
            <span>Theme</span>
            <Badge variant="outline" className="capitalize">
              {theme}
            </Badge>
          </button>
        </CardContent>
      </Card>

      {/* Server Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Server className="size-4 text-primary" />
            Server Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : config ? (
            <div className="space-y-2 text-sm">
              <ConfigRow
                label="Monitor Guild"
                value={config.monitorGuildId ?? "Not configured"}
              />
              <Separator />
              <ConfigRow
                label="Voice Guild"
                value={config.voiceGuildId ?? "Not configured"}
              />
              <Separator />
              <ConfigRow
                label="Voice Channel"
                value={config.voiceChannelId ?? "Not configured"}
              />
              <Separator />
              <ConfigRow
                label="AI Analysis"
                value={config.aiAnalysisEnabled ? "Enabled" : "Disabled"}
              />
              <Separator />
              <ConfigRow
                label="Auto-Delete Flagged"
                value={
                  config.autoDeleteFlaggedEnabled ? "Enabled" : "Disabled"
                }
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Unable to load configuration.
            </p>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="size-4 text-primary" />
            About
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-1">
            <p>
              <span className="text-gradient font-bold">Bete</span> — Discord
              Moderation Watcher
            </p>
            <p className="text-xs text-muted-foreground">
              AI-powered message moderation, voice recording, and real-time
              monitoring for Discord communities.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs max-w-[280px] truncate text-right">
        {value}
      </span>
    </div>
  );
}
