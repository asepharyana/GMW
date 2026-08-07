"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/sub-nav";
import { VoiceActivityTimeline } from "@/components/voice/activity-timeline";
import { VoiceConnectionCard } from "@/components/voice/connection-card";
import { ListenControl } from "@/components/voice/listen-control";
import { MicControl } from "@/components/voice/mic-control";
import { SpeakerWaveform } from "@/components/voice/speaker-waveform";
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
import type { Guild, VoiceStatus } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

type VoiceTab = "connection" | "activity";

/**
 * Voice view — hydrated on the client. Seeded from server-rendered status +
 * guild list so every user's first paint reflects the same shared voice
 * connection state; live updates come over WS.
 */
export default function VoiceView({
  initialStatus,
  initialGuilds = [],
}: {
  initialStatus?: VoiceStatus;
  initialGuilds?: Guild[];
}) {
  const ws = useWebSocket();
  const { data: voiceStatus } = useVoiceStatus(initialStatus);
  const { data: guilds = [] } = useGuilds(initialGuilds);
  const [selectedGuild, setSelectedGuild] = useState("");
  const { data: voiceChannels = [] } = useVoiceChannels(selectedGuild);
  const { speakers, subscribe } = useSpeakers(initialStatus?.activeSpeakers);
  const connectMut = useVoiceConnect();
  const disconnectMut = useVoiceDisconnect();
  const micMut = useMicTransmit(ws);
  const listen = useVoiceListen(ws);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [micActive, setMicActive] = useState(false);
  const [volume, setVolume] = useState(75);
  const [listenVolume, setListenVolume] = useState(75);
  const [tab, setTab] = useState<VoiceTab>("connection");

  useEffect(() => {
    const unsub = subscribe(ws);
    return () => unsub();
  }, [ws, subscribe]);

  const handleMicToggle = useCallback(
    async (checked: boolean) => {
      if (checked) {
        try {
          await micMut.mutateAsync(true);
          setMicActive(true);
        } catch {
          setMicActive(false);
        }
      } else {
        setMicActive(false);
        try {
          await micMut.mutateAsync(false);
        } catch {
          // Stop already tore down the local transmitter — ignore remote errors
        }
      }
    },
    [micMut],
  );

  const handleVolumeChange = useCallback(
    (v: number) => {
      setVolume(v);
      micMut.setVolume(v);
    },
    [micMut],
  );

  const handleGuildChange = useCallback((guildId: string | null) => {
    if (!guildId) {
      setSelectedGuild("");
      setSelectedChannel("");
      return;
    }
    setSelectedGuild(guildId);
  }, []);

  const activeSpeakers = speakers.filter((s) => s.speaking);
  const connected = voiceStatus?.connected ?? false;

  return (
    <div className="space-y-4 animate-fade-in-up">
      <SubNav
        tabs={[
          { id: "connection", label: "Connection", icon: undefined },
          { id: "activity", label: "Activity", icon: undefined },
        ]}
        activeTab={tab}
        onTabChange={(t) => setTab(t as VoiceTab)}
      />

      <VoiceConnectionCard
        connected={connected}
        activeChannelName={voiceStatus?.activeChannelName}
        guilds={guilds}
        voiceChannels={voiceChannels}
        selectedGuild={selectedGuild}
        selectedChannel={selectedChannel}
        onGuildChange={handleGuildChange}
        onChannelChange={(v) => setSelectedChannel(v ?? "")}
        onConnect={() => {
          void connectMut
            .mutateAsync({
              guildId: selectedGuild,
              channelId: selectedChannel,
            })
            .catch((err: unknown) => {
              const msg =
                err instanceof Error
                  ? err.message
                  : "Gagal connect ke voice channel";
              toast.error("Voice connect gagal", {
                description: msg,
              });
            });
        }}
        onDisconnect={() => {
          if (micActive) {
            setMicActive(false);
            void micMut.mutateAsync(false).catch(() => {});
          }
          if (listen.active) listen.toggle(false);
          disconnectMut.mutate(undefined);
        }}
        connecting={connectMut.isPending}
      />

      {tab === "connection" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SpeakerWaveform speakers={activeSpeakers} />
          <div className="space-y-4">
            <ListenControl
              connected={connected}
              active={listen.active}
              levels={listen.levels}
              speakers={speakers}
              onToggle={(on) => listen.toggle(on)}
              volume={listenVolume}
              onVolumeChange={(v) => {
                setListenVolume(v);
                listen.setVolume(v);
              }}
            />
            <MicControl
              connected={connected}
              active={micActive}
              onToggle={handleMicToggle}
              volume={volume}
              onVolumeChange={handleVolumeChange}
            />
          </div>
        </div>
      )}

      {tab === "activity" && <VoiceActivityTimeline data={speakers} />}
    </div>
  );
}
