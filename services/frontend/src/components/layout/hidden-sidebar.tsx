"use client";

import { useState } from "react";
import { GuildSelector } from "@/components/shared/guild-selector";

interface HiddenSidebarProps {
  guildId: string;
  onGuildChange: (guildId: string) => void;
}

export function HiddenSidebar({ guildId, onGuildChange }: HiddenSidebarProps) {
  const [visible, setVisible] = useState(false);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const handleMouseEnter = () => {
    if (hideTimer) clearTimeout(hideTimer);
    setVisible(true);
  };

  const handleMouseLeave = () => {
    hideTimer = setTimeout(() => setVisible(false), 300);
  };

  return (
    <>
      {/* Hotspot trigger */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: transparent mouse detection zone, not interactive content */}
      <div
        className="fixed left-0 top-0 bottom-0 w-1 z-50"
        onMouseEnter={handleMouseEnter}
      />

      {/* Sidebar */}
      <div
        role="region"
        aria-label="Guild selector sidebar"
        className={`fixed left-0 top-0 bottom-0 z-40 w-56 glass-intense border-r border-glass-border transition-transform duration-150 ease-out ${
          visible ? "translate-x-0" : "-translate-x-full"
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex h-11 items-center gap-2 px-4 border-b border-glass-border">
          <span className="text-xs font-semibold tracking-wider uppercase text-text-secondary">
            Guilds
          </span>
        </div>
        <div className="p-3 space-y-4">
          <GuildSelector value={guildId} onChange={onGuildChange} />
        </div>
      </div>
    </>
  );
}
