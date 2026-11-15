import { os } from "@orpc/server"
import { z } from "zod"
import { chatRequestSchema } from "../../application/chatbot/chatbot.schema.js"
import { messageQuerySchema } from "../../application/messages/messages.schema.js"
import { config } from "../../infrastructure/config/index.js"
import type { UseCases } from "../composition.js"
import { mutationProcedure } from "./mutation-guard.js"

/**
 * Compose the oRPC surface from a wired use-case graph.
 *
 * Every handler reads its collaborator off `useCases`, so this module imports
 * no service singleton and can be handed fakes in a test. It is built once per
 * transport — `http/app.ts` and `orpc/ws.ts` — from the SAME `useCases`
 * instance, so the two transports share one graph.
 */
export function buildRouter(useCases: UseCases) {
	const {
		chatbot: chatbotService,
		dashboard: dashboardService,
		messages: messagesService,
		moderation: moderationService,
		uiState: uiStateService,
	} = useCases

	// ── Dashboard ────────────────────────────────────────────────────
	const dashboardRouter = {
		stats: os.handler(() => dashboardService.getStats()),
		activity: os
			.input(
				z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }),
			)
			.handler(({ input }) => dashboardService.getActivity(input.days)),
		leaderboards: os
			.input(z.object({ limit: z.coerce.number().int().positive().default(8) }))
			.handler(({ input }) => dashboardService.getLeaderboards(input.limit)),
		reactions: os
			.input(
				z.object({ limit: z.coerce.number().int().positive().default(20) }),
			)
			.handler(({ input }) => dashboardService.getTopReactions(input.limit)),
		reactors: os
			.input(
				z.object({ limit: z.coerce.number().int().positive().default(20) }),
			)
			.handler(({ input }) => dashboardService.getTopReactors(input.limit)),
		// Everything the panels above cannot express: what the model acts on,
		// how sure it is, whether enforcement followed through, plus edits,
		// media and pipeline freshness.
		insights: os
			.input(z.object({ limit: z.coerce.number().int().positive().default(8) }))
			.handler(({ input }) => dashboardService.getInsights(input.limit)),
	}

	// ── Messages ─────────────────────────────────────────────────────
	const messagesRouter = {
		guilds: os.handler(() => messagesService.getGuilds()),
		textChannels: os
			.input(z.object({ guildId: z.string() }))
			.handler(({ input }) => messagesService.getTextChannels(input.guildId)),
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
					// Opaque resume token. Absent = first page; the client treats a null
					// `cursor` in the response as "no more pages" and stops asking.
					cursor: z.string().optional(),
				}),
			)
			.handler(async ({ input }) => {
				const { results, nextCursor } = await messagesService.getReviewMessages(
					input.channelId,
					input.limit,
					input.cursor,
				)
				return { results, limit: input.limit, cursor: nextCursor }
			}),
		// Public, read-only recent message edits (evasion tracker). Cursor-paged like
		// `review`: the response is now `{ results, nextCursor }` rather than a bare
		// array, so the Edits tab can scroll the same way the other two tabs do.
		editHistory: os
			.input(
				z.object({
					limit: z.coerce.number().int().positive().default(50),
					channelId: z.string().optional(),
					cursor: z.string().optional(),
				}),
			)
			.handler(async ({ input }) => {
				const { results, nextCursor } = await messagesService.getRecentEdits(
					input.limit,
					input.channelId,
					input.cursor,
				)
				return { results, nextCursor }
			}),
	}

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
			.handler(({ input }) =>
				moderationService.getTopFlaggedDomains(input.days),
			),
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
			.handler(({ input }) =>
				moderationService.getHourlyModeration(input.days),
			),
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
	}

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
				const userId = input.userId ?? "anonymous"
				const response = await chatbotService.processMessage(
					input.message,
					input.context,
					userId,
				)
				await chatbotService.saveConversation({
					userId,
					userMessage: input.message,
					botResponse: response,
					context: input.context,
					timestamp: new Date(),
				})
				return { response, timestamp: new Date().toISOString() }
			}),
		history: os
			.input(
				z.object({
					limit: z.coerce.number().int().positive().max(100).default(50),
					userId: z.string().optional(),
				}),
			)
			.handler(async ({ input }) => {
				const userId = input.userId ?? "anonymous"
				const history = await chatbotService.getChatHistory(userId, input.limit)
				return { history, total: history.length }
			}),
		clearHistory: mutationProcedure
			.input(z.object({ userId: z.string().optional() }))
			.handler(async ({ input }) => {
				const userId = input.userId ?? "anonymous"
				await chatbotService.clearChatHistory(userId)
				return { ok: true }
			}),
	}

	const configRouter = {
		get: os.handler(() => ({
			// Derived from the EFFECTIVE list, not `MONITOR_GUILD_ID` directly.
			// The singular is deprecated: a multi-guild deployment sets
			// `MONITOR_GUILD_IDS` and leaves it unset, so reading it raw returned
			// null and every server-rendered page lost its guild scoping —
			// capture honoured all guilds while the UI silently fell back to
			// `guilds[0]`.
			monitorGuildId: config.EFFECTIVE_MONITOR_GUILD_IDS[0] ?? null,
			monitorGuildIds: config.EFFECTIVE_MONITOR_GUILD_IDS,
			webserverPort: config.WEBSERVER_PORT,
			nodeEnv: config.NODE_ENV,
			backlogSyncHours: config.BACKLOG_SYNC_HOURS,
			backlogSyncBatchSize: config.BACKLOG_SYNC_BATCH_SIZE,
			retentionMessagesDays: config.RETENTION_MESSAGES_DAYS,
			retentionAttachmentsDays: config.RETENTION_ATTACHMENTS_DAYS,
			logLevel: config.LOG_LEVEL,
		})),
	}

	// ── UI State ──────────────────────────────────────────────────────
	// `get` stays public — it is a read. `update` is one of exactly TWO procedures
	// that write to the database, and it was reachable by anyone who could reach
	// the port: `z.record(z.string(), z.unknown())` accepted arbitrary keys, so a
	// single unauthenticated POST wrote whatever the caller liked. It now requires
	// x-mutation-token. See orpc/mutation-guard.ts.
	const uiStateRouter = {
		get: os.handler(() => uiStateService.getState()),
		update: mutationProcedure
			.input(z.record(z.string(), z.unknown()))
			.handler(({ input }) => uiStateService.updateState(input)),
	}

	// ── Root router ───────────────────────────────────────────────────
	return {
		dashboard: dashboardRouter,
		messages: messagesRouter,
		moderation: moderationRouter,
		chatbot: chatbotRouter,
		config: configRouter,
		uiState: uiStateRouter,
	}
}

export type AppRouter = ReturnType<typeof buildRouter>
