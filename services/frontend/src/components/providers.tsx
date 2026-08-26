"use client";

import { SWRConfig } from "swr";
import { swrConfig } from "@/lib/swr-config";

/**
 * Client-side SWR provider. Lives in its own client component so the config's
 * callbacks (shouldRetryOnError / onErrorRetry) never cross the server→client
 * boundary from the server-rendered root layout.
 */
export function SwrProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}
