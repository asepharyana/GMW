import { orpc } from "@/lib/orpc/client";
import type { ChannelCultureRow, GlossaryRow } from "@/lib/types";

export const knowledgeApi = {
  channelCultures: (limit = 100, search?: string) =>
    orpc.knowledge.channelCultures({
      limit,
      search,
    }) as unknown as Promise<ChannelCultureRow[]>,

  glossary: (limit = 100, search?: string) =>
    orpc.knowledge.glossary({
      limit,
      search,
    }) as unknown as Promise<GlossaryRow[]>,
};
