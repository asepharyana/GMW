import type { ReactNode } from "react";
import type { DashboardTab } from "../entities/ui/types";
import type { WsStatus } from "../shared/ws/socket";
import type { VoiceStatus } from "../shared/api/client";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface DashboardLayoutProps {
  activeTab: DashboardTab;
  wsStatus: WsStatus;
  voiceStatus: VoiceStatus;
  onTabChange: (tab: DashboardTab) => void;
  children: ReactNode;
}

export function DashboardLayout({ activeTab, wsStatus, voiceStatus, onTabChange, children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
        <main className="flex min-w-0 flex-1 flex-col">
          <Header activeTab={activeTab} wsStatus={wsStatus} voiceStatus={voiceStatus} />
          <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
