import { Headphones, Radio } from "lucide-react";
import type { Channel, Guild, VoiceStatus } from "../../../shared/api/client";
import { Button, Select } from "../../../shared/ui";
import { MicLevelMeter } from "./MicLevelMeter";

interface VoiceConnectionCardProps {
  guilds: Guild[];
  voiceChannels: Channel[];
  selectedGuild: string;
  selectedChannel: string;
  status: VoiceStatus;
  voiceLoading: boolean;
  isListening: boolean;
  isStreaming: boolean;
  micLevel: number;
  onGuildChange: (id: string) => void;
  onChannelChange: (id: string) => void;
  onJoin: () => void;
  onDisconnect: () => void;
  onListenToggle: () => void;
  onStreamingToggle: () => void;
}

export function VoiceConnectionCard({
  guilds,
  voiceChannels,
  selectedGuild,
  selectedChannel,
  status,
  voiceLoading,
  isListening,
  isStreaming,
  micLevel,
  onGuildChange,
  onChannelChange,
  onJoin,
  onDisconnect,
  onListenToggle,
  onStreamingToggle,
}: VoiceConnectionCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Radio className="h-5 w-5 text-primary" /> Voice Bridge
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Join a Discord voice channel, listen, and transmit audio.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Guild</label>
            <Select
              value={selectedGuild}
              onChange={(e) => onGuildChange(e.target.value)}
              placeholder="Select guild"
              options={guilds.map((g) => ({ value: g.id, label: g.name }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Voice Channel
            </label>
            <Select
              value={selectedChannel}
              onChange={(e) => onChannelChange(e.target.value)}
              placeholder="Select voice channel"
              options={voiceChannels.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={!selectedGuild || !selectedChannel || voiceLoading}
            onClick={onJoin}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {status.connected ? "Reconnect" : "Join Voice"}
          </Button>
          <Button
            variant="destructive"
            disabled={!status.connected || voiceLoading}
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
          <Button
            variant={isListening ? "secondary" : "outline"}
            onClick={onListenToggle}
          >
            <Headphones className="mr-1.5 h-4 w-4" />{" "}
            {isListening ? "Stop Listening" : "Listen"}
          </Button>
          <Button
            variant={isStreaming ? "secondary" : "outline"}
            onClick={onStreamingToggle}
          >
            <Radio className="mr-1.5 h-4 w-4" />{" "}
            {isStreaming ? "Stop Transmit" : "Transmit"}
          </Button>
          {isStreaming && (
            <div className="flex items-center pl-1">
              <MicLevelMeter level={micLevel} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
