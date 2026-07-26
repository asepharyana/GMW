"use client";

import {
  Disc3,
  Download,
  Loader2,
  Mic,
  MicOff,
  Play,
  Radio,
  RadioOff,
  SkipForward,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { recordingsApi, voiceApi } from "@/lib/api";
import type {
  ActiveSpeaker,
  MediaState,
  VoiceRecording,
  VoiceStatus,
} from "@/lib/types";
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

  // Media status
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
        const existing = prev.findIndex((s) => s.user_id === speaker.user_id);
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

  // Voice connect handler
  const handleGuildChange = useCallback(async (guildId: string) => {
    setSelectedGuild(guildId);
    setSelectedChannel("");
    if (!guildId) {
      setVoiceChannels([]);
      return;
    }
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

  // Media handlers
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

  const handleVolume = useCallback(async (volume: number) => {
    try {
      const state = await voiceApi.mediaVolume(volume);
      setMediaState(state);
    } catch {
      // ignore
    }
  }, []);

  // Delete recording
  const handleDeleteRecording = useCallback(async (id: string) => {
    try {
      await recordingsApi.delete(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Voice Connection */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Radio className="size-4" />
            Voice Connection
          </h2>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              voiceStatus?.connected
                ? "bg-green-500/15 text-green-600 dark:text-green-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {voiceStatus?.connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {voiceStatus?.connected && voiceStatus.activeChannelName && (
          <p className="text-sm text-muted-foreground">
            Connected to{" "}
            <span className="font-medium text-foreground">
              {voiceStatus.activeChannelName}
            </span>
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedGuild}
            onChange={(e) => handleGuildChange(e.target.value)}
            className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">Select guild…</option>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">Select channel…</option>
            {voiceChannels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {voiceStatus?.connected ? (
            <button
              onClick={handleDisconnect}
              disabled={voiceLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {voiceLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RadioOff className="size-4" />
              )}
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={voiceLoading || !selectedGuild || !selectedChannel}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {voiceLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Radio className="size-4" />
              )}
              Connect
            </button>
          )}
        </div>
      </div>

      {/* Active Speakers */}
      {speakers.filter((s) => s.speaking).length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Active Speakers</h3>
          <div className="flex flex-wrap gap-2">
            {speakers
              .filter((s) => s.speaking)
              .map((s) => (
                <div
                  key={s.user_id}
                  className="flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1.5"
                >
                  <span className="relative flex size-2">
                    <span className="animate-ping absolute inline-flex size-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-green-500" />
                  </span>
                  <span className="text-sm">{s.username}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Music Player */}
      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Disc3 className="size-4" />
          Music Player
        </h2>

        {/* Queue URL */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Queue a URL (YouTube, audio file…)"
            value={queueUrl}
            onChange={(e) => setQueueUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleQueueMedia()}
            className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm"
          />
          <button
            onClick={handleQueueMedia}
            disabled={!queueUrl.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Play className="size-4" />
            Queue
          </button>
        </div>

        {/* Now Playing */}
        {mediaState?.current && (
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Now Playing</p>
            <div className="flex items-start gap-3">
              {mediaState.current.thumbnailUrl && (
                <img
                  src={mediaState.current.thumbnailUrl}
                  alt=""
                  className="size-12 rounded object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {mediaState.current.title ?? mediaState.current.source}
                </p>
                <p className="text-xs text-muted-foreground">
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
          <button
            onClick={handleStop}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Square className="size-4" />
            Stop
          </button>
          <button
            onClick={handleSkip}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            <SkipForward className="size-4" />
            Skip
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <Volume2 className="size-4 text-muted-foreground" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={mediaState?.musicVolume ?? 0.5}
              onChange={(e) => handleVolume(Number(e.target.value))}
              className="w-24 h-2"
            />
          </div>
        </div>

        {/* Queue */}
        {mediaState && mediaState.queue.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Queue ({mediaState.queue.length})
            </p>
            {mediaState.queue.map((item, i) => (
              <div
                key={item.id ?? i}
                className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2"
              >
                <span className="text-xs text-muted-foreground w-4">
                  {i + 1}.
                </span>
                <span className="text-sm truncate flex-1">
                  {item.title ?? item.source}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recordings */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Voice Recordings</h2>
        {recordings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recordings yet.</p>
        ) : (
          <div className="space-y-2">
            {recordings.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{rec.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {rec.channel_name ?? rec.channel_id ?? "Unknown channel"}
                    {" — "}
                    {new Date(rec.created_at).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatBytes(rec.size_bytes)}
                </span>
                {rec.download_url && (
                  <a
                    href={rec.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-md border p-1.5 hover:bg-muted transition-colors"
                  >
                    <Download className="size-4" />
                  </a>
                )}
                <button
                  onClick={() => handleDeleteRecording(rec.id)}
                  className="inline-flex items-center rounded-md border p-1.5 hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Microphone Transmit */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Mic className="size-4" />
            Microphone
          </h2>
          <button
            type="button"
            onClick={async () => {
              setMicActive(!micActive);
              try {
                await voiceApi.sendCommand(
                  micActive ? "voice:transmit:stop" : "voice:transmit:start",
                );
              } catch {
                setMicActive(micActive);
              }
            }}
            disabled={!voiceStatus?.connected}
            data-active={micActive ? "" : undefined}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors data-[active]:bg-destructive data-[active]:text-destructive-foreground hover:bg-muted disabled:opacity-50"
          >
            {micActive ? (
              <MicOff className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
            {micActive ? "Stop" : "Start"}
          </button>
        </div>
        {!voiceStatus?.connected && (
          <p className="text-xs text-muted-foreground">
            Connect to a voice channel first.
          </p>
        )}
        {micActive && (
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex size-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            </span>
            <span className="text-sm text-muted-foreground">Transmitting…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
