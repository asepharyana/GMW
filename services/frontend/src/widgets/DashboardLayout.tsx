/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN DashboardLayout — The canvas for Guild Moderation Watcher
 * Approachable Modernism: clean surfaces, subtle grid pattern, spring
 * transitions, dan IMPHNEN signature glow.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { MessageRecord } from "../entities/message/types.js";
import type { DashboardTab } from "../entities/ui/types.js";
import type { VoiceStatus } from "../entities/voice/types.js";
import { fadeSlideUp } from "../shared/hooks/useFramerStagger";
import type { WsStatus } from "../shared/ws/socket";
import { Header } from "./Header";
import { ParticleBackground } from "./particles/ParticleBackground";
import { Sidebar } from "./Sidebar";
import { TabStrip } from "./TabStrip";

interface DashboardLayoutProps {
  activeTab: DashboardTab;
  wsStatus: WsStatus;
  voiceStatus: VoiceStatus;
  onTabChange: (tab: DashboardTab) => void;
  children: ReactNode;
  recentMessages?: MessageRecord[];
  guildId?: string;
  channelId?: string;
  guildName?: string;
  flaggedCount?: number;
  moderationQueue?: number;
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
  flaggedCount = 0,
}: DashboardLayoutProps) {
  return (
    <div className="relative min-h-screen bg-white text-[#1a1a1a]">
      {/* Background layers */}
      <ParticleBackground />
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          opacity: 0.5,
        }}
      />

      <div className="relative flex min-h-screen">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          recentMessages={recentMessages}
          guildId={guildId}
          channelId={channelId}
          flaggedCount={flaggedCount}
        />

        {/* Main Content Area */}
        <main className="flex min-w-0 flex-1 flex-col">
          <Header
            wsStatus={wsStatus}
            voiceStatus={voiceStatus}
          />

          <TabStrip activeTab={activeTab} onTabChange={onTabChange} />

          {/* Page Content with entry animation */}
          <motion.main
            key={activeTab}
            variants={fadeSlideUp}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-auto p-4 md:p-6 lg:p-8"
            style={{ maxWidth: "1280px", margin: "0 auto", width: "100%" }}
          >
            {children}
          </motion.main>
        </main>
      </div>
    </div>
  );
}
