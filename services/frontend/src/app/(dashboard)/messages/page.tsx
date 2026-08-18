import { PageTransition } from "@/components/shared";
import { getConfig, getGuilds } from "@/lib/api/server";
import { MessagesView } from "./view";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  let config: import("@/lib/types/guild").AppConfig | undefined;
  let guilds: import("@/lib/types").Guild[] | undefined;
  try {
    [config, guilds] = await Promise.all([getConfig(), getGuilds()]);
  } catch {
    /* client hooks surface errors */
  }
  return (
    <PageTransition>
      <MessagesView
        initialGuilds={guilds}
        initialGuildId={config?.monitorGuildId ?? null}
      />
    </PageTransition>
  );
}
