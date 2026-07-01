// ─── VoiceControls.tsx — Voice bridge island ────────────────────────────────
// Self-contained: reads/writes useVoiceStore, calls API for connect/disconnect.
// ─────────────────────────────────────────────────────────────────────────────

import { Radio } from "lucide-react";
import { useCallback, useState } from "react";
import { connectVoice, disconnectVoice } from "../shared/api/client.js";
import { Button, Select } from "../shared/components/index.js";
import type { Channel, Guild } from "../shared/types/guild.js";
import { useVoiceStore } from "../stores/voice-store.js";

interface VoiceControlsProps {
  guilds: Guild[];
  voiceChannels: Channel[];
}

export default function VoiceControls({
  guilds,
  voiceChannels,
}: VoiceControlsProps) {
  const connected = useVoiceStore((state) => state.connected);
  const guildId = useVoiceStore((state) => state.guildId);
  const channelId = useVoiceStore((state) => state.channelId);
  const setGuildChannel = useVoiceStore((state) => state.setGuildChannel);
  const setConnected = useVoiceStore((state) => state.setConnected);
  const [loading, setLoading] = useState(false);

  const handleConnect = useCallback(async () => {
    if (!guildId || !channelId) return;
    setLoading(true);
    try {
      const status = await connectVoice(guildId, channelId);
      setConnected(status.connected);
    } catch {
      // API error handled by global handler
    } finally {
      setLoading(false);
    }
  }, [guildId, channelId, setConnected]);

  const handleDisconnect = useCallback(async () => {
    setLoading(true);
    try {
      const status = await disconnectVoice();
      setConnected(status.connected);
    } catch {
      // API error handled by global handler
    } finally {
      setLoading(false);
    }
  }, [setConnected]);

  return (
    <div className="glass rounded-xl p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Radio className="h-5 w-5 text-primary" /> Voice Bridge
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Join a Discord voice channel to monitor live audio.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Guild</label>
          <Select
            value={guildId}
            onChange={(e) => setGuildChannel(e.target.value, channelId)}
            placeholder="Select guild"
            disabled={connected}
            options={guilds.map((g) => ({ value: g.id, label: g.name }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Voice Channel
          </label>
          <Select
            value={channelId}
            onChange={(e) => setGuildChannel(guildId, e.target.value)}
            placeholder="Select channel"
            disabled={connected || !guildId}
            options={voiceChannels.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {connected ? (
          <Button
            variant="destructive"
            onClick={handleDisconnect}
            disabled={loading}
          >
            {loading ? "Disconnecting..." : "Disconnect"}
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={!guildId || !channelId || loading}
          >
            {loading ? "Connecting..." : "Join Voice"}
          </Button>
        )}
      </div>
    </div>
  );
}
