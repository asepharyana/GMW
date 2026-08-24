import { AmbientProvider } from "@/components/ambient/ambient-context";
import { Chatbot } from "@/components/chatbot/chatbot";
import { CommandPalette } from "@/components/command/command-palette";
import { AppFrame } from "@/components/shell";
import { WsProvider } from "@/lib/ws/context";

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
