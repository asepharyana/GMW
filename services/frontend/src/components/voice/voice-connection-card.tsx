"use client";

import { Headphones, Loader2, Radio, RadioOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface VoiceConnectionCardProps {
  selectedGuild: string;
  onGuildChange: (guildId: string | null) => void;
  selectedChannel: string;
  onChannelChange: (channelId: string) => void;
  guilds: Array<{ id: string; name: string }>;
  voiceChannels: Array<{ id: string; name: string }>;
  connected: boolean;
  activeChannelName: string | null | undefined;
  connectMut: {
    mutate: (args: { guildId: string; channelId: string }) => void;
    isPending: boolean;
  };
  disconnectMut: {
    mutate: () => void;
    isPending: boolean;
  };
}

export function VoiceConnectionCard({
  selectedGuild,
  onGuildChange,
  selectedChannel,
  onChannelChange,
  guilds,
  voiceChannels,
  connected,
  activeChannelName,
  connectMut,
  disconnectMut,
}: VoiceConnectionCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-primary" />
            Voice Connection
          </div>
          <Badge
            variant={connected ? "default" : "secondary"}
            className={cn(
              connected &&
                "bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/20",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full mr-1.5 inline-block",
                connected
                  ? "bg-green-500 shadow-[0_0_6px] shadow-green-500/60"
                  : "bg-muted-foreground",
              )}
            />
            {connected ? "Connected" : "Disconnected"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected && activeChannelName && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Headphones className="size-4" />
            Connected to{" "}
            <span className="font-medium text-foreground">
              {activeChannelName}
            </span>
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selectedGuild} onValueChange={onGuildChange}>
            <SelectTrigger className="flex-1 h-9">
              <SelectValue placeholder="Select guild…" />
            </SelectTrigger>
            <SelectContent>
              {guilds.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedChannel}
            onValueChange={(v) => v && onChannelChange(v)}
            disabled={!selectedGuild}
          >
            <SelectTrigger className="flex-1 h-9">
              <SelectValue placeholder="Select channel…" />
            </SelectTrigger>
            <SelectContent>
              {voiceChannels.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {connected ? (
            <Button
              variant="destructive"
              onClick={() => disconnectMut.mutate()}
              disabled={disconnectMut.isPending}
            >
              {disconnectMut.isPending ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <RadioOff className="size-4 mr-1.5" />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={() =>
                connectMut.mutate({
                  guildId: selectedGuild,
                  channelId: selectedChannel,
                })
              }
              disabled={
                connectMut.isPending || !selectedGuild || !selectedChannel
              }
            >
              {connectMut.isPending ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <Radio className="size-4 mr-1.5" />
              )}
              Connect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
