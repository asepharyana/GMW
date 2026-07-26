"use client";

import {
  Headphones,
  Loader2,
  Mic,
  Radio,
  RadioOff,
  UserCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
import { Switch } from "@/components/ui/switch";
import {
  useGuilds,
  useMicTransmit,
  useSpeakers,
  useVoiceChannels,
  useVoiceConnect,
  useVoiceDisconnect,
  useVoiceStatus,
} from "@/hooks";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export default function VoicePage() {
  const ws = useWebSocket();
  const { data: voiceStatus } = useVoiceStatus();
  const { data: guilds = [] } = useGuilds();
  const { channels: voiceChannels, fetch: fetchChannels } = useVoiceChannels();
  const { speakers, subscribe } = useSpeakers();
  const connectMut = useVoiceConnect();
  const disconnectMut = useVoiceDisconnect();
  const micMut = useMicTransmit();

  const [selectedGuild, setSelectedGuild] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("");
  const [micActive, setMicActive] = useState(false);

  useEffect(() => {
    const unsub = subscribe(ws);
    return () => unsub();
  }, [ws, subscribe]);

  const handleGuildChange = useCallback(
    (guildId: string | null) => {
      if (!guildId) {
        setSelectedGuild("");
        setSelectedChannel("");
        return;
      }
      setSelectedGuild(guildId);
      setSelectedChannel("");
      fetchChannels(guildId);
    },
    [fetchChannels],
  );

  const activeSpeakers = speakers.filter((s) => s.speaking);
  const connected = voiceStatus?.connected;

  return (
    <div className="space-y-5 animate-fade-in-up">
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
          {connected && voiceStatus?.activeChannelName && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Headphones className="size-4" />
              Connected to{" "}
              <span className="font-medium text-foreground">
                {voiceStatus.activeChannelName}
              </span>
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={selectedGuild} onValueChange={handleGuildChange}>
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
              onValueChange={(v) => v && setSelectedChannel(v)}
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

      {activeSpeakers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <UserCheck className="size-4 text-primary" />
              Active Speakers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {activeSpeakers.map((s) => (
                <div
                  key={s.userId}
                  className="flex items-center gap-2 rounded-full border border-border/50 bg-card px-3 py-1.5 shadow-sm"
                >
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full rounded-full bg-green-400 opacity-75 live-pulse-ring" />
                    <span className="relative inline-flex size-2 rounded-full bg-green-500" />
                  </span>
                  <span className="text-sm">{s.username}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Mic className="size-4 text-primary" />
              Microphone
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {micActive ? "On" : "Off"}
              </span>
              <Switch
                checked={micActive}
                onCheckedChange={async (checked) => {
                  setMicActive(checked);
                  try {
                    await micMut.mutateAsync(checked);
                  } catch {
                    setMicActive(!checked);
                  }
                }}
                disabled={!connected}
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!connected && (
            <p className="text-xs text-muted-foreground">
              Connect to a voice channel first.
            </p>
          )}
          {micActive && (
            <div className="flex items-center gap-2 mt-1">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-red-400 opacity-75 live-pulse-ring" />
                <span className="relative inline-flex size-2 rounded-full bg-red-500" />
              </span>
              <span className="text-sm text-muted-foreground">
                Transmitting…
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
