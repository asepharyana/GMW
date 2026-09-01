import { promises as fsPromises } from "node:fs";
import {
  type DiscordGatewayAdapterCreator,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  type VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import type {
  Client,
  Guild,
  VoiceChannel,
  VoiceState,
} from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import { retryWithBackoff } from "@/shared/utils/index";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js";
import type { VoicePcmWsClient } from "../voice-pcm-ws/index.js";
import {
  createRecordingSession,
  type RecordingSession,
} from "./recorder/sessionRecording.js";
import { createSpeakingHandler } from "./recorder/speakingHandler.js";
import { hookScreenShareAudio } from "./screenShareAudio.js";
import { hookVideoReceiver } from "./videoReceiver.js";
import { trackChannel, untrackChannel } from "./videoRecorder.js";

const logger = createChildLogger("recorder");

let _eventBroadcaster: EventBroadcaster | undefined;

/** @internal Export for uploader.ts to broadcast voice_recording_uploaded events */
export { _eventBroadcaster };

export function setEventBroadcaster(broadcaster: EventBroadcaster | undefined) {
  _eventBroadcaster = broadcaster;
}

/**
 * Force the bot (self member) to be unmuted + undeafened at the SERVER level.
 *
 * Why: a server-muted / server-deafened bot cannot receive/record other
 * members' audio properly (and definitely cannot receive their video/screen
 * share). The bot's own voice state may be server-muted/deafened by an admin
 * or by a prior state. This issues a REST guild-members PATCH with
 * `mute:false, deaf:false`.
 *
 * Requires the `MUTE_MEMBERS` + `DEAFEN_MEMBERS` permissions on the bot
 * (user has granted them). Failures are logged, never fatal — an unmute
 * failure must not break the voice join/recording.
 *
 * Exported so the video-receive path (videoRecorder.ts → streamWatch) can
 * re-assert it right before requesting STREAM_WATCH — a server-deafened bot
 * is NOT sent the streamer's audiovisual RTP, which is why no video arrives
 * even when the DAVE watch reaches Ready. Server-deaf can silently revert on
 * reconnect/restart, so this is re-invoked on every video watch attempt.
 */
export async function forceSelfServerUnmuteUndeafen(
  client: Client,
  guild: Guild,
): Promise<void> {
  try {
    const selfId = client.user?.id;
    if (!selfId) return;
    await guild.members.edit(selfId, { mute: false, deaf: false });
    // Verify the PATCH actually landed — read back the live member voice state.
    const fresh = guild.members.cache.get(selfId);
    const stillDeaf = fresh?.voice?.deaf ?? false;
    logger.info(
      { guildId: guild.id, stillDeaf },
      stillDeaf
        ? "Forced bot server unmute + undeafen (but guild reports still deaf — will retry on next video)"
        : "Forced bot server unmute + undeafen",
    );
  } catch (err) {
    logger.warn(
      {
        guildId: guild.id,
        err: err instanceof Error ? err.message : String(err),
      },
      "Could not force server unmute/undeafen (permissions not granted?)",
    );
  }
}

/**
 * Attach an IMMEDIATE self-undeafen / self-unmute guard on `voiceStateUpdate`.
 *
 * Previous behaviour only re-asserted unmute/undeafen on video-watch attempts
 * and after voice reconnects — so when an admin server-muted or
 * server-deafened the bot the bot stayed muted/deafened until the *next* video
 * watch or reconnect cycle (could be minutes or never if no streamer came on).
 *
 * This listener fires on EVERY guild voice-state change. When it detects that
 * the bot's OWN voice state transitioned to serverDeaf||serverMute === true,
 * it immediately re-issues `mute:false, deaf:false` so the bot is unmuted/
 * undeafened instantly (well within Discord's rate limit window for the bot's
 * own member). Idempotent and best-effort — failures are logged, never fatal.
 *
 * Idempotent: safe to call multiple times; the listener is attached once.
 */
let _selfVoiceGuardAttached = false;
export function registerSelfVoiceStateGuard(client: Client): void {
  if (_selfVoiceGuardAttached) return;
  _selfVoiceGuardAttached = true;
  client.on(
    "voiceStateUpdate",
    (oldState: VoiceState, newState: VoiceState) => {
      void handleSelfVoiceStateUpdate(client, oldState, newState);
    },
  );
}

async function handleSelfVoiceStateUpdate(
  client: Client,
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  // Only react to the bot's own voice state transitions.
  const selfId = client.user?.id;
  if (!selfId || newState.id !== selfId) return;

  const justServerMuted = !oldState.serverMute && newState.serverMute === true;
  const justServerDeafed = !oldState.serverDeaf && newState.serverDeaf === true;
  if (!justServerMuted && !justServerDeafed) return;

  const guild = newState.guild;
  if (!guild) return;

  logger.info(
    {
      guildId: guild.id,
      serverMuted: justServerMuted,
      serverDeafed: justServerDeafed,
    },
    "Bot was server-muted/deafened — immediately self-undeafening + unmuting",
  );
  // Fire-and-forget the corrective edit; forceSelfServerUnmuteUndeafen logs.
  void forceSelfServerUnmuteUndeafen(client, guild);
}

let _pcmWsClient: VoicePcmWsClient | undefined;

export function setPcmWsClient(client: VoicePcmWsClient | undefined) {
  _pcmWsClient = client;
}

const recordingsDir = config.RECORDINGS_DIR;

// Ensure recordings directory exists
(async () => {
  try {
    await fsPromises.mkdir(recordingsDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, that's fine
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      logger.error({ error }, "Failed to create recordings directory");
    }
  }
})();

const activeSessions = new Map<string, RecordingSession>();

export function resetActiveSessions(): void {
  activeSessions.clear();
}

function finalizeActiveRecordingSession(guildId: string): void {
  const session = activeSessions.get(guildId);
  if (!session) return;
  activeSessions.delete(guildId);
  // Per-segment upload is the real flow; session metadata is written alongside
  // each segment by finalizeSegment in segment.ts
  logger.debug(
    { sessionId: session.sessionId, guildId },
    "Active recording session finalized",
  );
}

/**
 * Join ke voice channel dan mulai merekam semua user yang bicara.
 */
export async function startRecording(
  client: Client,
  channel: VoiceChannel,
): Promise<VoiceConnection | null> {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild
      .voiceAdapterCreator as DiscordGatewayAdapterCreator,
    selfDeaf: false,
    selfMute: false,
    debug: true,
  });

  logger.info({ channelName: channel.name }, "Joining voice channel");

  connection.on("debug", (msg) => {
    if (config.VERBOSE) {
      logger.debug({ message: msg }, "Voice debug");
    }
  });

  connection.on("error", (err) => {
    logger.error({ error: err }, "Voice connection error");
  });

  // Wait until fully connected with retry logic
  try {
    await retryWithBackoff(
      () =>
        entersState(
          connection,
          VoiceConnectionStatus.Ready,
          config.VOICE_CONNECTION_TIMEOUT_MS,
        ),
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
      },
    );
    logger.info("Connected to voice channel. Recording started");

    // Auto undeafen + unmute the bot itself at the server level (MUTE_MEMBERS /
    // DEAFEN_MEMBERS permission granted). Server-muted/deafened bot can't
    // receive others' audio/video. Fire-and-forget — never blocks recording.
    void forceSelfServerUnmuteUndeafen(client, channel.guild);

    // Create recording session after connection is ready
    const sessionStartTime = Date.now();
    const session = createRecordingSession({
      guildId: channel.guild.id,
      channelId: channel.id,
      channelName: channel.name,
      startTime: sessionStartTime,
    });
    activeSessions.set(channel.guild.id, session);
    // Register this channel for video recording (others' camera/screen share).
    trackChannel(channel.guild.id, channel);
  } catch (err) {
    logger.error({ error: err }, "Failed to connect to voice channel");
    connection.destroy();
    return null;
  }

  const receiver = connection.receiver;

  // Use the extracted speaking handler for voice activity
  const speakingHandler = createSpeakingHandler({
    client,
    channel,
    receiver,
    eventBroadcaster: _eventBroadcaster,
    activeSessions,
    recordingsDir,
    pcmSender: _pcmWsClient
      ? (pcm, userId) => _pcmWsClient?.sendPcm(userId, pcm)
      : undefined,
  });

  receiver.speaking.on("start", speakingHandler);

  // ── Screen-share audio capture ──────────────────────────────────────
  // Discord GoLive sends screen-share audio on a SEPARATE SSRC from the
  // user's microphone. `receiver.speaking` only fires for voice (mic) SSRCs,
  // so screen-share audio is silently dropped unless we hook the UDP receiver
  // to discover and register those SSRCs.
  hookScreenShareAudio(receiver, speakingHandler);

  // ── Video capture (camera + screen share) ───────────────────────────
  // @discordjs/voice only decrypts/forwards audio (opus). Video RTP (H264,
  // VP8/VP9/AV1) arrives on the same UDP socket but is dropped by the opus
  // gate. hookVideoReceiver wraps onUdpMessage, decrypts video payload types
  // with the connection secret key (reusing receiver.parsePacket), then
  // depacketizes H264 to AnnexB and writes a raw .h264 stream per user.
  // Order matters: video hook must be installed AFTER the screen-share audio
  // hook so non-video packets delegate down the existing wrapper chain.
  hookVideoReceiver(receiver, client, recordingsDir);

  // Handle unexpected disconnection
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    if (config.VERBOSE) {
      logger.warn("Disconnected from voice channel. Reconnecting...");
    }
    try {
      await Promise.race([
        entersState(
          connection,
          VoiceConnectionStatus.Signalling,
          config.RECONNECT_TIMEOUT_MS,
        ),
        entersState(
          connection,
          VoiceConnectionStatus.Connecting,
          config.RECONNECT_TIMEOUT_MS,
        ),
      ]);
      // Reconnected successfully
      // Server-deaf can silently revert across a reconnect — re-assert the bot
      // is undeafened + unmuted so video receive keeps working.
      void forceSelfServerUnmuteUndeafen(client, channel.guild);
    } catch {
      logger.error("Could not reconnect. Destroying connection");
      connection.destroy();
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    finalizeActiveRecordingSession(channel.guild.id);
    untrackChannel(channel.guild.id);
    if (config.VERBOSE) {
      logger.info("Voice connection destroyed");
    }
  });

  return connection;
}

/**
 * Stop recording and disconnect from voice channel.
 */
export function stopRecording(guildId: string): void {
  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    if (config.VERBOSE) {
      logger.info("Recording stopped and disconnected");
    }
  } else {
    logger.warn("No active connection to stop");
  }
  untrackChannel(guildId);

  const session = activeSessions.get(guildId);
  finalizeActiveRecordingSession(guildId);

  // Broadcast voice_recording_stopped + finalize session
  if (session && _eventBroadcaster) {
    const snapshot = session.snapshot(Date.now());
    const stoppedAt = Date.now();

    _eventBroadcaster
      .voiceRecordingStopped({
        guild_id: guildId,
        session_id: session.sessionId,
        duration_ms: snapshot.durationMs,
        participants: snapshot.participants.length,
        segment_count: snapshot.segments.length,
        status: snapshot.status,
        stopped_at: stoppedAt,
      })
      .catch((err) =>
        logger.warn({ err }, "Failed to broadcast voice recording stopped"),
      );

    // Auto-enqueue muxer job if there are multiple segments
    const segments = snapshot.segments;
    if (segments.length >= 2) {
      const outputFile = `${config.RECORDINGS_DIR}/merged/${session.sessionId}.mp3`;
      import("./muxer.js")
        .then(({ enqueueMuxerJob }) => {
          enqueueMuxerJob({
            inputs: segments.map((s) => s.oggPath),
            output: outputFile,
            guildId,
            channelId: snapshot.channelId,
            sessionId: session.sessionId,
          }).catch(() => {});
        })
        .catch(() => {});
    }
  }
}
