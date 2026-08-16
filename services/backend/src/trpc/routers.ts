import { z } from "zod";
import { analysisService } from "../modules/analysis/analysis.service";
import { chatRequestSchema } from "../modules/chatbot/chatbot.schema";
import { chatbotService } from "../modules/chatbot/chatbot.service";
// ── Service imports ──────────────────────────────────────────────
import { dashboardService } from "../modules/dashboard/dashboard.service";
import {
  mediaLoopSchema,
  mediaQueueSchema,
} from "../modules/media/media.schema";
import {
  getStatus,
  queue,
  setLoop,
  skip,
  stop,
} from "../modules/media/media.service";
import { messageQuerySchema } from "../modules/messages/messages.schema";
import { messagesService } from "../modules/messages/messages.service";
import { moderationService } from "../modules/moderation/moderation.service";
import { recordingsService } from "../modules/recordings/recordings.service";
import { uiStateService } from "../modules/ui-state/ui-state.service";
import {
  connectVoice,
  disconnectVoice,
  getGuilds,
  getTextChannels,
  getVoiceChannels,
  getVoiceStatus,
} from "../modules/voice/voice.service";
import { config } from "../shared/config/index";
import { publishCommandNoReply } from "../shared/redis/index";
import { logger, publicProcedure, router } from "./trpc";

// ── Dashboard ────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: publicProcedure.query(() => dashboardService.getStats()),
  activity: publicProcedure
    .input(
      z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }),
    )
    .query(({ input }) => dashboardService.getActivity(input.days)),
  users: publicProcedure
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(20),
        cursor: z.string().optional(),
        search: z.string().optional(),
      }),
    )
    .query(({ input }) =>
      dashboardService.listUsers({
        limit: input.limit,
        cursor: input.cursor,
        search: input.search,
      }),
    ),
  userDetail: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) => dashboardService.getUserDetail(input.userId)),
  channels: publicProcedure
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(20),
        search: z.string().optional(),
        guildId: z.string().optional(),
      }),
    )
    .query(({ input }) =>
      dashboardService.listChannels({
        limit: input.limit,
        search: input.search,
        guildId: input.guildId,
      }),
    ),
  channelDetail: publicProcedure
    .input(z.object({ channelId: z.string() }))
    .query(({ input }) => dashboardService.getChannelDetail(input.channelId)),
  reactions: publicProcedure
    .input(z.object({ limit: z.coerce.number().int().positive().default(20) }))
    .query(({ input }) => dashboardService.getTopReactions(input.limit)),
  reactors: publicProcedure
    .input(z.object({ limit: z.coerce.number().int().positive().default(20) }))
    .query(({ input }) => dashboardService.getTopReactors(input.limit)),
});

// ── Messages ─────────────────────────────────────────────────────
const messagesRouter = router({
  list: publicProcedure
    .input(messageQuerySchema)
    .query(({ input }) => messagesService.listMessages(input)),
  byChannel: publicProcedure
    .input(
      z.object({
        channelId: z.string(),
        query: messageQuerySchema,
      }),
    )
    .query(({ input }) =>
      messagesService.getMessagesByChannel(input.channelId, input.query),
    ),
  detail: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => messagesService.getMessageById(input.id)),
  images: publicProcedure
    .input(
      z.object({
        guildId: z.string(),
        limit: z.coerce.number().int().positive().default(50),
      }),
    )
    .query(({ input }) =>
      messagesService.getImageMessages(input.guildId, input.limit),
    ),
  attachmentsByChannel: publicProcedure
    .input(
      z.object({
        channelId: z.string(),
        query: messageQuerySchema,
      }),
    )
    .query(({ input }) =>
      messagesService.getAttachmentsByChannel(input.channelId, input.query),
    ),
  review: publicProcedure
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(20),
        channelId: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const rows = await messagesService.getReviewMessages(
        input.channelId,
        input.limit,
      );
      return { results: rows, limit: input.limit, cursor: null };
    }),
});

// ── Moderation ───────────────────────────────────────────────────
const moderationRouter = router({
  stats: publicProcedure.query(() => moderationService.getStats()),
  actions: publicProcedure
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(50),
        status: z.string().optional(),
        actionType: z.string().optional(),
        cursor: z.coerce.number().int().optional(),
      }),
    )
    .query(({ input }) =>
      moderationService.listActions({
        limit: input.limit,
        status: input.status,
        actionType: input.actionType,
        cursor: input.cursor,
      }),
    ),
});

// ── Media ────────────────────────────────────────────────────────
const mediaRouter = router({
  status: publicProcedure.query(() => getStatus()),
  queue: publicProcedure.input(mediaQueueSchema).mutation(async ({ input }) => {
    await queue(input.source, input.mode);
    return getStatus();
  }),
  skip: publicProcedure.mutation(async () => {
    await skip();
    return getStatus();
  }),
  stop: publicProcedure.mutation(async () => {
    await stop();
    return getStatus();
  }),
  loop: publicProcedure.input(mediaLoopSchema).mutation(async ({ input }) => {
    await setLoop(input.loop);
    return getStatus();
  }),
});

// ── Voice ─────────────────────────────────────────────────────────
const voiceRouter = router({
  guilds: publicProcedure.query(() => getGuilds()),
  textChannels: publicProcedure
    .input(z.object({ guildId: z.string() }))
    .query(({ input }) => getTextChannels(input.guildId)),
  voiceChannels: publicProcedure
    .input(z.object({ guildId: z.string() }))
    .query(({ input }) => getVoiceChannels(input.guildId)),
  status: publicProcedure.query(() => getVoiceStatus()),
  connect: publicProcedure
    .input(z.object({ guildId: z.string(), channelId: z.string() }))
    .mutation(async ({ input }) => {
      await connectVoice(input.guildId, input.channelId);
      return getVoiceStatus();
    }),
  disconnect: publicProcedure.mutation(async () => {
    await disconnectVoice();
    return getVoiceStatus();
  }),
  command: publicProcedure
    .input(z.object({ command: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await publishCommandNoReply(input.command);
      return { success: true, command: input.command };
    }),
});

// ── Recordings ───────────────────────────────────────────────────
const recordingsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(50),
        channelId: z.string().optional(),
        userId: z.string().optional(),
        cursor: z.string().optional(),
      }),
    )
    .query(({ input }) =>
      recordingsService.getRecent(input.limit, {
        channelId: input.channelId,
        userId: input.userId,
        cursor: input.cursor,
      }),
    ),
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await recordingsService.deleteById(input.id);
      return { ok: true };
    }),
});

// ── Analysis (search) ──────────────────────────────────────────────
const analysisRouter = router({
  search: publicProcedure
    .input(
      z.object({
        q: z.string().default(""),
        channelId: z.string().optional(),
        limit: z.coerce.number().int().positive().default(20),
      }),
    )
    .query(({ input }) =>
      analysisService.search({
        q: input.q,
        channelId: input.channelId,
        limit: input.limit,
      }),
    ),
});

// ── Chatbot ───────────────────────────────────────────────────────
const chatbotRouter = router({
  chat: publicProcedure
    .input(
      chatRequestSchema.extend({
        // Per-device actor id; the old REST layer used an X-User-Id header.
        // Anonymous sessions use a stable "anonymous" id.
        userId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const userId = input.userId ?? "anonymous";
      const response = await chatbotService.processMessage(
        input.message,
        input.context,
        userId,
      );
      await chatbotService.saveConversation({
        userId,
        userMessage: input.message,
        botResponse: response,
        context: input.context,
        timestamp: new Date(),
      });
      return { response, timestamp: new Date().toISOString() };
    }),
  history: publicProcedure
    .input(
      z.object({
        limit: z.coerce.number().int().positive().max(100).default(50),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const userId = input.userId ?? "anonymous";
      const history = await chatbotService.getChatHistory(userId, input.limit);
      return { history, total: history.length };
    }),
  clearHistory: publicProcedure
    .input(z.object({ userId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const userId = input.userId ?? "anonymous";
      await chatbotService.clearChatHistory(userId);
      return { ok: true };
    }),
});

// ── Config (public dashboard config snapshot) ──────────────────────
const configRouter = router({
  get: publicProcedure.query(() => ({
    monitorGuildId: config.MONITOR_GUILD_ID || null,
    webserverPort: config.WEBSERVER_PORT,
    nodeEnv: config.NODE_ENV,
    backlogSyncHours: config.BACKLOG_SYNC_HOURS,
    backlogSyncBatchSize: config.BACKLOG_SYNC_BATCH_SIZE,
    retentionMessagesDays: config.RETENTION_MESSAGES_DAYS,
    retentionAttachmentsDays: config.RETENTION_ATTACHMENTS_DAYS,
    retentionVoiceDays: config.RETENTION_VOICE_DAYS,
    autoDeleteFlaggedEnabled: config.AUTO_DELETE_FLAGGED_ENABLED,
    aiAnalysisEnabled: config.AI_ANALYSIS_ENABLED,
    voiceGuildId: config.VOICE_GUILD_ID || null,
    voiceChannelId: config.VOICE_CHANNEL_ID || null,
    logLevel: config.LOG_LEVEL,
  })),
});

// ── UI State ──────────────────────────────────────────────────────
const uiStateRouter = router({
  get: publicProcedure.query(() => uiStateService.getState()),
  update: publicProcedure
    .input(z.record(z.string(), z.unknown()))
    .mutation(({ input }) => uiStateService.updateState(input)),
});

// ── Root router ───────────────────────────────────────────────────
export const appRouter = router({
  dashboard: dashboardRouter,
  messages: messagesRouter,
  moderation: moderationRouter,
  media: mediaRouter,
  voice: voiceRouter,
  recordings: recordingsRouter,
  analysis: analysisRouter,
  chatbot: chatbotRouter,
  config: configRouter,
  uiState: uiStateRouter,
});

export type AppRouter = typeof appRouter;

logger.info("tRPC appRouter constructed");
