import { AmbientProvider } from "@/components/ambient/ambient-context";
import { WsProvider } from "@/lib/ws/context";
import { AppFrame } from "@/components/shell";
import { Chatbot } from "@/components/chatbot/chatbot";
import { CommandPalette } from "@/components/command/command-palette";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AmbientProvider>
      <WsProvider>
        <AppFrame>{children}</AppFrame>
        <Chatbot />
        <CommandPalette />
      </WsProvider>
    </AmbientProvider>
  );
}
