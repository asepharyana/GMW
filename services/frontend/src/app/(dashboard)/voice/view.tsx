"use client";

import { Headphones, Loader2, Radio, RadioOff } from "lucide-react";
import { useEffect, useState } from "react";
import { SignalField } from "@/components/three";
import { WebGLGuard } from "@/components/three/webgl-guard";
import { StaticFallback } from "@/components/three/static-fallback";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { Button } from "@/components/primitives/button";
import { Badge } from "@/components/primitives/badge";
import { Select } from "@/components/primitives/select";
import { SpeakerWaveform } from "@/components/voice/speaker-waveform";
import { SessionRibbon } from "@/components/charts/session-ribbon";
import { ActiveSpeakersPanel } from "@/components/voice/active-speakers-panel";
import { MicControl } from "@/components/voice/mic-control";
import { ListenControl } from "@/components/voice/listen-control";
import {
  useGuilds,
  useMicTransmit,
  useSpeakers,
  useVoiceChannels,
  useVoiceConnect,
  useVoiceDisconnect,
  useVoiceListen,
  useVoiceStatus,
} from "@/hooks";
import type { VoiceStatus } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export default function VoiceView({ initialStatus }: { initialStatus?: VoiceStatus }) {
  const ws = useWebSocket();
  const [selectedGuild, setSelectedGuild] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("");

  // Live connection status — SWR revalidates on connect/disconnect (the
  // useVoiceConnect/Disconnect actions invalidate the "voice-status" key),
  // so this reflects real-time state instead of the static SSR snapshot.
  const { data: status } = useVoiceStatus(initialStatus);
  const { speakers, subscribe } = useSpeakers(status?.activeSpeakers ?? []);
  const { data: guilds = [] } = useGuilds();
  const { data: voiceChannels = [] } = useVoiceChannels(selectedGuild);
  const connect = useVoiceConnect();
  const disconnect = useVoiceDisconnect();
  const listen = useVoiceListen(ws);
  const mic = useMicTransmit(ws);
  const [micActive, setMicActive] = useState(false);
  const [micVolume, setMicVolume] = useState(75);

  useEffect(() => {
    const unsub = subscribe(ws);
    return unsub;
  }, [subscribe, ws]);

  const active = speakers.filter((s) => s.speaking);
  const connected = status?.connected ?? false;

  const handleMicToggle = async (on: boolean) => {
    if (on) {
      try {
        await mic.mutateAsync(true);
        setMicActive(true);
      } catch {
        setMicActive(false);
      }
    } else {
      setMicActive(false);
      try {
        await mic.mutateAsync(false);
      } catch {
        // Stop already tore down — ignore remote error
      }
    }
  };

  const handleMicVolume = (v: number) => {
    setMicVolume(v);
    mic.setVolume(v);
  };

  const handleListenVolume = (v: number) => {
    listen.setVolume(v);
  };

  const handleGuildChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const g = e.target.value;
    setSelectedGuild(g);
    setSelectedChannel("");
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Connection bar with guild + voice channel pickers */}
      <div className="surface flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <Badge tone={connected ? "signal" : "neutral"} dot>
            {connected ? "Connected" : "Disconnected"}
          </Badge>
          {connected && status?.activeChannelName && (
            <span className="hidden items-center gap-1.5 text-xs text-[var(--color-ink-soft)] sm:flex">
              <Headphones className="size-3.5" />
              {status.activeChannelName}
            </span>
          )}
        </div>

        {!connected ? (
          <div className="flex flex-wrap gap-2">
            <Select
              value={selectedGuild}
              onChange={handleGuildChange}
              className="flex-1 min-w-[140px] h-9"
            >
              <option value="" disabled>
                Select guild…
              </option>
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>

            <Select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              disabled={!selectedGuild}
              className="flex-1 min-w-[140px] h-9"
            >
              <option value="" disabled>
                Select channel…
              </option>
              {(voiceChannels ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                void connect.mutate({
                  guildId: selectedGuild,
                  channelId: selectedChannel,
                })
              }
              disabled={connect.isPending || !selectedGuild || !selectedChannel}
            >
              {connect.isPending ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <Radio className="size-3.5 mr-1.5" />
              )}
              Connect
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="danger"
            onClick={() => void disconnect.mutate(undefined)}
            disabled={disconnect.isPending}
          >
            {disconnect.isPending ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <RadioOff className="size-3.5 mr-1.5" />
            )}
            Disconnect
          </Button>
        )}
      </div>

      {/* Stage hero */}
      <div className="relative surface h-[280px] items-end justify-center overflow-hidden rounded-[var(--radius-r)] p-5">
        <WebGLGuard
          fallback={
            <StaticFallback
              variant="orb"
              count={Math.max(speakers.length, 3)}
              className="absolute inset-0"
            />
          }
        >
          <SignalField
            activity={speakers.length > 0 ? 0.6 : 0.2}
            className="absolute inset-0"
          />
        </WebGLGuard>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <SpeakerWaveform speakers={active} />
        </div>
      </div>

      <StaggerGroup className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <StaggerItem>
          <MicControl
            micOn={micActive}
            onToggle={handleMicToggle}
            levels={listen.levels}
          />
        </StaggerItem>
        <StaggerItem>
          <ListenControl
            listening={listen.active}
            onToggle={(on) => listen.toggle(on)}
            volume={75}
            onVolume={handleListenVolume}
          />
        </StaggerItem>
      </StaggerGroup>

      {/* Activity timeline */}
      <div className="surface p-4">
        <h3 className="mb-3 text-sm font-semibold">
          Live session timeline
        </h3>
        <SessionRibbon
          segments={speakers.map((s) => ({
            id: s.userId,
            label: s.username,
            value: s.speaking ? 3 : 1,
            tone: s.speaking ? "signal" : "neutral",
          }))}
        />
      </div>

      <ActiveSpeakersPanel speakers={speakers} />
    </div>
  );
}
