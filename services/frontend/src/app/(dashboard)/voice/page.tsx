import { getGuilds, getVoiceStatus } from "@/lib/api/server";
import { VoiceView } from "./view";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  let status: import("@/lib/types").VoiceStatus | undefined;
  let guilds: import("@/lib/types").Guild[] | undefined;
  try {
    [status, guilds] = await Promise.all([getVoiceStatus(), getGuilds()]);
  } catch {
    /* client hooks surface errors */
  }
  return <VoiceView initialStatus={status} initialGuilds={guilds} />;
}
