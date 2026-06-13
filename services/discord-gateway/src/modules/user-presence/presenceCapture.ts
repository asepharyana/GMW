import { createChildLogger } from "@bete/shared/logger";
import type { Client, Presence } from "discord.js-selfbot-v13";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js";

const logger = createChildLogger("presence-tracking");

// ─── Cooldown per user (30s) ─────────────────────────────────────────────
const presenceCooldowns = new Map<string, number>();
const PRESENCE_COOLDOWN_MS = 30_000;

function isMonitoredGuild(guildId: string | null | undefined): boolean {
  if (!guildId) return false;
  const guildIds = (config as any).EFFECTIVE_MONITOR_GUILD_IDS as string[] | undefined;
  if (!guildIds || guildIds.length === 0) return config.MONITOR_GUILD_ID === guildId;
  return guildIds.includes(guildId);
}

function getStatus(presence: Presence): string {
  if (!presence) return "offline";
  const status = presence.status;
  if (status === "online" || status === "idle" || status === "dnd") return status;
  return "offline";
}

function getActivities(presence: Presence): Array<{ name: string; type: string }> {
  if (!presence?.activities) return [];
  return presence.activities.map((a) => ({
    name: a.name ?? "unknown",
    type: String(a.type ?? "custom"),
  }));
}

function getClientStatus(presence: Presence): Record<string, string> | null {
  const cs = (presence as any).clientStatus ?? (presence as any).client_status;
  if (!cs) return null;
  const result: Record<string, string> = {};
  for (const [platform, status] of Object.entries(cs)) {
    result[platform] = String(status);
  }
  return result;
}

export function registerPresenceCapture(
  client: Client,
  eventBroadcaster: EventBroadcaster,
): void {
  logger.info("Registering presence capture");

  client.on("presenceUpdate", async (_oldPresence: Presence | null, newPresence: Presence) => {
    if (!newPresence?.guildId) return;
    if (!isMonitoredGuild(newPresence.guildId)) return;

    const userId = newPresence.userId ?? newPresence.user?.id;
    if (!userId) return;

    // Cooldown check
    const now = Date.now();
    const lastUpdate = presenceCooldowns.get(userId);
    if (lastUpdate && now - lastUpdate < PRESENCE_COOLDOWN_MS) return;
    presenceCooldowns.set(userId, now);

    const data = {
      user_id: userId,
      username: newPresence.user?.username ?? "unknown",
      status: getStatus(newPresence),
      activities: getActivities(newPresence),
      client_status: getClientStatus(newPresence),
      guild_id: newPresence.guildId,
      last_changed: now,
    };

    logger.debug({ userId, status: data.status }, "Presence updated");
    await eventBroadcaster.presenceUpdated(data).catch(() => {});

    // Periodic cleanup of stale cooldown entries
    if (presenceCooldowns.size > 1000) {
      const threshold = now - PRESENCE_COOLDOWN_MS * 10;
      for (const [uid, ts] of presenceCooldowns) {
        if (ts < threshold) presenceCooldowns.delete(uid);
      }
    }
  });
}
