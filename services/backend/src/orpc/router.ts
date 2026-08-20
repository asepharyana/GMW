import { os } from "@orpc/server";
import { z } from "zod";
import { analysisService } from "../modules/analysis/analysis.service";
import { chatRequestSchema } from "../modules/chatbot/chatbot.schema";
import { chatbotService } from "../modules/chatbot/chatbot.service";
import { dashboardService } from "../modules/dashboard/dashboard.service";
import { knowledgeService } from "../modules/knowledge/knowledge.service";
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
import {
  messageQuerySchema,
  semanticSearchSchema,
} from "../modules/messages/messages.schema";
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

// ── Dashboard ────────────────────────────────────────────────────
const dashboardRouter = {
  stats: os.handler(() => dashboardService.getStats()),
  activity: os
    .input(
      z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }),
    )
    .handler(({ input }) => dashboardService.getActivity(input.days)),
  users: os
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(20),
        cursor: z.string().optional(),
        search: z.string().optional(),
      }),
    )
    .handler(({ input }) =>
      dashboardService.listUsers({
        limit: input.limit,
        cursor: input.cursor,
        search: input.search,
      }),
    ),
  userDetail: os
    .input(z.object({ userId: z.string() }))
    .handler(({ input }) => dashboardService.getUserDetail(input.userId)),
  channels: os
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(20),
        search: z.string().optional(),
        guildId: z.string().optional(),
      }),
    )
    .handler(({ input }) =>
      dashboardService.listChannels({
        limit: input.limit,
        search: input.search,
        guildId: input.guildId,
      }),
    ),
  channelDetail: os
    .input(z.object({ channelId: z.string() }))
    .handler(({ input }) => dashboardService.getChannelDetail(input.channelId)),
  reactions: os
    .input(z.object({ limit: z.coerce.number().int().positive().default(20) }))
    .handler(({ input }) => dashboardService.getTopReactions(input.limit)),
  reactors: os
    .input(z.object({ limit: z.coerce.number().int().positive().default(20) }))
    .handler(({ input }) => dashboardService.getTopReactors(input.limit)),
};

// ── Messages ─────────────────────────────────────────────────────
const messagesRouter = {
  list: os
    .input(messageQuerySchema)
    .handler(({ input }) => messagesService.listMessages(input)),
  byChannel: os
    .input(
      z.object({
        channelId: z.string(),
        query: messageQuerySchema,
      }),
    )
    .handler(({ input }) =>
      messagesService.getMessagesByChannel(input.channelId, input.query),
    ),
  detail: os
    .input(z.object({ id: z.string() }))
    .handler(({ input }) => messagesService.getMessageById(input.id)),
  images: os
    .input(
      z.object({
        guildId: z.string(),
        limit: z.coerce.number().int().positive().default(50),
      }),
    )
    .handler(({ input }) =>
      messagesService.getImageMessages(input.guildId, input.limit),
    ),
  attachmentsByChannel: os
    .input(
      z.object({
        channelId: z.string(),
        query: messageQuerySchema,
      }),
    )
    .handler(({ input }) =>
      messagesService.getAttachmentsByChannel(input.channelId, input.query),
    ),
  review: os
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(20),
        channelId: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const rows = await messagesService.getReviewMessages(
        input.channelId,
        input.limit,
      );
      return { results: rows, limit: input.limit, cursor: null };
    }),
  // Public, read-only semantic search over the message archive.
  semanticSearch: os
    .input(semanticSearchSchema)
    .handler(({ input }) => messagesService.semanticSearch(input)),
  // Public, read-only activity heatmap data (per-hour volume by channel).
  activity: os
    .input(
      z.object({
        days: z.coerce.number().int().positive().max(365).default(30),
      }),
    )
    .handler(({ input }) => messagesService.getActivity(input.days)),
  // Public, read-only recent message edits (evasion tracker).
  editHistory: os
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(50),
        channelId: z.string().optional(),
      }),
    )
    .handler(({ input }) =>
      messagesService.getRecentEdits(input.limit, input.channelId),
    ),
};

// ── Moderation ───────────────────────────────────────────────────
const moderationRouter = {
  stats: os.handler(() => moderationService.getStats()),
  actions: os
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(50),
        status: z.string().optional(),
        actionType: z.string().optional(),
        cursor: z.coerce.number().int().optional(),
      }),
    )
    .handler(({ input }) =>
      moderationService.listActions({
        limit: input.limit,
        status: input.status,
        actionType: input.actionType,
        cursor: input.cursor,
      }),
    ),
  trends: os
    .input(
      z.object({
        days: z.coerce.number().int().positive().max(365).default(30),
      }),
    )
    .handler(({ input }) => moderationService.getTrends(input.days)),
  // Flagged link / scam domain ranking (public Scam Domain panel).
  topDomains: os
    .input(
      z.object({
        days: z.coerce.number().int().positive().max(365).default(30),
      }),
    )
    .handler(({ input }) => moderationService.getTopFlaggedDomains(input.days)),
  // Top flagged channels (join moderation_actions → messages).
  topChannels: os
    .input(
      z.object({
        days: z.coerce.number().int().positive().max(365).default(30),
      }),
    )
    .handler(({ input }) =>
      moderationService.getTopFlaggedChannels(input.days),
    ),
  // Hour-of-day moderation distribution (heatmap by hour).
  byHour: os
    .input(
      z.object({
        days: z.coerce.number().int().positive().max(365).default(30),
      }),
    )
    .handler(({ input }) => moderationService.getHourlyModeration(input.days)),
  // Flag category drill-down (list actions for one category).
  byCategory: os
    .input(
      z.object({
        days: z.coerce.number().int().positive().max(365).default(30),
        category: z.string().min(1),
      }),
    )
    .handler(({ input }) =>
      moderationService.getByCategory(input.days, input.category),
    ),
  // Auto-moderation coverage (analysis run completion rate).
  coverage: os
    .input(
      z.object({
        days: z.coerce.number().int().positive().max(365).default(30),
      }),
    )
    .handler(({ input }) => moderationService.getCoverage(input.days)),
};

// ── Media ────────────────────────────────────────────────────────
const mediaRouter = {
  status: os.handler(() => getStatus()),
  queue: os.input(mediaQueueSchema).handler(async ({ input }) => {
    await queue(input.source, input.mode);
    return getStatus();
  }),
  skip: os.handler(async () => {
    await skip();
    return getStatus();
  }),
  stop: os.handler(async () => {
    await stop();
    return getStatus();
  }),
  loop: os.input(mediaLoopSchema).handler(async ({ input }) => {
    await setLoop(input.loop);
    return getStatus();
  }),
};

// ── Voice ─────────────────────────────────────────────────────────
const voiceRouter = {
  guilds: os.handler(() => getGuilds()),
  textChannels: os
    .input(z.object({ guildId: z.string() }))
    .handler(({ input }) => getTextChannels(input.guildId)),
  voiceChannels: os
    .input(z.object({ guildId: z.string() }))
    .handler(({ input }) => getVoiceChannels(input.guildId)),
  status: os.handler(() => getVoiceStatus()),
  connect: os
    .input(z.object({ guildId: z.string(), channelId: z.string() }))
    .handler(async ({ input }) => {
      await connectVoice(input.guildId, input.channelId);
      return getVoiceStatus();
    }),
  disconnect: os.handler(async () => {
    await disconnectVoice();
    return getVoiceStatus();
  }),
  command: os
    .input(z.object({ command: z.string().min(1) }))
    .handler(async ({ input }) => {
      await publishCommandNoReply(input.command);
      return { success: true, command: input.command };
    }),
};

// ── Recordings ───────────────────────────────────────────────────
const recordingsRouter = {
  list: os
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(50),
        channelId: z.string().optional(),
        userId: z.string().optional(),
        cursor: z.string().optional(),
      }),
    )
    .handler(({ input }) =>
      recordingsService.getRecent(input.limit, {
        channelId: input.channelId,
        userId: input.userId,
        cursor: input.cursor,
      }),
    ),
  delete: os.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    await recordingsService.deleteById(input.id);
    return { ok: true };
  }),
};

// ── Analysis (search) ──────────────────────────────────────────────
const analysisRouter = {
  search: os
    .input(
      z.object({
        q: z.string().default(""),
        channelId: z.string().optional(),
        limit: z.coerce.number().int().positive().default(20),
      }),
    )
    .handler(({ input }) =>
      analysisService.search({
        q: input.q,
        channelId: input.channelId,
        limit: input.limit,
      }),
    ),
};

// ── Chatbot ───────────────────────────────────────────────────────
const chatbotRouter = {
  chat: os
    .input(
      chatRequestSchema.extend({
        // Per-device actor id; the old REST layer used an X-User-Id header.
        // Anonymous sessions use a stable "anonymous" id.
        userId: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
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
  history: os
    .input(
      z.object({
        limit: z.coerce.number().int().positive().max(100).default(50),
        userId: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const userId = input.userId ?? "anonymous";
      const history = await chatbotService.getChatHistory(userId, input.limit);
      return { history, total: history.length };
    }),
  clearHistory: os
    .input(z.object({ userId: z.string().optional() }))
    .handler(async ({ input }) => {
      const userId = input.userId ?? "anonymous";
      await chatbotService.clearChatHistory(userId);
      return { ok: true };
    }),
};

// ── Knowledge (public read-only culture glossary + term KB) ───────
const knowledgeRouter = {
  channelCultures: os
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(50),
        search: z.string().optional(),
      }),
    )
    .handler(({ input }) =>
      knowledgeService.listChannelCultures(input.limit, input.search),
    ),
  glossary: os
    .input(
      z.object({
        limit: z.coerce.number().int().positive().default(50),
        search: z.string().optional(),
      }),
    )
    .handler(({ input }) =>
      knowledgeService.listGlossary(input.limit, input.search),
    ),
};
const configRouter = {
  get: os.handler(() => ({
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
};

// ── UI State ──────────────────────────────────────────────────────
const uiStateRouter = {
  get: os.handler(() => uiStateService.getState()),
  update: os
    .input(z.record(z.string(), z.unknown()))
    .handler(({ input }) => uiStateService.updateState(input)),
};

// ── Root router ───────────────────────────────────────────────────
export const appRouter = {
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
  knowledge: knowledgeRouter,
};

export type AppRouter = typeof appRouter;
