/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN Sidebar — Navigation command center
 * Minimal, collapsed by default, dengan Mascot yang playful.
 * Fokus: Guild Moderation Watcher untuk komunitas IMPHNEN.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { motion } from "framer-motion";
import {
  LayoutDashboard,
  MessageSquare,
  Radio,
} from "lucide-react";
import type { MessageRecord } from "../entities/message/types.js";
import type { DashboardTab } from "../entities/ui/types.js";
import { useMascotChat } from "../shared/hooks/useMascotChat";
import { cn } from "../shared/lib/utils";
import { MascotChatbot } from "./mascot/MascotChatbot";
import { MascotImage } from "./mascot/MascotImage";

const navItems: Array<{
  id: DashboardTab;
  label: string;
  icon: typeof Radio;
  badge?: string;
}> = [
  {
    id: "messages",
    label: "Pesan & Moderasi",
    icon: MessageSquare,
    badge: "Live",
  },
  {
    id: "live",
    label: "Voice & Media",
    icon: Radio,
  },
  {
    id: "dashboard",
    label: "Dashboard Guild",
    icon: LayoutDashboard,
  },
];

interface SidebarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  collapsed?: boolean;
  recentMessages?: MessageRecord[];
  guildId?: string;
  channelId?: string;
  flaggedCount?: number;
}

export function Sidebar({
  activeTab,
  onTabChange,
  collapsed = false,
  recentMessages = [],
  guildId,
  channelId,
  flaggedCount = 0,
}: SidebarProps) {
  const mascotChat = useMascotChat({
    messageCount: recentMessages.length,
    activeParticipants: new Set(
      recentMessages.map((message) => message.user_id),
    ).size,
    lastActivity: recentMessages.length > 0 ? "Aktif" : "Idle",
    topicsDiscussed: ["Pesan", "Moderasi"],
    guildId,
    channelId,
  });

  return (
    <>
      <motion.nav
        className={cn(
          "relative hidden shrink-0 flex-col overflow-visible",
          "border-r border-[#e0e0e0]/50",
          "bg-white/70 backdrop-blur-sm",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "md:flex",
          collapsed ? "w-16" : "w-64",
        )}
        layout
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {/* ── Brand Icon ────────────────────────────────────────────── */}
        <div
          className={cn(
            "flex items-center py-5",
            collapsed ? "justify-center" : "flex-col px-4",
          )}
        >
          {/* Logo */}
          <div className="relative">
            <img
              src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/docs/logo.svg"
              alt="IMPHNEN"
              className="h-8 w-8 rounded-xl"
            />
            {/* Live indicator dot */}
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#22c55e] ring-2 ring-white animate-pulse" />
          </div>

          {/* Brand text when expanded */}
          {!collapsed && (
            <div className="mt-4 text-center">
              <h2 className="font-sans text-sm font-bold text-[#1a1a1a]">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#23a1eb] to-[#5865f2]">
                  IMPHNEN
                </span>
              </h2>
              <p className="font-sans text-[10px] font-medium text-[#666666] mt-0.5 tracking-wider uppercase">
                Guild Watcher
              </p>
            </div>
          )}

          {/* Mascot — only when expanded */}
          {!collapsed && (
            <img
              src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/apps/dimentorin/public/image/mascot-1.png"
              alt="Mascot IMPHNEN"
              className="mt-4 h-auto w-[120px] object-contain drop-shadow-md hover:animate-mascot-wiggle cursor-pointer"
              onClick={() => mascotChat.setIsOpen(!mascotChat.isOpen)}
            />
          )}
        </div>

        {/* ── Navigation Items ──────────────────────────────────────── */}
        <div className="flex flex-1 flex-col justify-center">
          <div className="flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex items-center rounded-xl p-2.5",
                    "font-sans text-sm font-medium",
                    "transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
                    collapsed ? "justify-center" : "gap-3",
                    isActive
                      ? "bg-[#e1f0fd] text-[#23a1eb] ring-1 ring-[#23a1eb]/20"
                      : "text-[#666666] hover:bg-[#e1f0fd]/50 hover:text-[#23a1eb]/70",
                  )}
                >
                  <div className="relative">
                    <Icon className="h-4 w-4 shrink-0" />
                    {/* Flagged dot indicator */}
                    {item.id === "messages" && flaggedCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#e4405f] ring-1 ring-white" />
                    )}
                  </div>
                  {!collapsed && (
                    <div className="flex items-center justify-between flex-1 min-w-0">
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="font-sans text-[10px] font-semibold text-[#23a1eb] bg-[#e1f0fd] px-1.5 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Bottom: Mascot Chat Button ────────────────────────────── */}
        <div className="flex justify-center pb-4">
          <button
            type="button"
            onClick={() => mascotChat.setIsOpen(!mascotChat.isOpen)}
            className={cn(
              "relative z-50 rounded-xl p-1.5",
              "transition-all duration-200 hover:scale-105",
              "focus:outline-none focus:ring-2 focus:ring-[#23a1eb]/40",
              mascotChat.isOpen && "bg-[#e1f0fd] ring-1 ring-[#23a1eb]/30",
            )}
            title="Chat dengan Mascot"
          >
            <div className="relative">
              <MascotImage size="sm" />
              {mascotChat.isOpen && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#23a1eb] ring-1 ring-white" />
              )}
            </div>
          </button>
        </div>
      </motion.nav>

      {/* ── Mascot Chatbot Panel ────────────────────────────────────── */}
      <MascotChatbot
        isOpen={mascotChat.isOpen}
        onClose={() => mascotChat.setIsOpen(false)}
        onSendMessage={mascotChat.handleSendMessage}
        mascotName="Mascot IMPHNEN"
        className="fixed bottom-[170px] left-[80px] z-[9999]"
      />
    </>
  );
}
