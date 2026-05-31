import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { LivePanel } from "./components/live/LivePanel";
import { MessagesPanel } from "./components/messages/MessagesPanel";
import { AuthOverlay } from "./components/layout/AuthOverlay";
import { useDashboardSocket } from "./hooks/useDashboardSocket";
import { mergeMessages, useMessages } from "./hooks/useMessages";
import { useMediaControl } from "./hooks/useMediaControl";
import { useUIState } from "./hooks/useUIState";
import { useVoiceControl } from "./hooks/useVoiceControl";
import type { MessageRecord } from "./types/messages";
import type { DashboardTab } from "./types/ui";
import type { ActiveSpeaker } from "./types/voice";

const AnalyticsPanel = lazy(() => import("./components/analytics").then((module) => ({ default: module.AnalyticsPanel })));

class AnalyticsErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          Analytics failed to load. The rest of the dashboard is still available.
        </div>
      );
    }

    return this.props.children;
  }
}

const SAMPLE_RATE = 24000;
const CHANNELS = 1;

export default function App() {
  const { uiState, setUIState, patchUIState } = useUIState();
  const voice = useVoiceControl();
  const media = useMediaControl();
  const messages = useMessages();
  const [activeSpeakers, setActiveSpeakers] = useState<ActiveSpeaker[]>([]);
  const [levels, setLevels] = useState<number[]>(Array.from({ length: 32 }, () => 0.04));
  const [isListening, setIsListening] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("admin-password"));
  const audioContextListenRef = useRef<AudioContext | null>(null);
  const audioContextTransmitRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const userTimelinesRef = useRef(new Map<number, number>());

  const activeTab = uiState.activeTab || "live";
  const selectedVoiceGuild = uiState.selectedVoiceGuild || uiState.selectedGuild || "";
  const selectedVoiceChannel = uiState.selectedVoiceChannel || "";
  const selectedTextGuild = uiState.selectedTextGuild || uiState.selectedGuild || "";
  const selectedTextChannel = uiState.selectedTextChannel || "";
  const selectedAnalyticsGuild = uiState.selectedAnalyticsGuild || uiState.selectedGuild || "";
  const selectedAnalyticsChannel = uiState.selectedAnalyticsChannel || "";

  const handleIncomingPcm = useCallback((data: ArrayBuffer) => {
    const headerView = new DataView(data, 0, 4);
    const userIdHash = headerView.getInt32(0, true);
    const audioData = data.slice(4);
    const int16Array = new Int16Array(audioData);
    let sum = 0;
    for (const sample of int16Array) sum += Math.abs(sample / 32768);
    const average = int16Array.length ? sum / int16Array.length : 0;
    setLevels((prev) => prev.map((_, index) => Math.max(0.04, average * (0.5 + Math.sin(index * 0.6 + Date.now() / 140) * 0.35 + 0.65) * 5)));

    const audioContext = audioContextListenRef.current;
    if (!isListening || !audioContext) return;
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) float32Array[i] = int16Array[i] / 32768;
    const audioBuffer = audioContext.createBuffer(CHANNELS, float32Array.length / CHANNELS, SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32Array);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    const currentTime = audioContext.currentTime;
    let nextStart = userTimelinesRef.current.get(userIdHash) || 0;
    if (nextStart < currentTime) nextStart = currentTime + 0.05;
    source.start(nextStart);
    userTimelinesRef.current.set(userIdHash, nextStart + audioBuffer.duration);
  }, [isListening]);

  const triggerAnalyticsRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent("analytics_refresh"));
  }, []);

  const socket = useDashboardSocket({
    onUIState: (state) => setUIState((prev) => ({ ...prev, ...state })),
    onUserState: setActiveSpeakers,
    onMessageCreated: (message) => {
      messages.setMessages((prev) => mergeMessages(prev, [message]));
      triggerAnalyticsRefresh();
    },
    onMessageUpdated: (message) => {
      messages.setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, ...message } as MessageRecord : item)));
      triggerAnalyticsRefresh();
    },
    onMessageDeleted: (message) => {
      messages.setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, type: "deleted" } : item)));
      triggerAnalyticsRefresh();
    },
    onMessageAnalyzed: (message) => {
      messages.setMessages((prev) => mergeMessages(prev, [message]));
      triggerAnalyticsRefresh();
    },
    onAttachmentUploaded: () => messages.fetchMessages(selectedTextChannel).catch(() => undefined),
    onMediaState: media.setMediaState,
    onVoiceRecordingUploaded: (recording) => {
      const event = new CustomEvent("voice_recording_uploaded", { detail: recording });
      window.dispatchEvent(event);
    },
    onPcm: handleIncomingPcm,
  });

  const stopStreamingLocal = useCallback(() => {
    setIsStreaming(false);
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (audioContextTransmitRef.current) { audioContextTransmitRef.current.close(); audioContextTransmitRef.current = null; }
    if (streamRef.current) { for (const track of streamRef.current.getTracks()) track.stop(); streamRef.current = null; }
    setLevels(Array.from({ length: 32 }, () => 0.04));
  }, []);

  const startStreamingLocal = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setIsStreaming(true);
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextCtor({ sampleRate: SAMPLE_RATE });
      audioContextTransmitRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(audioContext.destination);
      processor.onaudioprocess = (event) => {
        if (!socket.socketRef.current || socket.socketRef.current.readyState !== WebSocket.OPEN) return;
        const inputData = event.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
        socket.socketRef.current.send(pcmData.buffer);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += Math.abs(inputData[i]);
        const average = inputData.length ? sum / inputData.length : 0;
        setLevels((prev) => prev.map((_, index) => Math.max(0.04, average * (0.5 + Math.sin(index * 0.6 + Date.now() / 140) * 0.35 + 0.65) * 5)));
      };
    } catch (err) {
      console.error("Microphone access failed:", err);
      setIsStreaming(false);
      throw err;
    }
  }, [socket.socketRef]);

  const toggleStreaming = useCallback(async () => {
    if (isStreaming) { stopStreamingLocal(); patchUIState({ isStreaming: false }); }
    else { await startStreamingLocal(); patchUIState({ isStreaming: true }); }
  }, [isStreaming, startStreamingLocal, stopStreamingLocal, patchUIState]);

  useEffect(() => { if (selectedVoiceGuild) voice.loadVoiceChannels(selectedVoiceGuild).catch(() => undefined); }, [selectedVoiceGuild]);
  useEffect(() => { if (selectedTextGuild) voice.loadTextTargets(selectedTextGuild).catch(() => undefined); }, [selectedTextGuild]);
  useEffect(() => { if (selectedAnalyticsGuild) voice.loadTextTargets(selectedAnalyticsGuild).catch(() => undefined); }, [selectedAnalyticsGuild]);
  useEffect(() => { if (selectedTextChannel) messages.fetchMessages(selectedTextChannel).catch(() => undefined); }, [selectedTextChannel]);

  const toggleListening = useCallback(async () => {
    if (isListening) { await audioContextListenRef.current?.suspend(); userTimelinesRef.current.clear(); setIsListening(false); patchUIState({ isListening: false }); return; }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    audioContextListenRef.current ??= new AudioContextCtor({ sampleRate: SAMPLE_RATE });
    await audioContextListenRef.current.resume();
    setIsListening(true);
    patchUIState({ isListening: true });
  }, [isListening, patchUIState]);

  const tabs = useMemo(() => ["live", "messages", "analytics"] as DashboardTab[], []);

  return (
    <DashboardLayout
      activeTab={activeTab}
      wsStatus={socket.status}
      voiceStatus={voice.voiceStatus}
      onTabChange={(tab) => patchUIState({ activeTab: tab })}
    >
      <div className="md:hidden">
          <div className="mb-4 grid grid-cols-4 gap-1.5 rounded-2xl bg-muted p-1">
            {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`rounded-xl px-2 py-2 text-xs font-medium ${activeTab === tab ? "bg-background text-foreground" : "text-muted-foreground"}`}
              onClick={() => patchUIState({ activeTab: tab })}
            >
                {tab}
              </button>
            ))}
          </div>
      </div>
      {activeTab === "live" ? (
        !isAuthenticated ? (
          <AuthOverlay onAuthenticated={() => setIsAuthenticated(true)} />
        ) : (
          <LivePanel
            guilds={voice.guilds}
            voiceChannels={voice.voiceChannels}
            selectedGuild={selectedVoiceGuild}
            selectedChannel={selectedVoiceChannel}
            status={voice.voiceStatus}
            voiceLoading={voice.loading}
            activeSpeakers={activeSpeakers}
            levels={levels}
            isListening={isListening}
            isStreaming={isStreaming}
            mediaState={media.mediaState}
            mediaLoading={media.loading}
            onGuildChange={(guildId) => patchUIState({ selectedVoiceGuild: guildId, selectedVoiceChannel: "" })}
            onChannelChange={(channelId) => patchUIState({ selectedVoiceChannel: channelId })}
            onJoin={() => voice.joinVoice(selectedVoiceGuild, selectedVoiceChannel)}
            onDisconnect={() => voice.leaveVoice()}
            onListenToggle={toggleListening}
            onStreamingToggle={toggleStreaming}
            onQueueMusic={(source) => media.enqueue(source, "music")}
            onStartScreen={(source) => media.enqueue(source, "screen")}
            onSkip={media.skip}
            onStop={media.stop}
            onVolumeChange={media.setVolume}
          />
        )
      ) : activeTab === "messages" ? (
        <MessagesPanel
          guilds={voice.guilds}
          channels={voice.textChannels}
          selectedGuild={selectedTextGuild}
          selectedChannel={selectedTextChannel}
          messages={messages.messages}
          onGuildChange={(guildId) => patchUIState({ selectedTextGuild: guildId, selectedTextChannel: "" })}
          onChannelChange={(channelId) => patchUIState({ selectedTextChannel: channelId })}
          onReanalyze={messages.reanalyze}
        />
      ) : (
        <AnalyticsErrorBoundary>
          <Suspense
            fallback={
              <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                Loading analytics...
              </div>
            }
          >
            <AnalyticsPanel
              guilds={voice.guilds}
              channels={voice.textChannels}
              selectedGuild={selectedAnalyticsGuild}
              selectedChannel={selectedAnalyticsChannel}
              onGuildChange={(guildId) => patchUIState({ selectedAnalyticsGuild: guildId, selectedAnalyticsChannel: "" })}
              onChannelChange={(channelId) => patchUIState({ selectedAnalyticsChannel: channelId })}
            />
          </Suspense>
        </AnalyticsErrorBoundary>
      )}
    </DashboardLayout>
  );
}
