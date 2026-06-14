import { motion } from "framer-motion";
import { LayoutDashboard, MessageSquare, Radio } from "lucide-react";
import type { DashboardTab, MessageRecord } from "../shared/api/client";
import { useMascotChat } from "../shared/hooks/useMascotChat";
import { cn } from "../shared/lib/utils";
import { MascotChatbot } from "./mascot/MascotChatbot";
import { MascotImage } from "./mascot/MascotImage";

const navItems: Array<{ id: DashboardTab; label: string; icon: typeof Radio }> =
  [
    { id: "messages", label: "Messages & Moderation", icon: MessageSquare },
    { id: "live", label: "Voice & Media", icon: Radio },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  ];

interface SidebarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  collapsed?: boolean;
  recentMessages?: MessageRecord[];
  guildId?: string;
  channelId?: string;
}

export function Sidebar({
  activeTab,
  onTabChange,
  collapsed = true,
  recentMessages = [],
  guildId,
  channelId,
}: SidebarProps) {
  const mascotChat = useMascotChat({
    messageCount: recentMessages.length,
    activeParticipants: new Set(
      recentMessages.map((message) => message.user_id),
    ).size,
    lastActivity: recentMessages.length > 0 ? "Active" : "Idle",
    topicsDiscussed: ["Messages", "Moderation"],
    guildId,
    channelId,
  });
  return (
    <>
      <motion.nav
        className={cn(
          "relative hidden shrink-0 flex-col overflow-visible border-r border-border/50 bg-background/70 backdrop-blur-sm transition-all duration-300 md:flex",
          collapsed ? "w-16" : "w-64",
        )}
        layout
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {/* App icon only — no branding text */}
        <div
          className={cn(
            "flex items-center py-5",
            collapsed ? "justify-center" : "flex-col px-4",
          )}
        >
          <img
            src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/docs/logo.svg"
            alt="IMPHNEN"
            className="h-8 w-8 rounded-xl"
          />

          {/* Mascot image — only when expanded */}
          {!collapsed && (
            <img
              src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/apps/dimentorin/public/image/mascot-1.png"
              alt="Mascot"
              className="mt-4 h-auto w-[140px] object-contain drop-shadow-md"
            />
          )}
        </div>

        {/* Navigation items — centered vertically */}
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
                    "group relative flex items-center rounded-xl p-2.5 text-sm font-medium transition-all duration-200 ease-out",
                    collapsed ? "justify-center" : "gap-3",
                    isActive
                      ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-primary/70",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mascot button */}
        <div className="flex justify-center pb-4">
          <button
            type="button"
            onClick={() => mascotChat.setIsOpen(!mascotChat.isOpen)}
            className="relative z-50 rounded-xl p-1 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/40"
            title="Chat dengan mascot"
          >
            <MascotImage size="sm" />
          </button>
        </div>
      </motion.nav>
      <MascotChatbot
        isOpen={mascotChat.isOpen}
        onClose={() => mascotChat.setIsOpen(false)}
        onSendMessage={mascotChat.handleSendMessage}
        mascotName="IMPHNEN Mascot"
        className="fixed bottom-[170px] left-[80px] z-[9999]"
      />
    </>
  );
}
