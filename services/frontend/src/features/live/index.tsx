// ─── Live Panel — thin composition layer ────────────────────────────────────

import { Mic, MonitorUp, Music2 } from "lucide-react";
import type {
  ActiveSpeaker,
  Channel,
  Guild,
  MediaState,
  VoiceStatus,
} from "../../shared/api/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../shared/ui";
import { ActiveSpeakers } from "./components/ActiveSpeakers";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { MusicSubPanel } from "./components/MusicSubPanel";
import { NowPlaying } from "./components/NowPlaying";
import { RecordingsSubPanel } from "./components/RecordingsSubPanel";
import { ScreenSubPanel } from "./components/ScreenSubPanel";
import { VoiceConnectionCard } from "./components/VoiceConnectionCard";

interface LivePanelProps {
  guilds: Guild[];
  voiceChannels: Channel[];
  selectedGuild: string;
  selectedChannel: string;
  status: VoiceStatus;
  voiceLoading: boolean;
  activeSpeakers: ActiveSpeaker[];
  levels: number[];
  isListening: boolean;
  isStreaming: boolean;
  mediaState: MediaState;
  mediaLoading: boolean;
  onGuildChange: (id: string) => void;
  onChannelChange: (id: string) => void;
  onJoin: () => void;
  onDisconnect: () => void;
  onListenToggle: () => void;
  onStreamingToggle: () => void;
  onQueueMusic: (source: string) => void;
  onStartScreen: (source: string) => void;
  onSkip: () => void;
  onStop: () => void;
  onVolumeChange: (v: number) => void;
}

export function LivePanel({
  guilds,
  voiceChannels,
  selectedGuild,
  selectedChannel,
  status,
  voiceLoading,
  activeSpeakers,
  levels,
  isListening,
  isStreaming,
  mediaState,
  mediaLoading,
  onGuildChange,
  onChannelChange,
  onJoin,
  onDisconnect,
  onListenToggle,
  onStreamingToggle,
  onQueueMusic,
  onStartScreen,
  onSkip,
  onStop,
  onVolumeChange,
}: LivePanelProps) {
  return (
    <div className="grid gap-6">
      <VoiceConnectionCard
        guilds={guilds}
        voiceChannels={voiceChannels}
        selectedGuild={selectedGuild}
        selectedChannel={selectedChannel}
        status={status}
        voiceLoading={voiceLoading}
        isListening={isListening}
        isStreaming={isStreaming}
        onGuildChange={onGuildChange}
        onChannelChange={onChannelChange}
        onJoin={onJoin}
        onDisconnect={onDisconnect}
        onListenToggle={onListenToggle}
        onStreamingToggle={onStreamingToggle}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Live Audio</CardTitle>
          </CardHeader>
          <CardContent>
            <AudioVisualizer levels={levels} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Speakers</CardTitle>
          </CardHeader>
          <CardContent>
            <ActiveSpeakers speakers={activeSpeakers} />
          </CardContent>
        </Card>
      </div>

      <NowPlaying current={mediaState.current} queue={mediaState.queue} />

      <Tabs defaultValue="music">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="music">
            <Music2 className="mr-1.5 h-4 w-4" /> Music
          </TabsTrigger>
          <TabsTrigger value="screen">
            <MonitorUp className="mr-1.5 h-4 w-4" /> Screen Share
          </TabsTrigger>
          <TabsTrigger value="recordings">
            <Mic className="mr-1.5 h-4 w-4" /> Recordings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="music">
          <MusicSubPanel
            volume={mediaState.musicVolume}
            onVolumeChange={onVolumeChange}
            onQueue={onQueueMusic}
            onSkip={onSkip}
            onStop={onStop}
            loading={mediaLoading}
          />
        </TabsContent>
        <TabsContent value="screen">
          <ScreenSubPanel
            onStart={onStartScreen}
            onSkip={onSkip}
            onStop={onStop}
            loading={mediaLoading}
          />
        </TabsContent>
        <TabsContent value="recordings">
          <RecordingsSubPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
