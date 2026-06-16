import { useEffect, useMemo, useState } from "react";
import type { ActiveSpeaker } from "./entities/voice/types.js";
import { DashboardPanel } from "./features/dashboard";
import { LivePanel } from "./features/live";
import { useMediaControl } from "./features/live/hooks/useMediaControl";
import { useVoiceControl } from "./features/live/hooks/useVoiceControl";
import { MessagesPanel } from "./features/messages";
import { ModerationAlertListener } from "./features/messages/components/ModerationAlertListener";
import {
  mergeMessages,
  useMessages,
} from "./features/messages/hooks/useMessages";
import { getAppConfig } from "./shared/api/client";
import { useAudioPlayback } from "./shared/hooks/useAudioPlayback";
import { useAudioTransmit } from "./shared/hooks/useAudioTransmit";
import { useUIState } from "./shared/hooks/useUIState";
import { MobileTabBar } from "./shared/ui/MobileTabBar";
import { useDashboardSocket } from "./shared/ws/socket";
import { DashboardLayout } from "./widgets/DashboardLayout";

export default function App() {
  const { uiState, patchUIState } = useUIState();
  const voice = useVoiceControl();
  const media = useMediaControl();
  const messages = useMessages();
  const [activeSpeakers, setActiveSpeakers] = useState<
    (ActiveSpeaker & { heardAt?: number })[]
  >([]);
  const [monitorGuildId, setMonitorGuildId] = useState("");

  const audio = useAudioPlayback();
  const activeTab = uiState.activeTab || "messages";
  const selectedVoiceGuild =
    uiState.selectedVoiceGuild || uiState.selectedGuild || "";

  // Resolve monitor guild name from the full guild list (has real names now)
  const monitorGuildName = useMemo(
    () =>
      monitorGuildId
        ? (voice.guilds.find((g) => g.id === monitorGuildId)?.name ?? null)
        : null,
    [monitorGuildId, voice.guilds],
  );

  // Update speaker list from incremental voice_active_user events
  const updateSpeakerList = (
    prev: (ActiveSpeaker & { heardAt?: number })[],
    data: Partial<ActiveSpeaker> & {
      userId?: string;
      id?: string;
      speaking: boolean;
    },
  ): (ActiveSpeaker & { heardAt?: number })[] => {
    const key = data.userId ?? data.id;
    if (!key) return prev;
    const now = Date.now();
    const idx = prev.findIndex((s) => (s.userId ?? s.id) === key);
    if (idx >= 0) {
      const next = [...prev];
      next[idx] = { ...next[idx], ...data, heardAt: now };
      return next;
    }
    return [
      ...prev,
      { ...data, heardAt: now } as ActiveSpeaker & { heardAt?: number },
    ];
  };

  const socket = useDashboardSocket({
    onBinary: (d) => audio.handleIncomingBinary(d),
    onUserState: (users) =>
      setActiveSpeakers(
        users.map((u) => ({
          ...u,
          heardAt: Date.now(),
        })),
      ),
    onVoiceActiveUser: (data) => {
      if (data.userId) audio.registerUserId(data.userId);
      setActiveSpeakers((prev) =>
        updateSpeakerList(prev, {
          userId: data.userId,
          username: data.username,
          avatar: data.avatar,
          speaking: data.speaking,
        }),
      );
    },
    onVoiceRecordingStarted: () =>
      window.dispatchEvent(new CustomEvent("voice_recording_uploaded")),
    onVoiceRecordingStopped: () =>
      window.dispatchEvent(new CustomEvent("voice_recording_uploaded")),
    onMessageCreated: (m) =>
      messages.setMessages((prev) => mergeMessages(prev, [m])),
    onMessageUpdated: (m) =>
      messages.setMessages((prev) =>
        prev.map((i) => (i.id === m.id ? { ...i, ...m } : i)),
      ),
    onMessageDeleted: (m) =>
      messages.setMessages((prev) =>
        prev.map((i) =>
          i.id === m.id ? { ...i, type: "deleted" as const } : i,
        ),
      ),
    onMessageAnalyzed: (msg) => {
      messages.setMessages((prev) => mergeMessages(prev, [msg]));
      const status = msg.ai_status;
      if (status === "flagged") {
        const username = msg.username || msg.user_id || "unknown";
        const severity = msg.ai_severity || "";
        const categories = msg.ai_categories || "";
        const brief = msg.ai_analysis?.slice(0, 80) ?? "Message flagged by AI";
        window.dispatchEvent(
          new CustomEvent("moderation_alert", {
            detail: { type: status, username, severity, categories, brief },
          }),
        );
      }
    },
    onAttachmentUploaded: () =>
      messages
        .fetchMessages(monitorGuildId || undefined)
        .catch(() => undefined),
    onAttachmentCreated: () =>
      messages
        .fetchMessages(monitorGuildId || undefined)
        .catch(() => undefined),
    onMediaState: (state) => media.setMediaState(state),
    onVoiceRecordingUploaded: (d) =>
      window.dispatchEvent(
        new CustomEvent("voice_recording_uploaded", { detail: d }),
      ),
  });

  const transmit = useAudioTransmit(socket.socketRef);

  // Load app config on mount
  useEffect(() => {
    getAppConfig()
      .then((c) => {
        if (c.monitorGuildId) {
          setMonitorGuildId(c.monitorGuildId);
        }
      })
      .catch(() => undefined);
  }, []);

  // Load voice channels when guild changes (Live tab)
  useEffect(() => {
    if (selectedVoiceGuild)
      voice.loadVoiceChannels(selectedVoiceGuild).catch(() => undefined);
  }, [selectedVoiceGuild, voice.loadVoiceChannels]);

  // Auto-fetch messages for the monitor guild
  useEffect(() => {
    if (monitorGuildId)
      messages.fetchMessages(monitorGuildId).catch(() => undefined);
  }, [monitorGuildId, messages.fetchMessages]);

  // Periodic refetch — keeps dashboard in sync even if WS events missed
  useEffect(() => {
    if (!monitorGuildId) return;
    const interval = setInterval(() => {
      messages.fetchMessages(monitorGuildId).catch(() => undefined);
    }, 15_000);
    return () => clearInterval(interval);
  }, [monitorGuildId, messages.fetchMessages]);

  // Stale speaker pruning — remove speakers not heard from in 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSpeakers((prev) => {
        const now = Date.now();
        const pruned = prev.filter(
          (s) => s.speaking || (s.heardAt && now - s.heardAt < 30_000),
        );
        return pruned.length < prev.length ? pruned : prev;
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Push-to-Talk — hold Space to transmit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.code === "Space" && !transmit.isStreaming && e.repeat === false) {
        e.preventDefault();
        transmit.startTransmit().catch(() => undefined);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && transmit.isStreaming) {
        transmit.stopTransmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [transmit]);

  return (
    <DashboardLayout
      activeTab={activeTab}
      wsStatus={socket.status}
      voiceStatus={voice.voiceStatus}
      onTabChange={(tab) => patchUIState({ activeTab: tab })}
      recentMessages={messages.messages}
      guildId={monitorGuildId}
      channelId={
        uiState.selectedTextChannel || uiState.selectedVoiceChannel || undefined
      }
    >
      {activeTab === "live" ? (
        <LivePanel
          guilds={voice.guilds}
          voiceChannels={voice.voiceChannels}
          selectedGuild={selectedVoiceGuild}
          selectedChannel={uiState.selectedVoiceChannel || ""}
          micLevel={0}
          status={voice.voiceStatus}
          voiceLoading={voice.loading}
          activeSpeakers={activeSpeakers}
          levels={audio.levels}
          isListening={audio.isListening}
          isStreaming={transmit.isStreaming}
          mediaState={media.mediaState}
          mediaLoading={media.loading}
          onGuildChange={(id) =>
            patchUIState({ selectedVoiceGuild: id, selectedVoiceChannel: "" })
          }
          onChannelChange={(id) => patchUIState({ selectedVoiceChannel: id })}
          onJoin={() =>
            voice.joinVoice(
              selectedVoiceGuild,
              uiState.selectedVoiceChannel || "",
            )
          }
          onDisconnect={() => voice.leaveVoice()}
          onListenToggle={audio.toggleListening}
          onStreamingToggle={transmit.toggle}
          onQueueMusic={(s) => media.enqueue(s, "music")}
          onStartScreen={(s) => media.enqueue(s, "screen")}
          onSkip={media.skip}
          onStop={media.stop}
          onVolumeChange={media.setVolume}
        />
      ) : activeTab === "dashboard" ? (
        <DashboardPanel />
      ) : (
        <MessagesPanel
          guildName={monitorGuildName}
          messages={messages.messages}
          onReanalyze={messages.reanalyze}
          onReanalyzeAllErrors={messages.reanalyzeAllErrors}
          onLoadMore={messages.loadMore}
          hasMore={messages.hasMore}
          loadingMore={messages.loadingMore}
        />
      )}
      <MobileTabBar
        activeTab={activeTab}
        onTabChange={(tab) => patchUIState({ activeTab: tab })}
      />
      <ModerationAlertListener />
    </DashboardLayout>
  );
}
