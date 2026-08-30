import type { VoiceConnection } from "@discordjs/voice";
import { VoiceConnectionStatus } from "@discordjs/voice";
import type { Client, Guild, VoiceChannel } from "discord.js-selfbot-v13";
import {
  deleteVoiceAutoReconnect,
  listVoiceAutoReconnects,
  upsertVoiceAutoReconnect,
} from "@/shared/database/voiceAutoReconnectRepo.js";
import { AppError } from "@/shared/errors/index";
import { createChildLogger } from "@/shared/logger/index";
import { discordPlayer } from "./player.js";
import { startRecording, stopRecording } from "./recorder.js";

const logger = createChildLogger("voice-controller");

// ─── Types ───────────────────────────────────────────────────────────────

export interface GuildVoiceState {
  guildId: string;
  channelId: string;
  channelName: string;
  connectedAt: number;
}

export interface VoiceStatus {
  ready: boolean;
  connected: boolean;
  activeGuildId: string | null;
  activeChannelId: string | null;
  activeChannelName: string | null;
  /** Multi-guild: list of all active connections */
  connections: GuildVoiceState[];
}

export interface DisconnectOptions {
  /** Clear the persisted auto-reconnect row (explicit user leave). */
  clearPersisted?: boolean;
  /** Mark the disconnect as intentional so the rejoin monitor stops. */
  intentional?: boolean;
}

const REJOIN_MAX_ATTEMPTS = 5;
const REJOIN_BASE_DELAY_MS = 2_000;
const REJOIN_MAX_DELAY_MS = 30_000;

// ─── VoiceController ─────────────────────────────────────────────────────

export class VoiceController {
  private connections = new Map<string, GuildVoiceState>();
  private connecting = new Set<string>();
  /** Guilds whose disconnect was intentional (user leave / shutdown). */
  private intentionalGuilds = new Set<string>();
  /** Last known desired voice state, kept independent of live connection map. */
  private rejoinState = new Map<string, GuildVoiceState>();
  /** Current live connection per guild — for stale-callback invalidation. */
  private liveConnections = new Map<string, VoiceConnection>();
  /** Per-guild rejoin attempt counters + timers. */
  private rejoinAttempts = new Map<string, number>();
  private rejoinTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly client: Client) {}

  getStatus(): VoiceStatus {
    logger.debug("getStatus called");

    const primaryGuildId = this.connections.keys().next().value ?? null;
    const primary = primaryGuildId
      ? this.connections.get(primaryGuildId)
      : undefined;

    return {
      ready: this.client.isReady(),
      connected: this.connections.size > 0,
      activeGuildId: primary?.guildId ?? null,
      activeChannelId: primary?.channelId ?? null,
      activeChannelName: primary?.channelName ?? null,
      connections: Array.from(this.connections.values()),
    };
  }

  async connect(guildId: string, channelId: string): Promise<VoiceStatus> {
    logger.info({ guildId, channelId }, "connect called");
    if (!this.client.isReady()) {
      throw new AppError(
        "Discord client is not ready",
        "CLIENT_NOT_READY",
        409,
      );
    }

    if (this.connecting.has(guildId)) {
      throw new AppError(
        `Voice connection for guild ${guildId} is already in progress`,
        "CONNECT_IN_PROGRESS",
        409,
      );
    }

    this.connecting.add(guildId);

    try {
      // Disconnect existing connection for this guild first
      if (this.connections.has(guildId)) {
        await this.disconnectGuild(guildId, { intentional: true });
      }

      // Clear any outstanding rejoin work for this guild — we are (re)joining now.
      this.clearRejoin(guildId);
      this.intentionalGuilds.delete(guildId);

      const guild = this.getGuild(guildId);
      const channel =
        guild.channels.cache.get(channelId) ??
        (await guild.channels.fetch(channelId).catch(() => null));

      if (!channel) {
        // Channel no longer exists — drop the persisted row so we don't retry forever.
        await deleteVoiceAutoReconnect(guildId).catch(() => {});
        throw new AppError(
          "Voice channel not found",
          "VOICE_CHANNEL_NOT_FOUND",
          404,
        );
      }

      if (channel.type !== "GUILD_VOICE") {
        throw new AppError(
          "Selected channel is not a voice channel",
          "INVALID_CHANNEL_TYPE",
          400,
        );
      }

      const connection = await startRecording(
        this.client,
        channel as VoiceChannel,
      );
      if (!connection) {
        throw new AppError(
          "Failed to connect to voice channel",
          "VOICE_CONNECT_FAILED",
          500,
        );
      }

      // If this is the first connection, set it as the player's connection
      if (this.connections.size === 0) {
        discordPlayer.setConnection(connection as VoiceConnection);
      }

      const state: GuildVoiceState = {
        guildId,
        channelId,
        channelName: channel.name,
        connectedAt: Date.now(),
      };
      this.connections.set(guildId, state);
      this.rejoinState.set(guildId, state);
      this.liveConnections.set(guildId, connection as VoiceConnection);

      // Persist desired voice state for auto-reconnect (restart/reboot/kick).
      const now = Date.now();
      await upsertVoiceAutoReconnect({
        guild_id: guildId,
        channel_id: channelId,
        channel_name: channel.name,
        connected_at: now,
        updated_at: now,
      }).catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "Failed to persist voice auto-reconnect state",
        );
      });

      this.monitorConnection(guildId, connection);

      logger.info(
        { guildId, channelId, channelName: channel.name },
        "Voice connected",
      );

      return this.getStatus();
    } finally {
      this.connecting.delete(guildId);
    }
  }

  /**
   * Auto-reconnect on startup/restart: rejoin every persisted voice channel.
   * Called from the client `ready` handler. Non-fatal per-guild.
   */
  async autoReconnect(): Promise<void> {
    let states: Array<{
      guild_id: string;
      channel_id: string;
      channel_name: string | null;
    }> = [];
    try {
      states = await listVoiceAutoReconnects();
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Failed to load voice auto-reconnect states",
      );
      return;
    }

    if (states.length === 0) {
      logger.info("No persisted voice state — skipping auto-reconnect");
      return;
    }

    logger.info(
      { count: states.length },
      "Auto-reconnecting to persisted voice channels",
    );

    // Fire in parallel; each failure is logged but doesn't block the others.
    await Promise.allSettled(
      states.map(async (s) => {
        try {
          await this.connect(s.guild_id, s.channel_id);
        } catch (err) {
          logger.error(
            {
              guildId: s.guild_id,
              channelId: s.channel_id,
              channelName: s.channel_name,
              err: err instanceof Error ? err.message : String(err),
            },
            "Auto-reconnect failed for guild",
          );
        }
      }),
    );
  }

  async disconnect(opts?: DisconnectOptions): Promise<VoiceStatus> {
    // Default semantics for graceful shutdown: intentional (no rejoin during
    // teardown) but keep the persisted row so we rejoin on next boot.
    const effective = opts ?? { intentional: true };
    logger.info({ opts: effective }, "disconnect called");

    const guildIds = Array.from(this.connections.keys());
    for (const gid of guildIds) {
      await this.disconnectGuild(gid, effective);
    }

    discordPlayer.stop();
    return this.getStatus();
  }

  async disconnectGuild(
    guildId: string,
    opts?: DisconnectOptions,
  ): Promise<void> {
    logger.info({ guildId, opts }, "disconnectGuild called");
    if (opts?.intentional) {
      this.intentionalGuilds.add(guildId);
    }
    if (opts?.clearPersisted) {
      await deleteVoiceAutoReconnect(guildId).catch(() => {});
      // Manual leave — forget the desired state entirely.
      this.rejoinState.delete(guildId);
      this.intentionalGuilds.add(guildId);
    }
    if (this.connections.has(guildId)) {
      stopRecording(guildId);
      this.connections.delete(guildId);
    }
    this.liveConnections.delete(guildId);
    this.clearRejoin(guildId);
  }

  // ─── Rejoin monitor ───────────────────────────────────────────────────

  /**
   * Watch a live connection. If it drops WITHOUT us marking the guild as
   * intentional (user leave / shutdown), schedule a full rejoin with backoff.
   */
  private monitorConnection(
    guildId: string,
    connection: VoiceConnection,
  ): void {
    const onDrop = () => {
      // Ignore callbacks from a stale connection that has since been replaced.
      if (this.liveConnections.get(guildId) !== connection) {
        return;
      }

      // This connection object is dead.
      this.liveConnections.delete(guildId);
      if (this.connections.get(guildId)?.guildId === guildId) {
        this.connections.delete(guildId);
      }

      if (this.intentionalGuilds.has(guildId)) {
        logger.info({ guildId }, "Intentional disconnect — no auto-rejoin");
        return;
      }

      logger.warn(
        { guildId },
        "Voice dropped unexpectedly — scheduling rejoin",
      );
      this.scheduleRejoin(guildId);
    };

    connection.on(VoiceConnectionStatus.Disconnected, onDrop);
    connection.on(VoiceConnectionStatus.Destroyed, onDrop);
  }

  private scheduleRejoin(guildId: string): void {
    if (this.rejoinTimers.has(guildId)) {
      return; // already scheduled
    }
    if (this.intentionalGuilds.has(guildId)) {
      return;
    }

    const attempt = (this.rejoinAttempts.get(guildId) ?? 0) + 1;
    this.rejoinAttempts.set(guildId, attempt);

    const persisted = this.rejoinState.get(guildId);
    if (!persisted) {
      // Desired state was cleared — nothing to rejoin.
      this.clearRejoin(guildId);
      return;
    }

    if (attempt > REJOIN_MAX_ATTEMPTS) {
      logger.error(
        { guildId, channelId: persisted.channelId, attempt },
        "Rejoin attempts exhausted — keeping persisted state for next restart",
      );
      this.clearRejoin(guildId);
      return;
    }

    const delay = Math.min(
      REJOIN_BASE_DELAY_MS * 2 ** (attempt - 1),
      REJOIN_MAX_DELAY_MS,
    );
    logger.info(
      { guildId, channelId: persisted.channelId, attempt, delay },
      "Scheduling voice rejoin",
    );

    const timer = setTimeout(() => {
      this.rejoinTimers.delete(guildId);
      this.connect(guildId, persisted.channelId)
        .then(() => {
          this.rejoinAttempts.delete(guildId);
          logger.info({ guildId }, "Auto-rejoin succeeded");
        })
        .catch((err) => {
          logger.warn(
            {
              guildId,
              err: err instanceof Error ? err.message : String(err),
              attempt,
            },
            "Auto-rejoin attempt failed",
          );
          // Schedule the next attempt (the monitor is gone, so drive it here).
          this.scheduleRejoin(guildId);
        });
    }, delay);

    this.rejoinTimers.set(guildId, timer);
  }

  private clearRejoin(guildId: string): void {
    const timer = this.rejoinTimers.get(guildId);
    if (timer) {
      clearTimeout(timer);
      this.rejoinTimers.delete(guildId);
    }
    this.rejoinAttempts.delete(guildId);
  }

  private getGuild(guildId: string): Guild {
    const guild = this.client.guilds.cache.get(guildId);

    if (!guild) {
      throw new AppError("Guild not found", "GUILD_NOT_FOUND", 404);
    }

    return guild;
  }
}
