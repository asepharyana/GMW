import useSWR from "swr";
import { knowledgeApi } from "@/lib/api";
import type { ChannelCultureRow, GlossaryRow } from "@/lib/types";

export function useChannelCultures(
  limit = 100,
  initialData?: ChannelCultureRow[],
) {
  return useSWR<ChannelCultureRow[]>(
    ["channel-cultures", limit],
    () => knowledgeApi.channelCultures(limit),
    { fallbackData: initialData },
  );
}

export function useGlossary(limit = 100, initialData?: GlossaryRow[]) {
  return useSWR<GlossaryRow[]>(
    ["glossary", limit],
    () => knowledgeApi.glossary(limit),
    { fallbackData: initialData },
  );
}
