import { PageTransition } from "@/components/shared";
import {
  getConfig,
  getGuilds,
  getMessages,
  getRecentEdits,
} from "@/lib/api/server";
import { MessagesView } from "./view";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  let config: import("@/lib/types/guild").AppConfig | undefined;
  let guilds: import("@/lib/types").Guild[] | undefined;
  let initialMessages: {
    data: import("@/lib/types").MessageRecord[];
    nextCursor: string | null;
  } | null = null;
  let initialEdits: import("@/lib/types").EditHistoryRow[] | undefined;
  try {
    [config, guilds] = await Promise.all([getConfig(), getGuilds()]);
    const gid = config?.monitorGuildId;
    if (gid) {
      initialMessages = await getMessages(gid, undefined, 50);
    }
    initialEdits = await getRecentEdits(50);
  } catch {
    /* client hooks surface errors */
  }
  return (
    <PageTransition>
      <MessagesView
        initialGuilds={guilds}
        initialGuildId={config?.monitorGuildId ?? null}
        initialMessages={initialMessages}
        initialEdits={initialEdits}
      />
    </PageTransition>
  );
}
