import process from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
  vi.resetModules();
});

describe("loadConfig", () => {
  it("loads required values and coerces optional values", async () => {
    // dotenv/config loads from .env when config.ts is imported, so
    // override the relevant env vars that would be inherited from there
    process.env = {
      ...originalEnv,
      DISCORD_TOKEN: "token",
      GUILD_ID: undefined as unknown as string,
      VOICE_CHANNEL_ID: undefined as unknown as string,
      MONITOR_GUILD_ID: undefined as unknown as string,
      VERBOSE: "true",
      WEBSERVER_PORT: "4000",
      NODE_ENV: "test",
    };

    const { loadConfig } = await import("../src/config");
    const config = loadConfig(process.env);

    expect(config.DISCORD_TOKEN).toBe("token");
    expect(config.GUILD_ID).toBeUndefined();
    expect(config.VOICE_CHANNEL_ID).toBeUndefined();
    expect(config.VERBOSE).toBe(true);
    expect(config.WEBSERVER_PORT).toBe(4000);
    expect(config.RECORDINGS_DIR).toBe("./recordings");
    expect(config.NODE_ENV).toBe("test");
    expect(config.TELE_UPLOAD_URL).toBe(
      "https://upload.asepharyana.tech/api/upload",
    );
    expect(config.AI_ANALYSIS_DEBOUNCE_MS).toBe(500);
    expect(config.AI_ANALYSIS_RECOVERY_INTERVAL_MS).toBe(15000);
    expect(config.AI_ANALYSIS_ERROR_COOLDOWN_MS).toBe(30000);
    expect(config.AI_ANALYSIS_MAX_BATCH_SIZE).toBe(200);
    expect(config.AI_ANALYSIS_MAX_CONTEXT_TOKENS).toBe(8000);
    expect(config.AI_ANALYSIS_CONTEXT_MESSAGE_LIMIT).toBe(20);
    expect(config.AUTO_MIGRATE_ON_STARTUP).toBe(true);
  });

  it("coerces AI analysis tuning values", async () => {
    process.env = {
      ...originalEnv,
      DISCORD_TOKEN: "token",
      AI_ANALYSIS_DEBOUNCE_MS: "750",
      AI_ANALYSIS_RECOVERY_INTERVAL_MS: "20000",
      AI_ANALYSIS_ERROR_COOLDOWN_MS: "45000",
      AI_ANALYSIS_MAX_BATCH_SIZE: "40",
      AI_ANALYSIS_MAX_CONTEXT_TOKENS: "12000",
      AI_ANALYSIS_CONTEXT_MESSAGE_LIMIT: "35",
      NODE_ENV: "test",
    };

    const { loadConfig } = await import("../src/config");
    const config = loadConfig(process.env);

    expect(config.AI_ANALYSIS_DEBOUNCE_MS).toBe(750);
    expect(config.AI_ANALYSIS_RECOVERY_INTERVAL_MS).toBe(20000);
    expect(config.AI_ANALYSIS_ERROR_COOLDOWN_MS).toBe(45000);
    expect(config.AI_ANALYSIS_MAX_BATCH_SIZE).toBe(40);
    expect(config.AI_ANALYSIS_MAX_CONTEXT_TOKENS).toBe(12000);
    expect(config.AI_ANALYSIS_CONTEXT_MESSAGE_LIMIT).toBe(35);
  });

  it("derives split text and voice guild defaults from legacy config", async () => {
    process.env = {
      ...originalEnv,
      DISCORD_TOKEN: "token",
      MONITOR_GUILD_ID: "legacy-text-guild",
      GUILD_ID: "legacy-voice-guild",
      VOICE_CHANNEL_ID: "voice-channel",
      NODE_ENV: "test",
    };

    const { loadConfig } = await import("../src/config");
    const config = loadConfig(process.env);

    expect(config.TEXT_GUILD_ID).toBeUndefined();
    expect(config.EFFECTIVE_TEXT_GUILD_ID).toBe("legacy-text-guild");
    expect(config.EFFECTIVE_VOICE_GUILD_ID).toBe("legacy-voice-guild");
    expect(config.VOICE_CHANNEL_ID).toBe("voice-channel");
  });

  it("uses explicit split text and voice config before legacy values", async () => {
    process.env = {
      ...originalEnv,
      DISCORD_TOKEN: "token",
      MONITOR_GUILD_ID: "legacy-text-guild",
      GUILD_ID: "legacy-voice-guild",
      TEXT_GUILD_ID: "text-guild",
      TEXT_CHANNEL_ID: "text-channel",
      VOICE_GUILD_ID: "voice-guild",
      VOICE_CHANNEL_ID: "voice-channel",
      NODE_ENV: "test",
    };

    const { loadConfig } = await import("../src/config");
    const config = loadConfig(process.env);

    expect(config.EFFECTIVE_TEXT_GUILD_ID).toBe("text-guild");
    expect(config.TEXT_CHANNEL_ID).toBe("text-channel");
    expect(config.EFFECTIVE_VOICE_GUILD_ID).toBe("voice-guild");
  });

  it("allows disabling startup migrations explicitly", async () => {
    process.env = {
      ...originalEnv,
      DISCORD_TOKEN: "token",
      AUTO_MIGRATE_ON_STARTUP: "false",
      NODE_ENV: "test",
    };

    const { loadConfig } = await import("../src/config");
    const config = loadConfig(process.env);

    expect(config.AUTO_MIGRATE_ON_STARTUP).toBe(false);
  });
});
