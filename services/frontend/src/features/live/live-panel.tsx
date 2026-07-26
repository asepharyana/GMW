"use client";

import {
  Disc3,
  Download,
  Headphones,
  Loader2,
  Mic,
  Music,
  Play,
  Radio,
  RadioOff,
  SkipForward,
  Square,
  Trash2,
  UserCheck,
  Volume2,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { recordingsApi, voiceApi } from "@/lib/api";
import type {
  ActiveSpeaker,
  MediaState,
  VoiceRecording,
  VoiceStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export function LivePanel() {
  const ws = useWebSocket();

  // Voice
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [speakers, setSpeakers] = useState<ActiveSpeaker[]>([]);
  const [guilds, setGuilds] = useState<Array<{ id: string; name: string }>>([]);
  const [voiceChannels, setVoiceChannels] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedGuild, setSelectedGuild] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [micActive, setMicActive] = useState(false);

  // Media
  const [mediaState, setMediaState] = useState<MediaState | null>(null);
  const [queueUrl, setQueueUrl] = useState("");

  // Recordings
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [_recordingsCursor, setRecordingsCursor] = useState<string | null>(
    null,
  );
  const [_recordingsHasMore, setRecordingsHasMore] = useState(false);

  const fetchVoiceStatus = useCallback(async () => {
    try {
      const status = await voiceApi.getStatus();
      setVoiceStatus(status);
    } catch {
      // ignore
    }
  }, []);

  const fetchGuilds = useCallback(async () => {
    try {
      const g = await voiceApi.getGuilds();
      setGuilds(g);
    } catch {
      // ignore
    }
  }, []);

  const fetchRecordings = useCallback(async () => {
    try {
      const result = await recordingsApi.list(20);
      setRecordings(result.items);
      setRecordingsCursor(result.nextCursor);
      setRecordingsHasMore(result.hasMore);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchVoiceStatus();
    fetchGuilds();
    fetchRecordings();
  }, [fetchVoiceStatus, fetchGuilds, fetchRecordings]);

  const fetchMediaStatus = useCallback(async () => {
    try {
      const state = await voiceApi.getMediaStatus();
      setMediaState(state);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchMediaStatus();
  }, [fetchMediaStatus]);

  // WS subscriptions
  useEffect(() => {
    const unsubSpeaker = ws.on("voice_active_user", (user) => {
      const speaker = user as ActiveSpeaker;
      setSpeakers((prev) => {
        const existing = prev.findIndex((s) => s.userId === speaker.userId);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = speaker;
          return next;
        }
        return [...prev, speaker];
      });
    });

    const unsubMedia = ws.on("media_state", (state) => {
      setMediaState(state as MediaState);
    });

    const unsubRecording = ws.on("voice_recording_uploaded", (rec) => {
      setRecordings((prev) => [rec as VoiceRecording, ...prev]);
    });

    return () => {
      unsubSpeaker();
      unsubMedia();
      unsubRecording();
    };
  }, [ws]);

  const handleGuildChange = useCallback(async (guildId: string | null) => {
    if (!guildId) {
      setSelectedGuild("");
      setVoiceChannels([]);
      return;
    }
    setSelectedGuild(guildId);
    setSelectedChannel("");
    try {
      const channels = await voiceApi.getVoiceChannels(guildId);
      setVoiceChannels(channels);
    } catch {
      setVoiceChannels([]);
    }
  }, []);

  const handleConnect = useCallback(async () => {
    if (!selectedGuild || !selectedChannel) return;
    setVoiceLoading(true);
    try {
      const status = await voiceApi.connect(selectedGuild, selectedChannel);
      setVoiceStatus(status);
    } finally {
      setVoiceLoading(false);
    }
  }, [selectedGuild, selectedChannel]);

  const handleDisconnect = useCallback(async () => {
    setVoiceLoading(true);
    try {
      const status = await voiceApi.disconnect();
      setVoiceStatus(status);
    } finally {
      setVoiceLoading(false);
    }
  }, []);

  const handleQueueMedia = useCallback(async () => {
    if (!queueUrl.trim()) return;
    try {
      const state = await voiceApi.mediaQueue(queueUrl.trim(), "music");
      setMediaState(state);
      setQueueUrl("");
    } catch {
      // ignore
    }
  }, [queueUrl]);

  const handleSkip = useCallback(async () => {
    try {
      const state = await voiceApi.mediaSkip();
      setMediaState(state);
    } catch {
      // ignore
    }
  }, []);

  const handleStop = useCallback(async () => {
    try {
      const state = await voiceApi.mediaStop();
      setMediaState(state);
    } catch {
      // ignore
    }
  }, []);

  const handleVolume = useCallback(
    async (value: number | readonly number[]) => {
      const vol = Array.isArray(value) ? value[0] : value;
      try {
        const state = await voiceApi.mediaVolume(vol);
        setMediaState(state);
      } catch {
        // ignore
      }
    },
    [],
  );

  const handleDeleteRecording = useCallback(async (id: string) => {
    try {
      await recordingsApi.delete(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Voice Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-primary" />
              Voice Connection
            </div>
            <Badge
              variant={voiceStatus?.connected ? "default" : "secondary"}
              className={cn(
                voiceStatus?.connected &&
                  "bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/20",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full mr-1.5 inline-block",
                  voiceStatus?.connected
                    ? "bg-green-500 shadow-[0_0_6px] shadow-green-500/60"
                    : "bg-muted-foreground",
                )}
              />
              {voiceStatus?.connected ? "Connected" : "Disconnected"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {voiceStatus?.connected && voiceStatus.activeChannelName && (
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
            {voiceStatus?.connected ? (
              <Button
                variant="destructive"
                onClick={handleDisconnect}
                disabled={voiceLoading}
              >
                {voiceLoading ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : (
                  <RadioOff className="size-4 mr-1.5" />
                )}
                Disconnect
              </Button>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={voiceLoading || !selectedGuild || !selectedChannel}
              >
                {voiceLoading ? (
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

      {/* Active Speakers */}
      {speakers.filter((s) => s.speaking).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <UserCheck className="size-4 text-primary" />
              Active Speakers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {speakers
                .filter((s) => s.speaking)
                .map((s) => (
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

      {/* Music Player */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Music className="size-4 text-primary" />
            Music Player
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Queue URL */}
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Queue a URL (YouTube, audio file…)"
              value={queueUrl}
              onChange={(e) => setQueueUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQueueMedia()}
              className="flex-1 h-9"
            />
            <Button onClick={handleQueueMedia} disabled={!queueUrl.trim()}>
              <Play className="size-4 mr-1.5" />
              Queue
            </Button>
          </div>

          {/* Now Playing */}
          {mediaState?.current && (
            <div className="rounded-lg bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10 p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Disc3 className="size-3" />
                Now Playing
              </p>
              <div className="flex items-start gap-3">
                {mediaState.current.thumbnailUrl && (
                  <Image
                    src={mediaState.current.thumbnailUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="size-14 rounded-lg object-cover shadow-sm"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {mediaState.current.title ?? mediaState.current.source}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {mediaState.current.durationMs
                      ? `${Math.floor(mediaState.current.durationMs / 60000)}:${String(
                          Math.floor(
                            (mediaState.current.durationMs % 60000) / 1000,
                          ),
                        ).padStart(2, "0")}`
                      : "Live"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleStop}>
              <Square className="size-4 mr-1" />
              Stop
            </Button>
            <Button variant="outline" size="sm" onClick={handleSkip}>
              <SkipForward className="size-4 mr-1" />
              Skip
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <Volume2 className="size-4 text-muted-foreground" />
              <Slider
                className="w-24"
                defaultValue={[mediaState?.musicVolume ?? 0.5]}
                value={[mediaState?.musicVolume ?? 0.5]}
                onValueChange={handleVolume}
                min={0}
                max={1}
                step={0.05}
              />
            </div>
          </div>

          {/* Queue */}
          {mediaState && mediaState.queue.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">
                Queue ({mediaState.queue.length})
              </p>
              <div className="space-y-1">
                {mediaState.queue.map((item, i) => (
                  <div
                    key={item.id ?? i}
                    className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span className="text-xs text-muted-foreground font-mono w-5 text-right">
                      {i + 1}.
                    </span>
                    <span className="truncate flex-1">
                      {item.title ?? item.source}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Microphone */}
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
                    await voiceApi.sendCommand(
                      checked ? "voice:transmit:start" : "voice:transmit:stop",
                    );
                  } catch {
                    setMicActive(!checked);
                  }
                }}
                disabled={!voiceStatus?.connected}
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!voiceStatus?.connected && (
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

      {/* Recordings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Headphones className="size-4 text-primary" />
            Voice Recordings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recordings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No recordings yet.
            </p>
          ) : (
            <div className="space-y-2">
              {recordings.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
                >
                  <Avatar className="size-8">
                    <AvatarImage src={rec.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {(rec.username ?? "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {rec.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rec.channel_name ?? rec.channel_id ?? "Unknown channel"}
                      {" — "}
                      {new Date(rec.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono shrink-0"
                  >
                    {formatBytes(rec.size_bytes)}
                  </Badge>
                  {rec.download_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(rec.download_url!, "_blank")}
                    >
                      <Download className="size-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteRecording(rec.id)}
                    className="hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
