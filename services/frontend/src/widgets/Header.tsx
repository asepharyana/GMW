import { motion } from "framer-motion";
import { Wifi, WifiOff } from "lucide-react";
import type { DashboardTab, VoiceStatus } from "../shared/api/client";
import { fadeSlideUp } from "../shared/hooks/useFramerStagger";
import { cn } from "../shared/lib/utils";
import { Badge } from "../shared/ui";
import type { WsStatus } from "../shared/ws/socket";

const titles: Record<DashboardTab, string> = {
  messages: "Messages & Moderation",
  live: "Voice & Media",
  dashboard: "Dashboard",
};

const subtitles: Record<DashboardTab, string> = {
  messages: "Capture, analyse, and moderate Discord messages.",
  live: "Join voice channels, play media, stream audio, and browse recordings.",
  dashboard: "Server statistics, user profiles, and AI moderation overview.",
};

interface HeaderProps {
  activeTab: DashboardTab;
  wsStatus: WsStatus;
  voiceStatus: VoiceStatus;
}

/** Dot indicator colour for WS badge */
function wsDotColor(status: WsStatus): string {
  switch (status) {
    case "connected":
      return "bg-emerald-400";
    case "error":
      return "bg-red-400";
    case "connecting":
    case "disconnected":
      return "bg-gray-400";
  }
}

function WsIndicator({ status }: { status: WsStatus }) {
  const dot = wsDotColor(status);
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2 w-2 rounded-full", dot)} />
      <span className="text-xs font-medium capitalize">{status}</span>
    </div>
  );
}

/** Voice status indicator dot */
function VoiceIndicator({ voiceStatus }: { voiceStatus: VoiceStatus }) {
  const isConnected = voiceStatus.connected;
  const dot = isConnected ? "bg-primary" : "bg-gray-300";
  const label = isConnected
    ? voiceStatus.activeChannelName || "connected"
    : "idle";
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2 w-2 rounded-full", dot)} />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

export function Header({ activeTab, wsStatus, voiceStatus }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/50 bg-background/70 px-4 py-4 backdrop-blur-sm md:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Left: IMPHNEN brand + tab title */}
        <motion.div
          key={activeTab}
          variants={fadeSlideUp}
          initial="initial"
          animate="animate"
          className="flex items-center gap-3"
        >
          <div className="flex items-center gap-3">
            <img
              src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/docs/logo.svg"
              alt="IMPHNEN"
              className="h-7 w-7"
            />
            <h1 className="text-xl font-bold tracking-tight">
              <span className="gradient-text">IMPHNEN</span>
              <span className="mx-2 text-muted-foreground">·</span>
              {titles[activeTab]}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground hidden md:block">
            {subtitles[activeTab]}
          </p>
        </motion.div>

        {/* Right: status badges */}
        <div className="flex flex-wrap items-center gap-2">
          {/* WS Badge */}
          <Badge
            variant="outline"
            className="border-border bg-card/50 px-3 py-1.5 text-xs text-muted-foreground"
          >
            {wsStatus === "connected" ? (
              <Wifi className="mr-1.5 h-3 w-3 text-emerald-400" />
            ) : (
              <WifiOff className="mr-1.5 h-3 w-3 text-red-400" />
            )}
            <WsIndicator status={wsStatus} />
          </Badge>

          {/* Voice Badge */}
          <Badge
            variant="outline"
            className={cn(
              "border-border bg-card/50 px-3 py-1.5 text-xs",
              voiceStatus.connected ? "text-primary" : "text-muted-foreground",
            )}
          >
            <VoiceIndicator voiceStatus={voiceStatus} />
          </Badge>
        </div>
      </div>
    </header>
  );
}
