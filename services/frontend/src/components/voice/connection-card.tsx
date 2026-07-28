"use client";

import { GlassCard } from "@/components/glass/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ConnectionCardProps {
  connected: boolean;
  activeChannelName?: string | null;
  guilds: { id: string; name: string }[];
  voiceChannels: { id: string; name: string }[];
  selectedGuild: string;
  selectedChannel: string;
  onGuildChange: (guildId: string | null) => void;
  onChannelChange: (channelId: string | null) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  connecting?: boolean;
}

export function VoiceConnectionCard({
  connected, activeChannelName, guilds, voiceChannels,
  selectedGuild, selectedChannel,
  onGuildChange, onChannelChange, onConnect, onDisconnect, connecting,
}: ConnectionCardProps) {
  return (
    <GlassCard variant={connected ? "elevated" : "base"}>
      <div className="flex items-center gap-3 mb-4">
        <span className={cn(
          "relative flex size-3",
          connected && "text-emerald-500",
        )}>
          <span className={cn(
            "absolute inline-flex size-full rounded-full opacity-75",
            connected ? "bg-emerald-500 animate-pulse-ring" : "bg-destructive",
          )} />
          <span className={cn(
            "relative inline-flex size-3 rounded-full",
            connected ? "bg-emerald-500" : "bg-destructive",
          )} />
        </span>
        <div>
          <span className="text-sm font-semibold text-text-primary">Voice Connection</span>
          {activeChannelName && (
            <span className="text-xs text-text-secondary/60 ml-2 font-mono">{activeChannelName}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {connected ? (
            <Button size="sm" variant="destructive" onClick={onDisconnect}>Disconnect</Button>
          ) : (
            <Button size="sm" onClick={onConnect} disabled={!selectedGuild || !selectedChannel || connecting}>
              {connecting ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select value={selectedGuild} onValueChange={(v) => { onGuildChange(v ?? null); onChannelChange(""); }}>
          <SelectTrigger className="h-8 glass border-glass-border text-xs">
            <SelectValue placeholder="Select guild" />
          </SelectTrigger>
          <SelectContent>
            {guilds.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedChannel} onValueChange={onChannelChange} disabled={!selectedGuild}>
          <SelectTrigger className="h-8 glass border-glass-border text-xs">
            <SelectValue placeholder="Select channel" />
          </SelectTrigger>
          <SelectContent>
            {voiceChannels.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </GlassCard>
  );
}
