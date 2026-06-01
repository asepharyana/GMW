import { useCallback, useEffect, useState } from "react";
import type { Channel, Guild, VoiceStatus } from "../../../shared/api/client";
import {
  connectVoice,
  disconnectVoice,
  getGuilds,
  getTextChannels,
  getVoiceChannels,
  getVoiceStatus,
} from "../../../shared/api/client";

export function useVoiceControl() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [textChannels, setTextChannels] = useState<Channel[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({
    connected: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshGuilds = useCallback(async () => {
    setError(null);
    const nextGuilds = await getGuilds();
    setGuilds(nextGuilds);
    return nextGuilds;
  }, []);

  const refreshVoiceStatus = useCallback(async () => {
    const status = await getVoiceStatus();
    setVoiceStatus(status);
    return status;
  }, []);

  const loadVoiceChannels = useCallback(async (guildId: string) => {
    if (!guildId) {
      setVoiceChannels([]);
      return [];
    }
    const channels = await getVoiceChannels(guildId);
    setVoiceChannels(channels);
    return channels;
  }, []);

  const loadTextTargets = useCallback(async (guildId: string) => {
    if (!guildId) {
      setTextChannels([]);
      return [];
    }
    const channels = await getTextChannels(guildId);
    setTextChannels(channels);
    return channels;
  }, []);

  const joinVoice = useCallback(async (guildId: string, channelId: string) => {
    setLoading(true);
    setError(null);
    try {
      const status = await connectVoice(guildId, channelId);
      setVoiceStatus(status);
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const leaveVoice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await disconnectVoice();
      setVoiceStatus(status);
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshGuilds().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    refreshVoiceStatus().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshGuilds, refreshVoiceStatus]);

  return {
    guilds,
    voiceChannels,
    textChannels,
    voiceStatus,
    loading,
    error,
    refreshGuilds,
    refreshVoiceStatus,
    loadVoiceChannels,
    loadTextTargets,
    joinVoice,
    leaveVoice,
  };
}
