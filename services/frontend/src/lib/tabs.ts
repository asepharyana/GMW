import { LayoutDashboard, MessageSquare, Radio } from "lucide-react";

export const tabs = [
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "live", label: "Live", icon: Radio },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
] as const;

export type TabId = (typeof tabs)[number]["id"];
