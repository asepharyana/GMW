import { Moon, Shield, ShieldOff, Sun, Wifi, WifiOff } from "lucide-react";
import type { VoiceStatus } from "../entities/voice/types.js";
import { useTheme } from "../shared/hooks/useTheme";
import { cn } from "../shared/lib/utils";
import { Badge } from "../shared/ui";
import type { WsStatus } from "../shared/ws/socket";

/* ─── Theme Toggle ─────────────────────────────────────────────────────── */
function ThemeToggle() {
  const { resolvedTheme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-lg p-2 text-[#666666] hover:bg-[#f0f0f0] hover:text-[#1a1a1a] transition-colors duration-150"
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/* ─── WS Indicator ─────────────────────────────────────────────────────── */
function WsIndicator({ status }: { status: WsStatus }) {
  const isConnected = status === "connected";
  return (
    <div className="flex items-center gap-1.5">
      {isConnected ? (
        <Wifi className="h-3 w-3 text-[#22c55e]" />
      ) : (
        <WifiOff className="h-3 w-3 text-[#e4405f]" />
      )}
      <span
        className={cn(
          "text-xs font-medium",
          isConnected ? "text-[#22c55e]" : "text-[#e4405f]",
        )}
      >
        {status === "connected"
          ? "Online"
          : status === "connecting"
            ? "Nyambung..."
            : status === "error"
              ? "Error"
              : "Putus"}
      </span>
    </div>
  );
}

/* ─── Voice Indicator ──────────────────────────────────────────────────── */
function VoiceIndicator({ voiceStatus }: { voiceStatus: VoiceStatus }) {
  const isConnected = voiceStatus.connected;
  return (
    <div className="flex items-center gap-1.5">
      {isConnected ? (
        <Shield className="h-3 w-3 text-[#23a1eb]" />
      ) : (
        <ShieldOff className="h-3 w-3 text-[#999999]" />
      )}
      <span
        className={cn(
          "text-xs font-medium",
          isConnected ? "text-[#23a1eb]" : "text-[#999999]",
        )}
      >
        {isConnected
          ? voiceStatus.activeChannelName || "Tersambung"
          : "Siaga"}
      </span>
    </div>
  );
}

/* ─── Main Header ──────────────────────────────────────────────────────── */
interface HeaderProps {
  wsStatus: WsStatus;
  voiceStatus: VoiceStatus;
}

export function Header({ wsStatus, voiceStatus }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-[#e0e0e0]/50 bg-white/70 backdrop-blur-md px-4 py-3">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between">
        {/* ── Left: Logo + Brand ──────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <img
            src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/docs/logo.svg"
            alt="IMPHNEN"
            className="h-8 w-8"
          />
          <h1 className="font-sans text-lg font-bold tracking-tight text-[#1a1a1a]">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#23a1eb] to-[#1877f2]">
              IMPHNEN
            </span>
            <span className="mx-1.5 text-[#666666]">·</span>
            <span className="font-semibold text-[#666666]">
              Guild Watcher
            </span>
          </h1>
        </div>

        {/* ── Right: Status + Theme ──────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "border-[#e0e0e0] bg-white/50 px-2.5 py-1 text-xs",
              wsStatus === "connected"
                ? "text-[#22c55e]"
                : wsStatus === "error"
                  ? "text-[#e4405f]"
                  : "text-[#999999]",
            )}
          >
            <WsIndicator status={wsStatus} />
          </Badge>

          <Badge
            variant="outline"
            className={cn(
              "border-[#e0e0e0] bg-white/50 px-2.5 py-1 text-xs",
              voiceStatus.connected ? "text-[#23a1eb]" : "text-[#666666]",
            )}
          >
            <VoiceIndicator voiceStatus={voiceStatus} />
          </Badge>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
