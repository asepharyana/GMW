import { Component, lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AuthOverlay } from "./features/auth";
import { LivePanel } from "./features/live";
import { useMediaControl } from "./features/live/hooks/useMediaControl";
import { useVoiceControl } from "./features/live/hooks/useVoiceControl";
import { MessagesPanel } from "./features/messages";
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
import { Skeleton } from "./shared/ui";
import { MobileTabBar } from "./shared/ui/MobileTabBar";
import { useDashboardSocket } from "./shared/ws/socket";
import { DashboardLayout } from "./widgets/DashboardLayout";

const AnalyticsPanel = lazy(() =>
  import("./features/analytics").then((module) => ({
    default: module.AnalyticsPanel,
  })),
);

class AnalyticsErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          Analytics failed to load. The rest of the dashboard is still
          available.
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const activeTab = uiState.activeTab || "live";
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
    onBinary: audio.handleIncomingPcm,
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

  // Auto-fetch messages for the monitor guild (all channels)
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
      channelId={uiState.selectedTextChannel || uiState.selectedVoiceChannel || undefined}
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
      ) : activeTab === "messages" ? (
        <MessagesPanel
          guildName={monitorGuildName}
          messages={messages.messages}
          onReanalyze={messages.reanalyze}
          onReanalyzeAllErrors={messages.reanalyzeAllErrors}
          onLoadMore={messages.loadMore}
          hasMore={messages.hasMore}
          loadingMore={messages.loadingMore}
        />
      ) : (
        <AnalyticsErrorBoundary>
          <Suspense
            fallback={
              <div className="flex flex-col gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            }
          >
            <AnalyticsPanel
              guildId={monitorGuildId}
              guildName={monitorGuildName}
            />
          </Suspense>
        </AnalyticsErrorBoundary>
      )}
      <MobileTabBar
        activeTab={activeTab}
        onTabChange={(tab) => patchUIState({ activeTab: tab })}
      />
      <ModerationAlertListener />
    </DashboardLayout>
  );
}
