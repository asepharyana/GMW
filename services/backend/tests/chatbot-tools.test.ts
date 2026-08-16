import { describe, expect, it } from "vitest";
import { tools } from "../src/modules/chatbot/chatbot.toolDefs.js";

const names = tools.map((t) => t.function.name);

describe("chatbot tool definitions", () => {
  it("exposes a stable, non-empty tool set", () => {
    expect(tools.length).toBeGreaterThanOrEqual(10);
    expect(new Set(names).size).toBe(names.length); // no dup names
  });

  it("every tool declares a name, description, and object parameters", () => {
    for (const t of tools) {
      expect(t.type).toBe("function");
      expect(typeof t.function.name).toBe("string");
      expect(t.function.description.length).toBeGreaterThan(10);
      expect(t.function.parameters.type).toBe("object");
    }
  });

  it("required-only tools declare required args", () => {
    const byName = new Map(tools.map((t) => [t.function.name, t]));
    for (const [name, required] of [
      ["search_messages", "query"],
      ["get_user_messages", "userId"],
      ["get_user_profile", "userId"],
      ["get_user_reputation", "userId"],
      ["get_channel_culture", "channelId"],
      ["get_message_detail", "messageId"],
    ] as const) {
      const tool = byName.get(name);
      expect(tool, `missing tool ${name}`).toBeDefined();
      expect(tool!.function.parameters.required).toContain(required);
    }
  });

  it("covers the core server-watcher situations", () => {
    for (const required of [
      "get_server_stats",
      "get_top_channels",
      "get_recent_activity",
      "get_top_flagged",
      "search_messages",
      "get_user_messages",
      "get_user_profile",
      "get_user_reputation",
      "get_channel_culture",
      "get_message_detail",
      "get_message_reviews",
      "get_voice_recordings",
      "get_moderation_timeline",
      "get_corrections",
    ]) {
      expect(names, `missing ${required}`).toContain(required);
    }
  });
});
