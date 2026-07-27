import "dotenv/config";
import type { AppConfig } from "@bete/shared/config";
import { loadConfig as sharedLoadConfig } from "@bete/shared/config";

// Re-export the unified config — all EFFECTIVE_* fields are already
// computed by the shared loadConfig().
export type { AppConfig };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return sharedLoadConfig(env);
}

export const config = loadConfig();
