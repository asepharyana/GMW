import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoHandler } from "../src/modules/command-handler/video.handler.js";
import * as streamWatch from "../src/modules/voice-recording/streamWatchReceiver.js";

// ─── mocks ─────────────────────────────────────────────────────────────
function makeClient({ botId = "bot1", channelType = "GUILD_VOICE" } = {}) {
  const activeChannel = {
    id: "c1",
    name: "Lounge",
    type: channelType,
    members: { has: vi.fn(() => false) },
  };
  const guild = {
    id: "g1",
    channels: {
      cache: new Map([["c1", activeChannel]]),
      fetch: vi.fn().mockResolvedValue(new Map()),
    },
  };
  return {
    user: { id: botId },
    guilds: {
      cache: new Map([["g1", guild]]),
      fetch: vi.fn().mockResolvedValue(guild),
    },
  };
}

function makeVoiceController(activeChannelId = "c1") {
  return {
    getStatus: vi.fn().mockReturnValue({ activeChannelId, connected: true }),
  };
}

function makeCmd(type: string, payload: Record<string, unknown>) {
  return { id: "req-1", type, payload, replyChannel: "ch:1" };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(streamWatch, "startStreamWatch").mockResolvedValue();
  vi.spyOn(streamWatch, "stopStreamWatch").mockImplementation(() => {});
});

describe("VideoHandler", () => {
  it("rejects when gateway not initialized", async () => {
    const handler = new VideoHandler(null, null);
    const reply = await handler.handleVideoWatch(makeCmd("video:watch", {}));
    expect(reply.success).toBe(false);
    expect(reply.error).toContain("not initialized");
  });

  it("rejects when guildId/userId missing", async () => {
    const handler = new VideoHandler(makeClient(), makeVoiceController());
    const reply = await handler.handleVideoWatch(
      makeCmd("video:watch", { guildId: "g1" }),
    );
    expect(reply.success).toBe(false);
    expect(reply.error).toContain("guildId and userId are required");
  });

  it("rejects watching the selfbot's own stream", async () => {
    const handler = new VideoHandler(
      makeClient({ botId: "bot1" }),
      makeVoiceController(),
    );
    const reply = await handler.handleVideoWatch(
      makeCmd("video:watch", { guildId: "g1", userId: "bot1" }),
    );
    expect(reply.success).toBe(false);
    expect(reply.error).toContain("own stream");
  });

  it("returns error when no active voice channel found", async () => {
    // Freeze the cache so no channel resolves.
    const client = makeClient();
    client.guilds.cache.get("g1").channels.cache.clear();
    const handler = new VideoHandler(client, makeVoiceController());
    const reply = await handler.handleVideoWatch(
      makeCmd("video:watch", { guildId: "g1", userId: "user-x" }),
    );
    expect(reply.success).toBe(false);
    expect(reply.error).toContain("No active voice channel");
  });

  it("calls startStreamWatch with resolved channel + userId and replies success", async () => {
    const client = makeClient();
    const handler = new VideoHandler(client, makeVoiceController("c1"));
    const reply = await handler.handleVideoWatch(
      makeCmd("video:watch", { guildId: "g1", userId: "user-x" }),
    );
    expect(reply.success).toBe(true);
    expect(reply.data).toMatchObject({
      status: "requested",
      guildId: "g1",
      channelId: "c1",
      userId: "user-x",
    });
    expect(streamWatch.startStreamWatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1" }),
      "user-x",
    );
  });

  it("prefers an explicit channelId over the active one", async () => {
    const client = makeClient();
    // Add a second voice channel.
    const guild = client.guilds.cache.get("g1");
    guild.channels.cache.set("c9", {
      id: "c9",
      name: "Other",
      type: "GUILD_VOICE",
      members: { has: vi.fn(() => false) },
    });
    const handler = new VideoHandler(client, makeVoiceController("c1"));
    const reply = await handler.handleVideoWatch(
      makeCmd("video:watch", {
        guildId: "g1",
        userId: "user-x",
        channelId: "c9",
      }),
    );
    expect(reply.success).toBe(true);
    expect(streamWatch.startStreamWatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c9" }),
      "user-x",
    );
  });

  it("handleVideoUnwatch calls stopStreamWatch", async () => {
    const handler = new VideoHandler(makeClient(), makeVoiceController());
    const reply = await handler.handleVideoUnwatch(
      makeCmd("video:unwatch", { guildId: "g1", userId: "user-x" }),
    );
    expect(reply.success).toBe(true);
    expect(streamWatch.stopStreamWatch).toHaveBeenCalledWith("g1", "user-x");
  });

  it("handleVideoUnwatch rejects missing args", async () => {
    const handler = new VideoHandler(makeClient(), makeVoiceController());
    const reply = await handler.handleVideoUnwatch(
      makeCmd("video:unwatch", { guildId: "g1" }),
    );
    expect(reply.success).toBe(false);
    expect(reply.error).toContain("guildId and userId are required");
  });
});
