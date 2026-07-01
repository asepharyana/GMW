// ─── LiveShell.tsx — Page shell for /live ────────────────────────────────────
// Composes Sidebar, Header, ParticleBackground, and the four live islands
// (VoiceControls, ActiveSpeakers, AudioVisualizer, NowPlaying) into a full-page
// responsive layout.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  getGuilds,
  getVoiceChannels,
  getVoiceStatus,
} from "../shared/api/client.js";
import { Header } from "../shared/components/Header.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../shared/components/index.js";
import { ParticleBackground } from "../shared/components/particles/ParticleBackground.js";
import { Sidebar } from "../shared/components/Sidebar.js";
import { useTheme } from "../shared/hooks/useTheme.js";
import type { Channel, Guild } from "../shared/types/guild.js";
import type { VoiceStatus } from "../shared/types/voice.js";
import { useVoiceStore } from "../stores/voice-store.js";
import ActiveSpeakers from "./ActiveSpeakers.js";
import AudioVisualizer from "./AudioVisualizer.js";
import NowPlaying from "./NowPlaying.js";
import VoiceControls from "./VoiceControls.js";

const emptyVoiceStatus: VoiceStatus = {
  connected: false,
  activeGuildId: null,
  activeChannelId: null,
  activeChannelName: null,
  connections: [],
};

export default function LiveShell() {
  const { mode, isDark, toggle: toggleTheme } = useTheme();
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>(emptyVoiceStatus);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);

  // Watch store for guild changes so we can fetch voice channels
  const guildId = useVoiceStore((state) => state.guildId);

  // Fetch initial data on mount
  useEffect(() => {
    getVoiceStatus()
      .then(setVoiceStatus)
      .catch(() => {
        /* offline — leave default */
      });
    getGuilds()
      .then(setGuilds)
      .catch(() => {
        /* offline — leave default */
      });
  }, []);

  // Refetch voice channels when guild selection changes
  useEffect(() => {
    if (guildId) {
      getVoiceChannels(guildId)
        .then(setVoiceChannels)
        .catch(() => setVoiceChannels([]));
    } else {
      setVoiceChannels([]);
    }
  }, [guildId]);

  const handleTabChange = useCallback((tab: string) => {
    if (tab !== "live") {
      window.location.href = "/";
    }
  }, []);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Background layers */}
      <ParticleBackground />
      <div
        className="fixed inset-0 pointer-events-none grid-pattern opacity-[0.03]"
        aria-hidden="true"
      />

      <div className="relative flex min-h-screen">
        <Sidebar
          activeTab="live"
          onTabChange={handleTabChange}
          collapsed={false}
          recentMessages={[]}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <Header
            activeTab="live"
            wsStatus="disconnected"
            voiceStatus={voiceStatus}
            themeMode={mode}
            isDark={isDark}
            onThemeToggle={toggleTheme}
          />

          <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 pb-16 md:pb-0">
            {/* Responsive grid: stacks on <1024px */}
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              {/* Main content column */}
              <div className="space-y-6">
                <VoiceControls guilds={guilds} voiceChannels={voiceChannels} />

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Live Audio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AudioVisualizer barCount={48} height={32} />
                  </CardContent>
                </Card>

                <NowPlaying />
              </div>

              {/* Sidebar column */}
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Active Speakers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ActiveSpeakers />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
