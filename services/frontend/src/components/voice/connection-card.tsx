"use client";

import { Headphones, Server, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Channel, Guild } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConnectionCardProps {
  connected: boolean;
  activeChannelName?: string | null;
  guilds: Guild[];
  voiceChannels: Channel[];
  selectedGuild: string;
  selectedChannel: string;
  onGuildChange: (guildId: string | null) => void;
  onChannelChange: (channelId: string | null) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  connecting?: boolean;
}

export function VoiceConnectionCard({
  connected,
  activeChannelName,
  guilds,
  voiceChannels,
  selectedGuild,
  selectedChannel,
  onGuildChange,
  onChannelChange,
  onConnect,
  onDisconnect,
  connecting,
}: ConnectionCardProps) {
  return (
    <Card
      className={cn(
        connected && "ring-2 ring-primary/30",
        "[--card-spacing:0px]",
        "rounded-2xl",
        "p-5",
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <span
          className={cn(
            "relative flex size-3",
            connected && "text-emerald-500",
          )}
        >
          <span
            className={cn(
              "absolute inline-flex size-full rounded-full opacity-75",
              connected
                ? "bg-emerald-500 animate-pulse-ring"
                : "bg-destructive",
            )}
          />
          <span
            className={cn(
              "relative inline-flex size-3 rounded-full",
              connected ? "bg-emerald-500" : "bg-destructive",
            )}
          />
        </span>
        <div>
          <span className="text-sm font-semibold text-text-primary">
            Voice Connection
          </span>
          {activeChannelName && (
            <span className="text-xs text-text-secondary/60 ml-2 font-mono">
              {activeChannelName}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {connected ? (
            <Button size="sm" variant="destructive" onClick={onDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onConnect}
              disabled={!selectedGuild || !selectedChannel || connecting}
            >
              {connecting ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Guild select */}
        <div className="space-y-1.5">
          <label
            htmlFor="voice-guild-select"
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary/50"
          >
            <Server className="size-3" />
            Server / Guild
          </label>
          <Select
            value={selectedGuild}
            onValueChange={(v) => {
              onGuildChange(v);
              onChannelChange("");
            }}
          >
            <SelectTrigger id="voice-guild-select" className="h-10">
              <SelectValue placeholder="Pilih server…">
                {guilds.find((g) => g.id === selectedGuild)?.name}
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
              {guilds.length === 0 && (
                <div className="px-3 py-2 text-xs text-text-secondary/60">
                  Tidak ada server — pastikan gateway Discord terhubung.
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Channel select */}
        <div className="space-y-1.5">
          <label
            htmlFor="voice-channel-select"
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary/50"
          >
            <Volume2 className="size-3" />
            Voice Channel
          </label>
          <Select
            value={selectedChannel}
            onValueChange={onChannelChange}
            disabled={!selectedGuild}
          >
            <SelectTrigger id="voice-channel-select" className="h-10">
              <SelectValue placeholder="Pilih channel…">
                {voiceChannels.find((c) => c.id === selectedChannel)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {voiceChannels.map((c) => (
                <SelectItem
                  key={c.id}
                  value={c.id}
                  disabled={c.joinable === false}
                >
                  <span className="flex items-center gap-2">
                    <Headphones className="size-4 text-muted-foreground" />
                    <span className="line-clamp-1">{c.name}</span>
                    {c.joinable === false && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        no akses
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
              {voiceChannels.length === 0 && (
                <div className="px-3 py-2 text-xs text-text-secondary/60">
                  {selectedGuild
                    ? "Tidak ada voice channel di server ini"
                    : "Pilih server dulu"}
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}
