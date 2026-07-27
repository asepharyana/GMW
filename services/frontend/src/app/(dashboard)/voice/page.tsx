"use client";

import { useCallback, useEffect, useState } from "react";

import { ActiveSpeakersPanel } from "@/components/voice/active-speakers-panel";
import { MicrophoneCard } from "@/components/voice/microphone-card";
import { VoiceConnectionCard } from "@/components/voice/voice-connection-card";
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

export default function VoicePage() {
  const ws = useWebSocket();
  const { data: voiceStatus } = useVoiceStatus();
  const { data: guilds = [] } = useGuilds();
  const [selectedGuild, setSelectedGuild] = useState("");
  const { data: voiceChannels = [] } = useVoiceChannels(selectedGuild);
  const { speakers, subscribe } = useSpeakers();
  const connectMut = useVoiceConnect();
  const disconnectMut = useVoiceDisconnect();
  const micMut = useMicTransmit();
  const [selectedChannel, setSelectedChannel] = useState("");
  const [micActive, setMicActive] = useState(false);

  useEffect(() => {
    const unsub = subscribe(ws);
    return () => unsub();
  }, [ws, subscribe]);

  const handleGuildChange = useCallback((guildId: string | null) => {
    if (!guildId) {
      setSelectedGuild("");
      setSelectedChannel("");
      return;
    }
    setSelectedGuild(guildId);
  }, []);

  const handleMicToggle = useCallback(
    async (checked: boolean) => {
      setMicActive(checked);
      try {
        await micMut.mutateAsync(checked);
      } catch {
        setMicActive(!checked);
      }
    },
    [micMut],
  );

  const activeSpeakers = speakers.filter((s) => s.speaking);
  const connected = voiceStatus?.connected ?? false;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <VoiceConnectionCard
        selectedGuild={selectedGuild}
        onGuildChange={handleGuildChange}
        selectedChannel={selectedChannel}
        onChannelChange={(v) => setSelectedChannel(v)}
        guilds={guilds}
        voiceChannels={voiceChannels}
        connected={connected}
        activeChannelName={voiceStatus?.activeChannelName}
        connectMut={connectMut}
        disconnectMut={disconnectMut}
      />
      <ActiveSpeakersPanel activeSpeakers={activeSpeakers} />
      <MicrophoneCard
        connected={connected}
        micActive={micActive}
        onMicToggle={handleMicToggle}
      />
    </div>
  );
}
