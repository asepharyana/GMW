import { getConfig, getGuilds } from "@/lib/api/server";
import { MessagesView } from "./view";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  let config = undefined;
  let guilds = undefined;
  try {
    [config, guilds] = await Promise.all([getConfig(), getGuilds()]);
  } catch {
    /* client hooks surface errors */
  }
  return <MessagesView initialGuilds={guilds} initialGuildId={config?.monitorGuildId ?? null} />;
}
