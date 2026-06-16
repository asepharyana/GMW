import { useCallback, useEffect, useState } from "react";
import type { Channel, Guild } from "../../../entities/guild/types.js";
import type { VoiceStatus } from "../../../entities/voice/types.js";
import {
  connectVoice,
  disconnectVoice,
  getGuilds,
  getTextChannels,
  getVoiceChannels,
  getVoiceStatus,
} from "../../../shared/api/client";
import { useAsyncAction } from "../../../shared/hooks/useAsyncAction.js";
import { createLogger } from "../../../shared/lib/logger.js";

const logger = createLogger("use-voice-control");

export function useVoiceControl() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [textChannels, setTextChannels] = useState<Channel[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({
    connected: false,
    activeGuildId: null,
    activeChannelId: null,
    activeChannelName: null,
    connections: [],
  });
  const { loading, error, execute, clearError } = useAsyncAction();

  const refreshGuilds = useCallback(async () => {
    clearError();
    const nextGuilds = await getGuilds();
    setGuilds(nextGuilds);
    return nextGuilds;
  }, [clearError]);

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

  const joinVoice = useCallback(
    async (guildId: string, channelId: string) => {
      const result = await execute(() => connectVoice(guildId, channelId));
      if (result) {
        setVoiceStatus(result);
        logger.info("Connected to voice", { guildId, channelId });
      } else {
        logger.error("Failed to connect to voice", { guildId, channelId });
      }
      return result;
    },
    [execute],
  );

  const leaveVoice = useCallback(async () => {
    const result = await execute(() => disconnectVoice());
    if (result) {
      setVoiceStatus(result);
      logger.info("Disconnected from voice");
    } else {
      logger.error("Failed to disconnect from voice");
    }
    return result;
  }, [execute]);

  useEffect(() => {
    refreshGuilds().catch((err) =>
      logger.error("Failed to refresh guilds on mount", { error: String(err) }),
    );
    refreshVoiceStatus().catch((err) =>
      logger.error("Failed to refresh voice status on mount", {
        error: String(err),
      }),
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
