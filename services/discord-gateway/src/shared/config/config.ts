import "dotenv/config";
import type { AppConfig } from "@/shared/config/index";
import { loadConfig as sharedLoadConfig } from "@/shared/config/index";

// Re-export the unified config — all EFFECTIVE_* fields are already
// computed by the shared loadConfig().
export type { AppConfig };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return sharedLoadConfig(env);
}

export const config = loadConfig();
