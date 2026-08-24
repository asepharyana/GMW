import { AmbientProvider } from "@/components/ambient/ambient-context";
import { Chatbot } from "@/components/chatbot/chatbot";
import { CommandPalette } from "@/components/command/command-palette";
import { ConstellationFrame } from "@/components/shell";
import { WsProvider } from "@/lib/ws/context";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AmbientProvider>
      <WsProvider>
        <ConstellationFrame>{children}</ConstellationFrame>
        <Chatbot />
        <CommandPalette />
      </WsProvider>
    </AmbientProvider>
  );
}
