import { describe, expect, it } from "vitest";
import { shouldCaptureMessageLocation } from "../../src/moderation/messageCapture";

describe("shouldCaptureMessageLocation", () => {
  it("matches only configured text guild and optional channel", () => {
    expect(
      shouldCaptureMessageLocation(
        { guildId: "guild-1", channelId: "channel-1" },
        { guildId: "guild-1", channelId: "channel-1" },
      ),
    ).toBe(true);

    expect(
      shouldCaptureMessageLocation(
        { guildId: "guild-1", channelId: "channel-2" },
        { guildId: "guild-1", channelId: "channel-1" },
      ),
    ).toBe(false);

    expect(
      shouldCaptureMessageLocation(
        { guildId: "guild-2", channelId: "channel-1" },
        { guildId: "guild-1", channelId: "channel-1" },
      ),
    ).toBe(false);
  });

  it("skips ignored channels", () => {
    expect(
      shouldCaptureMessageLocation(
        { guildId: "guild-1", channelId: "1310988070996414494" },
        { guildId: "guild-1" },
      ),
    ).toBe(false);

    expect(
      shouldCaptureMessageLocation(
        { guildId: "guild-1", channelId: "1265679542144467035" },
        { guildId: "guild-1" },
      ),
    ).toBe(false);

    expect(
      shouldCaptureMessageLocation(
        { guildId: "guild-1", channelId: "1310867899745046558" },
        { guildId: "guild-1" },
      ),
    ).toBe(false);
  });
});
