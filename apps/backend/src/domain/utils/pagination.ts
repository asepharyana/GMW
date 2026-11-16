// Shared cursor-based pagination utilities

export interface CursorData {
	created_at: number
	id: string
}

/**
 * Encode a cursor to a base64 string.
 */
export function encodeCursor(data: CursorData): string {
	return Buffer.from(
		JSON.stringify({ created_at: data.created_at, id: data.id }),
	).toString("base64")
}

/**
 * Decode a cursor from a base64 string. Returns null on invalid input.
 */
export function decodeCursor(cursor?: string): CursorData | null {
	if (!cursor) return null
	try {
		const data = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"))
		if (
			data &&
			typeof data.created_at === "number" &&
			Number.isFinite(data.created_at) &&
			typeof data.id === "string"
		) {
			return data
		}
		return null
	} catch {
		return null
	}
}

/**
 * Build a `PageResult` from a slice of rows (limit + 1) using cursor-based pagination.
 */
export function pageResult<T extends { created_at: number; id: string }>(
	rows: unknown[],
	limit: number,
): { data: T[]; nextCursor: string | null } {
	const hasMore = rows.length > limit
	const data = rows.slice(0, limit) as T[]
	const lastItem = data[data.length - 1]
	const nextCursor =
		hasMore && lastItem
			? encodeCursor({ created_at: lastItem.created_at, id: lastItem.id })
			: null

	return { data, nextCursor }
}
