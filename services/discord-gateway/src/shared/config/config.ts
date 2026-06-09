import "dotenv/config";
import type { AppConfig as SharedAppConfig } from "@bete/shared/config";
import { config as sharedConfig, loadConfig as sharedLoadConfig } from "@bete/shared/config";

// Re-export the unified config with EFFECTIVE_* fields added
export type AppConfig = SharedAppConfig & {
  EFFECTIVE_TEXT_GUILD_ID?: string;
  EFFECTIVE_VOICE_GUILD_ID?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = sharedLoadConfig(env);
  return {
    ...parsed,
    EFFECTIVE_TEXT_GUILD_ID: parsed.MONITOR_GUILD_ID,
    EFFECTIVE_VOICE_GUILD_ID: parsed.VOICE_GUILD_ID ?? parsed.GUILD_ID,
  };
}

export const config = loadConfig();
