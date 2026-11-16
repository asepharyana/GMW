import type { Logger } from "../../logger/index.js"

/**
 * Run a repository operation; if it throws, log `message` with `context` and
 * the error text, then rethrow the ORIGINAL error. Callers still see the same
 * exception — this only removes the identical try/catch/log/rethrow wrapper
 * every query method used to carry.
 */
export async function withErrorLog<T>(
	logger: Logger,
	context: Record<string, unknown>,
	message: string,
	operation: () => Promise<T>,
): Promise<T> {
	try {
		return await operation()
	} catch (error) {
		logger.error(
			{
				...context,
				error: error instanceof Error ? error.message : String(error),
			},
			message,
		)
		throw error
	}
}
