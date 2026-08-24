"use client";

import { ChannelCultureGlossary } from "@/components/ChannelCultureGlossary";
import { SkeletonPanel } from "@/components/shared";
import { useChannelCultures } from "@/hooks";
import type { ChannelCultureRow } from "@/lib/types";

export function ChannelsView({
  initialCultures,
}: {
  initialCultures?: ChannelCultureRow[];
}) {
  const { data: cultures } = useChannelCultures(100, initialCultures);
  return (
    <div className="space-y-5">
      {cultures ? (
        <ChannelCultureGlossary cultures={cultures} />
      ) : (
        <SkeletonPanel rows={6} />
      )}
    </div>
  );
}
