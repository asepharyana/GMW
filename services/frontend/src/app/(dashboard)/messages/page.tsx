/**
 * Messages — Server Component.
 * Reads URL guild/channel/selected/tab on the server; seeds first page SSR.
 */
import { getMessages, type MessagePageResult } from "@/lib/api/server";
import MessagesView from "./view";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const guild = typeof sp.guild === "string" ? sp.guild : "";
  const channel = typeof sp.channel === "string" ? sp.channel : "";
  const selected = typeof sp.selected === "string" ? sp.selected : null;
  const tab =
    typeof sp.tab === "string" && ["all", "images", "review"].includes(sp.tab)
      ? (sp.tab as "all" | "images" | "review")
      : "all";

  let initialPage: MessagePageResult | undefined;
  if (guild) {
    initialPage = await getMessages(guild, channel || undefined).catch(
      () => undefined,
    );
  }

  return (
    <MessagesView
      initialGuild={guild}
      initialChannel={channel}
      initialDetailId={selected}
      initialTab={tab}
      initialMessagePage={initialPage}
    />
  );
}
