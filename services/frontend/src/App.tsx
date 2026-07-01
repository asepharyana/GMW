// ─── App.tsx — The God Component ──────────────────────────────────────────────
// TODO: Decompose into smaller focused components (M20).
// This component currently handles auth, socket lifecycle, speaker tracking,
// voice control, media, PTT, command palette, and tab navigation.
// Each concern should be extracted into its own hook or sub-component.
// ───────────────────────────────────────────────────────────────────────────────

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveSpeaker } from "./entities/voice/types.js";
import { AuthOverlay } from "./features/auth";
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
import { SettingsPanel } from "./features/settings";
import { useNotificationBadge } from "./hooks/useNotificationBadge";
import { useTheme } from "./hooks/useTheme";
import {
  getAppConfig,
  getSessionToken,
  getAdminPassword,
  clearSessionToken,
  clearAdminPassword,
} from "./shared/api/client";
import { useAudioPlayback } from "./shared/hooks/useAudioPlayback";
import { useAudioTransmit } from "./shared/hooks/useAudioTransmit";
import { useUIState } from "./shared/hooks/useUIState";
import { CommandPalette } from "./shared/ui/CommandPalette";
import { ErrorBoundary } from "./shared/ui/error-boundary";
import { MobileTabBar } from "./shared/ui/MobileTabBar";
import type { DashboardTab } from "./entities/ui/types.js";
import { useDashboardSocket } from "./shared/ws/socket";
import { DashboardLayout } from "./widgets/DashboardLayout";

type AuthState = "loading" | "authenticated" | "unauthenticated";

export default function App() {
  const { uiState, patchUIState } = useUIState();
  const { theme, mode, isDark, toggle: toggleTheme, setMode } = useTheme();
  const voice = useVoiceControl();
  const media = useMediaControl();
  const messages = useMessages();
  const [activeSpeakers, setActiveSpeakers] = useState<
    (ActiveSpeaker & { heardAt?: number })[]>([]);
  const [monitorGuildId, setMonitorGuildId] = useState("");

  // ── Command palette state ────────────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<"search" | "shortcuts" | null>(null);

  // ── Auth state ─────────────────────────────────────────────────────────────
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [dashboardIsPublic, setDashboardIsPublic] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const configRetryRef = useRef(0);
  const configTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_CONFIG_RETRIES = 3;

  // ── Notification badge ─────────────────────────────────────────────────────
  const activeTab: DashboardTab = (uiState.activeTab as DashboardTab) || "messages";
  const notifBadge = useNotificationBadge(activeTab);

  // On mount: check config for public/private mode, and check stored session token
  useEffect(() => {
    // Clear legacy admin-password from localStorage — only use token auth now
    clearAdminPassword();

    // Validate existing token by calling config endpoint
    // If server returns 401, clear the invalid token
    const attempt = () => {
      getAppConfig()
        .then((cfg) => {
          configRetryRef.current = 0;
          setConfigError(null);
          setMonitorGuildId(cfg.monitorGuildId ?? "");
          setDashboardIsPublic(cfg.dashboardIsPublic);

          // Check if we have a session token (new auth) or legacy password (backward compat)
          const sessionToken = getSessionToken();
          const storedPassword = getAdminPassword();
          if (sessionToken || cfg.dashboardIsPublic || storedPassword) {
            setAuthState("authenticated");
          } else {
            setAuthState("unauthenticated");
          }
        })
        .catch((err) => {
          // If server responds with 401, token is invalid — clear it
          if (err?.statusCode === 401 || err?.status === 401) {
            clearSessionToken();
            setAuthState("unauthenticated");
            return;
          }
          configRetryRef.current += 1;
          const isNetwork =
            err instanceof TypeError &&
            (err.message === "Failed to fetch" ||
              err.message.includes("NetworkError") ||
              err.message.includes("network"));

          if (isNetwork && configRetryRef.current < MAX_CONFIG_RETRIES) {
            // Retry with backoff: 1s, 2s, 3s
            const delay = configRetryRef.current * 1000;
            configTimeoutRef.current = setTimeout(attempt, delay);
          } else {
            // Final failure — show auth overlay with retry button
            setConfigError(
              isNetwork
                ? "Cannot reach server. Check your connection and try again."
                : "Failed to load configuration.",
            );
            setAuthState("unauthenticated");
          }
        });
    };
    attempt();

    return () => {
      if (configTimeoutRef.current) {
        clearTimeout(configTimeoutRef.current);
        configTimeoutRef.current = null;
      }
    };
  }, []);

  const audio = useAudioPlayback();
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
      setActiveSpeakers((prev: (ActiveSpeaker & { heardAt?: number })[]) =>
        updateSpeakerList(prev, {
          userId: data.userId,
          username: data.username,
          avatar: data.avatar,
          speaking: data.speaking,
        }),
      );
    },
    onVoiceRecordingStarted: (data) =>
      window.dispatchEvent(
        new CustomEvent("voice_recording_started", { detail: data }),
      ),
    onVoiceRecordingStopped: (data) =>
      window.dispatchEvent(
        new CustomEvent("voice_recording_stopped", { detail: data }),
      ),
    onVoiceAnalyzed: (data) =>
      window.dispatchEvent(
        new CustomEvent("voice_analyzed", { detail: data }),
      ),
    onMessageCreated: (m) =>
      messages.setMessages((prev) => {
        // Skip if message already exists with same status (dedup)
        const existing = prev.find((i) => i.id === m.id);
        if (existing && existing.ai_status === m.ai_status) return prev;
        return mergeMessages(prev, [m]);
      }),
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
      messages.setMessages((prev) => {
        // Skip if message already analyzed with same status (dedup)
        const existing = prev.find((i) => i.id === msg.id);
        if (existing && existing.ai_status === msg.ai_status) return prev;
        return mergeMessages(prev, [msg]);
      });
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
  const monitorGuildRef = useRef(monitorGuildId);
  monitorGuildRef.current = monitorGuildId;

  useEffect(() => {
    const currentGuild = monitorGuildRef.current;
    if (!currentGuild) return;
    const interval = setInterval(() => {
      messages.fetchMessages(monitorGuildRef.current).catch(() => undefined);
    }, 15_000);
    return () => {
      clearInterval(interval);
    };
  }, [monitorGuildId]);

  // Stale speaker pruning — remove speakers not heard from in 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSpeakers((prev: (ActiveSpeaker & { heardAt?: number })[]) => {
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

  // ── Command palette keyboard shortcut handler ──────────────────────────────
  const handlePaletteOpen = useCallback((mode: "search" | "shortcuts") => {
    setPaletteMode(mode);
    setPaletteOpen(true);
  }, []);

  const handlePaletteClose = useCallback(() => {
    setPaletteOpen(false);
    setPaletteMode(null);
  }, []);

  const handlePaletteNavigate = useCallback(
    (tab: string) => {
      patchUIState({ activeTab: tab as DashboardTab });
      handlePaletteClose();
    },
    [patchUIState, handlePaletteClose],
  );

  // ── Tab navigation handler ─────────────────────────────────────────────────
  const handleTabChange = useCallback(
    (tab: DashboardTab) => {
      patchUIState({ activeTab: tab });
    },
    [patchUIState],
  );

  // ── Render main content based on active tab ────────────────────────────────
  const renderContent = () => {
    switch (activeTab) {
      case "live":
        return (
          <ErrorBoundary message="Live panel crashed">
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
          </ErrorBoundary>
        );
      case "dashboard":
        return (
          <ErrorBoundary message="Dashboard panel crashed">
            <DashboardPanel />
          </ErrorBoundary>
        );
      case "settings":
        return (
          <ErrorBoundary message="Settings panel crashed">
            <SettingsPanel
              themeMode={mode}
              isDark={isDark}
              onThemeModeChange={setMode}
            />
          </ErrorBoundary>
        );
      default:
        return (
          <ErrorBoundary message="Messages panel crashed">
            <MessagesPanel
              guildName={monitorGuildName}
              messages={messages.messages}
              onReanalyze={messages.reanalyze}
              onReanalyzeAllErrors={messages.reanalyzeAllErrors}
              onLoadMore={messages.loadMore}
              hasMore={messages.hasMore}
              loadingMore={messages.loadingMore}
            />
          </ErrorBoundary>
        );
    }
  };

  // ── Render: Auth loading ─────────────────────────────────────────────────
  if (authState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            {configError
              ? "Connection lost — retrying..."
              : `Connecting to server${".".repeat(configRetryRef.current)}`}
          </p>
        </div>
      </div>
    );
  }

  // ── Render: Auth overlay ─────────────────────────────────────────────────
  if (authState === "unauthenticated") {
    return (
      <AuthOverlay
        isPublic={dashboardIsPublic}
        onAuthenticated={() => setAuthState("authenticated")}
        configError={configError}
        onRetryConfig={() => {
          setConfigError(null);
          setAuthState("loading");
          configRetryRef.current = 0;
          // Re-trigger the config fetch by forcing remount via key trick
          // Actually: just re-run attempt logic
          getAppConfig()
            .then((cfg) => {
              setMonitorGuildId(cfg.monitorGuildId ?? "");
              setDashboardIsPublic(cfg.dashboardIsPublic);
              const sessionToken = getSessionToken();
              const storedPassword = getAdminPassword();
              if (sessionToken || cfg.dashboardIsPublic || storedPassword) {
                setAuthState("authenticated");
              } else {
                setAuthState("unauthenticated");
              }
            })
            .catch(() => {
              setConfigError("Server still unreachable. Try again later.");
              setAuthState("unauthenticated");
            });
        }}
      />
    );
  }

  // ── Render: Main app (authenticated) ─────────────────────────────────────
  return (
    <>
      <DashboardLayout
        activeTab={activeTab}
        wsStatus={socket.status}
        voiceStatus={voice.voiceStatus}
        themeMode={mode}
        isDark={isDark}
        onTabChange={handleTabChange}
        onThemeToggle={toggleTheme}
        recentMessages={messages.messages}
        guildId={monitorGuildId}
        channelId={
          uiState.selectedTextChannel || uiState.selectedVoiceChannel || undefined
        }
        notificationCount={notifBadge.count}
      >
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
      </DashboardLayout>
      <MobileTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
      <ModerationAlertListener />
      <CommandPalette
        isOpen={paletteOpen}
        mode={paletteMode}
        onClose={handlePaletteClose}
        onNavigate={handlePaletteNavigate}
        onToggleTheme={toggleTheme}
        isDark={isDark}
      />
    </>
  );
}
