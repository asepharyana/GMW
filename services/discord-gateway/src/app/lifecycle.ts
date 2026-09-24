import type { Client } from "discord.js-selfbot-v13";
import type { Logger } from "@/shared/logger/index.js";
import { startPendingAIAnalysisWorker } from "../modules/ai-moderation/index.js";
import { registerChannelTopicCapture } from "../modules/channel-topic/index.js";
import type { CommandHandler } from "../modules/command-handler/commandHandler.js";
import type { EventBroadcaster } from "../modules/event-broadcaster/index.js";
import { registerGuildMemberEvents } from "../modules/guild-member-events/index.js";
import {
  registerMessageCapture,
  setEventBroadcaster as setMessageCaptureEventBroadcaster,
  setModerationEventBroadcaster,
} from "../modules/message-capture/index.js";
import { startDigestScheduler } from "../modules/monitor/digestScheduler.js";
import { registerReactionCapture } from "../modules/reaction-tracking/index.js";
import { registerThreadCapture } from "../modules/thread-tracking/index.js";
import { registerPresenceCapture } from "../modules/user-presence/index.js";
import { startRetentionCleanup } from "./retention.js";

export interface GatewayLifecycleOptions {
  client: Client;
  eventBroadcaster: EventBroadcaster;
  commandHandler: CommandHandler;
  logger: Logger;
}

/**
 * Wires everything that must start once Discord is connected.
 *
 * Ordering matters:
 *  1. Inject the event broadcaster into the modules that publish events —
 *     they must be able to publish before their listeners are registered.
 *  2. Register the Discord event listeners (capture modules).
 *  3. Start the background workers/schedulers.
 */
export function startGatewayLifecycle({
  client,
  eventBroadcaster,
  commandHandler,
  logger,
}: GatewayLifecycleOptions): void {
  // 1. Inject broadcaster first so no captured event is dropped.
  setMessageCaptureEventBroadcaster(eventBroadcaster);
  setModerationEventBroadcaster(eventBroadcaster);

  // 2. Discord event listeners.
  registerMessageCapture(client);
  registerReactionCapture(client, eventBroadcaster);
  registerThreadCapture(client, eventBroadcaster);
  registerPresenceCapture(client, eventBroadcaster);
  registerChannelTopicCapture(client, eventBroadcaster);
  registerGuildMemberEvents(client, eventBroadcaster);

  // 3. Background workers + schedulers.
  startPendingAIAnalysisWorker(client, eventBroadcaster);
  commandHandler.start(client);
  logger.info("Command handler started");

  startRetentionCleanup();
  // Weekly moderation digest (public, automated)
  startDigestScheduler();
}
