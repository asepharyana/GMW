import { type ClientOptions, Options } from "discord.js-selfbot-v13";

export function createDiscordClientOptions(): ClientOptions {
  return {
    makeCache: Options.cacheWithLimits({
      ...Options.defaultMakeCacheSettings,
      MessageManager: 25,
      ReactionManager: 0,
      ReactionUserManager: 0,
      PresenceManager: 0,
    }),
    partials: ["USER", "CHANNEL", "GUILD_MEMBER", "MESSAGE"],
    sweepers: {
      messages: { interval: 300, lifetime: 600 },
      threads: { interval: 3600, lifetime: 14400 },
    },
    restRequestTimeout: 15_000,
    retryLimit: 2,
    restGlobalRateLimit: 45,
  };
}
