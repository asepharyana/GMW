import type { AppRouterClient } from "#/api-types"
import { getBrowserClient } from "#/libs/orpc/client"
import type { IAppConfig } from "#/libs/types"

/**
 * Browser-side data access over `/trpc` (HTTP).
 *
 * The client type is `AppRouterClient`, derived from the backend's own router
 * via oRPC's `RouterClient`. It REPLACES a 170-line hand-written mirror of the
 * router shape (`lib/types/rpc.ts`) that had to be kept in step by hand and was
 * cast through `as unknown as` to boot — so a procedure added on the backend
 * used to be invisible here until someone remembered to edit that file.
 *
 * The page component seeds the TanStack Query cache and this client keeps it
 * fresh; it does not re-request what it already has.
 */
function client(): AppRouterClient {
	return getBrowserClient() as unknown as AppRouterClient
}

export const browserApi = {
	dashboard: {
		stats: () => client().dashboard.stats({}),
		activity: (days: number) => client().dashboard.activity({ days }),
		leaderboards: (limit: number) => client().dashboard.leaderboards({ limit }),
		reactions: (limit: number) => client().dashboard.reactions({ limit }),
		reactors: (limit: number) => client().dashboard.reactors({ limit }),
		insights: (limit: number) => client().dashboard.insights({ limit }),
	},
	messages: {
		guilds: () => client().messages.guilds({}),
		textChannels: (guildId: string) =>
			client().messages.textChannels({ guildId }),
		list: (query: Parameters<AppRouterClient["messages"]["list"]>[0]) =>
			client().messages.list(query),
		byChannel: (
			channelId: string,
			query: Parameters<AppRouterClient["messages"]["byChannel"]>[0]["query"],
		) => client().messages.byChannel({ channelId, query }),
		detail: (id: string) => client().messages.detail({ id }),
		review: (input: { limit?: number; channelId?: string; cursor?: string }) =>
			client().messages.review(input),
		editHistory: (input: {
			limit?: number
			channelId?: string
			cursor?: string
		}) => client().messages.editHistory(input),
		images: (guildId: string, limit: number) =>
			client().messages.images({ guildId, limit }),
	},
	moderation: {
		stats: () => client().moderation.stats({}),
		actions: (input: {
			limit?: number
			status?: string
			actionType?: string
		}) => client().moderation.actions(input),
		trends: (days: number) => client().moderation.trends({ days }),
		topDomains: (days: number) => client().moderation.topDomains({ days }),
		topChannels: (days: number) => client().moderation.topChannels({ days }),
		byHour: (days: number) => client().moderation.byHour({ days }),
		byCategory: (days: number, category: string) =>
			client().moderation.byCategory({ days, category }),
		coverage: (days: number) => client().moderation.coverage({ days }),
	},
	chatbot: {
		chat: (input: {
			message: string
			context?: {
				messageCount?: number
				activeParticipants?: number
				lastActivity?: string
				topicsDiscussed?: string[]
				guildId?: string
				channelId?: string
			}
			userId?: string
		}) => client().chatbot.chat(input),
		history: (input: { limit?: number; userId?: string }) =>
			client().chatbot.history(input),
		clearHistory: (input: { userId?: string }) =>
			client().chatbot.clearHistory(input),
	},
	config: {
		get: () => client().config.get({}),
		/**
		 * The monitored guild, or null when none is configured OR the lookup
		 * fails.
		 *
		 * The null-on-error half is load-bearing, not laziness: the deleted
		 * `getDefaultGuildId` in `#/libs/api/server` wrapped `config.get` in a
		 * try/catch for exactly this reason, so a config outage degrades to "no
		 * guild scoping" instead of failing the whole page. Callers rely on null
		 * being a supported, non-fatal state.
		 */
		async defaultGuildId(): Promise<string | null> {
			try {
				const config = (await client().config.get({})) as IAppConfig
				return config.monitorGuildId ?? null
			} catch {
				return null
			}
		},
	},
	uiState: {
		get: () => client().uiState.get({}),
		update: (state: Record<string, unknown>) => client().uiState.update(state),
	},
}
