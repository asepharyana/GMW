import { useEffect, useMemo, useState } from "react";
import { AuthOverlay } from "./features/auth";
import { LivePanel } from "./features/live";
import { useMediaControl } from "./features/live/hooks/useMediaControl";
import { useVoiceControl } from "./features/live/hooks/useVoiceControl";
import { MessagesPanel } from "./features/messages";
import { TunerPanel } from "./features/tuner";
import { ModerationAlertListener } from "./features/messages/components/ModerationAlertListener";
import {
  mergeMessages,
  useMessages,
} from "./features/messages/hooks/useMessages";
import {
  type ActiveSpeaker,
  getAppConfig,
  type MediaState,
  type MessageRecord,
} from "./shared/api/client";
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
  const [activeSpeakers, setActiveSpeakers] = useState<ActiveSpeaker[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem("admin-password"),
  );
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

  const socket = useDashboardSocket({
    onVoicePcmData: (d) =>
      audio.handleIncomingPcm(d as { userId: string; pcm: string }),
    onUserState: (users) => setActiveSpeakers(users as ActiveSpeaker[]),
    onMessageCreated: (m) =>
      messages.setMessages((prev) => mergeMessages(prev, [m as MessageRecord])),
    onMessageUpdated: (m) => {
      const d = m as Partial<MessageRecord> & { id: string };
      messages.setMessages((prev) =>
        prev.map((i) => (i.id === d.id ? { ...i, ...d } : i)),
      );
    },
    onMessageDeleted: (m) => {
      const d = m as { id: string };
      messages.setMessages((prev) =>
        prev.map((i) =>
          i.id === d.id ? { ...i, type: "deleted" as const } : i,
        ),
      );
    },
    onMessageAnalyzed: (m) => {
      const msg = m as MessageRecord;
      messages.setMessages((prev) => mergeMessages(prev, [msg]));
      // Show toast for moderation alerts (flagged)
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
    onMediaState: (state) => media.setMediaState(state as MediaState),
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
        !isAuthenticated ? (
          <AuthOverlay onAuthenticated={() => setIsAuthenticated(true)} />
        ) : (
          <LivePanel
            guilds={voice.guilds}
            voiceChannels={voice.voiceChannels}
            selectedGuild={selectedVoiceGuild}
            selectedChannel={uiState.selectedVoiceChannel || ""}
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
        )
      ) : activeTab === "tuner" ? (
        !isAuthenticated ? (
          <AuthOverlay onAuthenticated={() => setIsAuthenticated(true)} />
        ) : (
          <TunerPanel />
        )
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
