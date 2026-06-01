import { useEffect, useMemo, useState } from "react";
import { Component, Suspense, lazy } from "react";
import { DashboardLayout } from "./widgets/DashboardLayout";
import { MobileTabBar } from "./shared/ui/MobileTabBar";
import { AuthOverlay } from "./features/auth";
import { LivePanel } from "./features/live";
import { MessagesPanel } from "./features/messages";
import { useDashboardSocket } from "./shared/ws/socket";
import { mergeMessages, useMessages } from "./features/messages/hooks/useMessages";
import { useMediaControl } from "./features/live/hooks/useMediaControl";
import { useUIState } from "./shared/hooks/useUIState";
import { useVoiceControl } from "./features/live/hooks/useVoiceControl";
import { useAudioPlayback } from "./shared/hooks/useAudioPlayback";
import { useAudioTransmit } from "./shared/hooks/useAudioTransmit";
import { getAppConfig, type MessageRecord, type ActiveSpeaker, type MediaState } from "./shared/api/client";
import { Skeleton } from "./shared/ui";

const AnalyticsPanel = lazy(() => import("./features/analytics").then((module) => ({ default: module.AnalyticsPanel })));

class AnalyticsErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  override render() {
    if (this.state.hasError) {
      return <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">Analytics failed to load. The rest of the dashboard is still available.</div>;
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
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("admin-password"));
  const [monitorGuildId, setMonitorGuildId] = useState("");

  const audio = useAudioPlayback();
  const activeTab = uiState.activeTab || "live";
  const selectedVoiceGuild = uiState.selectedVoiceGuild || uiState.selectedGuild || "";
  const selectedTextGuild = monitorGuildId || uiState.selectedTextGuild || uiState.selectedGuild || "";
  const selectedTextChannel = uiState.selectedTextChannel || "";
  const monitorGuild = useMemo(() => (monitorGuildId ? voice.guilds.find((g) => g.id === monitorGuildId) : undefined), [monitorGuildId, voice.guilds]);

  const socket = useDashboardSocket({
    onBinary: audio.handleIncomingPcm,
    onUserState: (users) => setActiveSpeakers(users as ActiveSpeaker[]),
    onMessageCreated: (m) => messages.setMessages((prev) => mergeMessages(prev, [m as MessageRecord])),
    onMessageUpdated: (m) => {
      const d = m as Partial<MessageRecord> & { id: string };
      messages.setMessages((prev) => prev.map((i) => i.id === d.id ? { ...i, ...d } : i));
    },
    onMessageDeleted: (m) => {
      const d = m as { id: string };
      messages.setMessages((prev) => prev.map((i) => i.id === d.id ? { ...i, type: "deleted" as const } : i));
    },
    onMessageAnalyzed: (m) => messages.setMessages((prev) => mergeMessages(prev, [m as MessageRecord])),
    onAttachmentUploaded: () => messages.fetchMessages(selectedTextChannel).catch(() => undefined),
    onMediaState: (state) => media.setMediaState(state as MediaState),
    onVoiceRecordingUploaded: (d) => window.dispatchEvent(new CustomEvent("voice_recording_uploaded", { detail: d })),
  });

  const transmit = useAudioTransmit(socket.socketRef);

  useEffect(() => {
    getAppConfig().then((c) => {
      if (c.monitorGuildId) {
        setMonitorGuildId(c.monitorGuildId);
        patchUIState({ selectedTextGuild: c.monitorGuildId, selectedAnalyticsGuild: c.monitorGuildId, selectedTextChannel: "", selectedAnalyticsChannel: "" });
      }
    }).catch(() => undefined);
  }, [patchUIState]);

  useEffect(() => { if (selectedVoiceGuild) voice.loadVoiceChannels(selectedVoiceGuild).catch(() => undefined); }, [selectedVoiceGuild, voice.loadVoiceChannels]);
  useEffect(() => { if (monitorGuildId) voice.loadTextTargets(monitorGuildId).catch(() => undefined); }, [monitorGuildId, voice.loadTextTargets]);
  useEffect(() => { if (selectedTextChannel) messages.fetchMessages(selectedTextChannel).catch(() => undefined); }, [selectedTextChannel, messages.fetchMessages]);

  return (
    <DashboardLayout activeTab={activeTab} wsStatus={socket.status} voiceStatus={voice.voiceStatus} onTabChange={(tab) => patchUIState({ activeTab: tab })}>
      {activeTab === "live" ? (
        !isAuthenticated ? (
          <AuthOverlay onAuthenticated={() => setIsAuthenticated(true)} />
        ) : (
          <LivePanel
            guilds={voice.guilds} voiceChannels={voice.voiceChannels} selectedGuild={selectedVoiceGuild} selectedChannel={uiState.selectedVoiceChannel || ""}
            status={voice.voiceStatus} voiceLoading={voice.loading} activeSpeakers={activeSpeakers}
            levels={audio.levels} isListening={audio.isListening} isStreaming={transmit.isStreaming}
            mediaState={media.mediaState} mediaLoading={media.loading}
            onGuildChange={(id) => patchUIState({ selectedVoiceGuild: id, selectedVoiceChannel: "" })}
            onChannelChange={(id) => patchUIState({ selectedVoiceChannel: id })}
            onJoin={() => voice.joinVoice(selectedVoiceGuild, uiState.selectedVoiceChannel || "")}
            onDisconnect={() => voice.leaveVoice()}
            onListenToggle={audio.toggleListening} onStreamingToggle={transmit.toggle}
            onQueueMusic={(s) => media.enqueue(s, "music")} onStartScreen={(s) => media.enqueue(s, "screen")}
            onSkip={media.skip} onStop={media.stop} onVolumeChange={media.setVolume}
          />
        )
      ) : activeTab === "messages" ? (
        <MessagesPanel
          guilds={monitorGuild ? [monitorGuild] : []} channels={voice.textChannels}
          selectedGuild={selectedTextGuild} selectedChannel={selectedTextChannel}
          messages={messages.messages}
          onGuildChange={(id) => patchUIState({ selectedTextGuild: id, selectedTextChannel: "" })}
          onChannelChange={(id) => patchUIState({ selectedTextChannel: id })}
          onReanalyze={messages.reanalyze}
        />
      ) : (
        <AnalyticsErrorBoundary>
          <Suspense fallback={<div className="flex flex-col gap-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}<Skeleton className="h-64 w-full rounded-xl" /></div>}>
            <AnalyticsPanel
              guilds={monitorGuild ? [monitorGuild] : []} channels={voice.textChannels}
              selectedGuild={uiState.selectedAnalyticsGuild || selectedTextGuild || ""}
              selectedChannel={uiState.selectedAnalyticsChannel || selectedTextChannel || ""}
              onGuildChange={(id) => patchUIState({ selectedAnalyticsGuild: id, selectedAnalyticsChannel: "" })}
              onChannelChange={(id) => patchUIState({ selectedAnalyticsChannel: id })}
            />
          </Suspense>
        </AnalyticsErrorBoundary>
      )}
      <MobileTabBar activeTab={activeTab} onTabChange={(tab) => patchUIState({ activeTab: tab })} />
    </DashboardLayout>
  );
}
