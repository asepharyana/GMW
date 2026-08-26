import { getChannelCultures } from "@/lib/api/server";
import type { ChannelCultureRow } from "@/lib/types";
import { ChannelsView } from "./view";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  let cultures: ChannelCultureRow[] | undefined;
  try {
    cultures = await getChannelCultures(100);
  } catch {
    cultures = undefined;
  }
  return <ChannelsView initialCultures={cultures} />;
}
