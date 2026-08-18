import { PageTransition } from "@/components/shared";
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
  return (
    <PageTransition>
      <VoiceView initialStatus={status} initialGuilds={guilds} />
    </PageTransition>
  );
}
