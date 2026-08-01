"use client";

import { useCallback, useEffect, useState } from "react";
import { SubNav } from "@/components/layout/sub-nav";
import { VoiceActivityTimeline } from "@/components/voice/activity-timeline";
import { VoiceConnectionCard } from "@/components/voice/connection-card";
import { MicControl } from "@/components/voice/mic-control";
import { SpeakerWaveform } from "@/components/voice/speaker-waveform";
import {
  useGuilds,
  useMicTransmit,
  useSpeakers,
  useVoiceChannels,
  useVoiceConnect,
  useVoiceDisconnect,
  useVoiceStatus,
} from "@/hooks";
import { useWebSocket } from "@/lib/ws/context";

type VoiceTab = "connection" | "activity";

export default function VoicePage() {
  const ws = useWebSocket();
  const { data: voiceStatus } = useVoiceStatus();
  const { data: guilds = [] } = useGuilds();
  const [selectedGuild, setSelectedGuild] = useState("");
  const { data: voiceChannels = [] } = useVoiceChannels(selectedGuild);
  const { speakers, subscribe } = useSpeakers();
  const connectMut = useVoiceConnect();
  const disconnectMut = useVoiceDisconnect();
  const micMut = useMicTransmit(ws);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [micActive, setMicActive] = useState(false);
  const [volume, setVolume] = useState(75);
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
        onConnect={() =>
          connectMut.mutate({
            guildId: selectedGuild,
            channelId: selectedChannel,
          })
        }
        onDisconnect={() => {
          if (micActive) {
            setMicActive(false);
            void micMut.mutateAsync(false).catch(() => {});
          }
          disconnectMut.mutate(undefined);
        }}
        connecting={connectMut.isPending}
      />

      {tab === "connection" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SpeakerWaveform speakers={activeSpeakers} />
          <MicControl
            connected={connected}
            active={micActive}
            onToggle={handleMicToggle}
            volume={volume}
            onVolumeChange={handleVolumeChange}
          />
        </div>
      )}

      {tab === "activity" && <VoiceActivityTimeline />}
    </div>
  );
}
