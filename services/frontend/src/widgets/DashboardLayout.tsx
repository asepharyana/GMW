import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import type { MessageRecord } from "../entities/message/types.js";
import type { DashboardTab } from "../entities/ui/types.js";
import type { VoiceStatus } from "../entities/voice/types.js";
import type { ThemeMode } from "../hooks/useTheme";
import { fadeSlideUp } from "../shared/hooks/useFramerStagger";
import type { WsStatus } from "../shared/ws/socket";
import { Header } from "./Header";
import { ParticleBackground } from "./particles/ParticleBackground";
import { Sidebar } from "./Sidebar";

interface DashboardLayoutProps {
  activeTab: DashboardTab;
  wsStatus: WsStatus;
  voiceStatus: VoiceStatus;
  themeMode: ThemeMode;
  isDark: boolean;
  onTabChange: (tab: DashboardTab) => void;
  onThemeToggle: () => void;
  children: ReactNode;
  recentMessages?: MessageRecord[];
  guildId?: string;
  channelId?: string;
  notificationCount?: number;
}

export function DashboardLayout({
  activeTab,
  wsStatus,
  voiceStatus,
  themeMode,
  isDark,
  onTabChange,
  onThemeToggle,
  children,
  recentMessages = [],
  guildId,
  channelId,
  notificationCount = 0,
}: DashboardLayoutProps) {
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
          activeTab={activeTab}
          onTabChange={onTabChange}
          recentMessages={recentMessages}
          guildId={guildId}
          channelId={channelId}
          notificationCount={notificationCount}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <Header
            activeTab={activeTab}
            wsStatus={wsStatus}
            voiceStatus={voiceStatus}
            themeMode={themeMode}
            isDark={isDark}
            onThemeToggle={onThemeToggle}
          />
          <AnimatePresence mode="wait">
            <motion.main
              key={activeTab}
              variants={fadeSlideUp}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 pb-16 md:pb-0"
            >
              {children}
            </motion.main>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
