import type { Client } from "discord.js-selfbot-v13";
import type { CommandMessage, CommandReply } from "../../shared/index.js";
import { createChildLogger } from "../../shared/logger/index.js";
import { messageStore } from "../message-capture/messageStore.js";

// ---------------------------------------------------------------------------
// ModerationHandler
// ---------------------------------------------------------------------------

export class ModerationHandler {
  private logger = createChildLogger("moderation-handler");

  constructor(private client: Client | null) {}

  setClient(client: Client): void {
    this.client = client;
  }

  async handleModerationAction(
    cmd: CommandMessage,
  ): Promise<CommandReply<unknown>> {
    const payload = cmd.payload as {
      message_id?: string;
      user_id?: string;
      guild_id?: string;
      channel_id?: string;
      action_type?: string;
      reason?: string;
      executed_by?: string;
    };

    if (
      !payload.message_id ||
      !payload.user_id ||
      !payload.guild_id ||
      !payload.action_type
    ) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "message_id, user_id, guild_id, and action_type are required",
      };
    }

    const validActions = [
      "delete_message",
      "mute_user",
      "warn_user",
      "kick_user",
      "ban_user",
    ] as const;
    if (
      !validActions.includes(
        payload.action_type as (typeof validActions)[number],
      )
    ) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: `Invalid action_type: ${payload.action_type}. Must be one of: ${validActions.join(", ")}`,
      };
    }

    try {
      // For delete_message, also actually delete via Discord if client is available
      if (payload.action_type === "delete_message" && this.client) {
        try {
          const channelId = String(cmd.payload.channel_id ?? "");
          if (channelId) {
            const channel = await this.client.channels.fetch(channelId);
            if (channel?.isText()) {
              const msg = await channel.messages
                .fetch(payload.message_id)
                .catch(() => null);
              if (msg) {
                await msg.delete().catch((err: unknown) => {
                  this.logger.warn(
                    { error: err, messageId: payload.message_id },
                    "Failed to delete message via Discord",
                  );
                });
              }
            }
          }
        } catch (err) {
          this.logger.warn(
            { error: err, messageId: payload.message_id },
            "Failed to fetch channel/message for deletion",
          );
        }
      }

      const action = await messageStore.createModerationAction({
        message_id: payload.message_id,
        user_id: payload.user_id,
        guild_id: payload.guild_id,
        action_type: payload.action_type as
          | "delete_message"
          | "mute_user"
          | "warn_user"
          | "kick_user"
          | "ban_user",
        reason: payload.reason ?? null,
        username: null,
        server_name: null,
        executed_by: payload.executed_by ?? "command-handler",
        status: "executed",
        error: null,
        executed_at: Date.now(),
      });

      this.logger.info(
        {
          actionId: action.id,
          actionType: payload.action_type,
          userId: payload.user_id,
        },
        "Moderation action executed",
      );

      return {
        id: cmd.id,
        success: true,
        data: action,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { error: message, commandId: cmd.id },
        "Failed to execute moderation action",
      );
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: message,
      };
    }
  }
}
