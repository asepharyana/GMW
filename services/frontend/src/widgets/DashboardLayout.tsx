import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { DashboardTab } from "../entities/ui/types";
import type { MessageRecord, VoiceStatus } from "../shared/api/client";
import { fadeSlideUp } from "../shared/hooks/useFramerStagger";
import type { WsStatus } from "../shared/ws/socket";
import { Header } from "./Header";
import { ParticleBackground } from "./particles/ParticleBackground";
import { Sidebar } from "./Sidebar";

interface DashboardLayoutProps {
  activeTab: DashboardTab;
  wsStatus: WsStatus;
  voiceStatus: VoiceStatus;
  onTabChange: (tab: DashboardTab) => void;
  children: ReactNode;
  recentMessages?: MessageRecord[];
  guildId?: string;
  channelId?: string;
}

export function DashboardLayout({
  activeTab,
  wsStatus,
  voiceStatus,
  onTabChange,
  children,
  recentMessages = [],
  guildId,
  channelId,
}: DashboardLayoutProps) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Sakura particle layer */}
      <ParticleBackground />

      <div className="relative flex min-h-screen">
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          recentMessages={recentMessages}
          guildId={guildId}
          channelId={channelId}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <Header
            activeTab={activeTab}
            wsStatus={wsStatus}
            voiceStatus={voiceStatus}
          />
          <motion.main
            key={activeTab}
            variants={fadeSlideUp}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-auto p-4 md:p-6 lg:p-8"
          >
            {children}
          </motion.main>
        </main>
      </div>
    </div>
  );
}
