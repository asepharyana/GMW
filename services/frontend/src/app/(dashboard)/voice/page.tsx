/**
 * Voice page — Server Component.
 *
 * Fetches the authoritative voice connection status + guild list on the server
 * so the first paint reflects the shared gateway voice state (which channel is
 * joined, across ALL users), independent of any single browser's WS history.
 */
import { getGuilds, getVoiceStatus } from "@/lib/api/server";
import VoiceView from "./view";

export default async function VoicePage() {
  const [status, guilds] = await Promise.allSettled([
    getVoiceStatus(),
    getGuilds(),
  ]);

  return (
    <VoiceView
      initialStatus={status.status === "fulfilled" ? status.value : undefined}
      initialGuilds={guilds.status === "fulfilled" ? guilds.value : undefined}
    />
  );
}
