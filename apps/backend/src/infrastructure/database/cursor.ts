import { type SQL, sql } from "drizzle-orm"
import { decodeCursor } from "../../domain/utils/pagination.js"

/**
 * Build a Drizzle cursor condition expression.
 *
 * Used in WHERE clauses:
 * `(created_at < cursor.created_at OR (created_at = cursor.created_at AND id < cursor.id))`
 *
 * Returns the SQL expression or undefined when cursor is absent.
 *
 * WHY this lives in `infrastructure/` and not beside `encodeCursor` /
 * `decodeCursor` in `domain/utils/pagination.ts`: importing `drizzle-orm`
 * there made `domain/` depend on the ORM, which is the one dependency the
 * hexagonal rule forbids outright. The encode/decode half is pure string work
 * and stays in the domain; only the SQL builder is an adapter detail.
 */
export function buildCursorCondition(
	created_at_col: SQL | unknown,
	id_col: SQL | unknown,
	cursor?: string,
): SQL | undefined {
	const data = decodeCursor(cursor)
	if (!data) {
		// Older clients still hold timestamp-only tokens. Keep accepting those
		// while all newly issued tokens include the id tiebreaker.
		if (cursor?.trim() && Number.isFinite(Number(cursor))) {
			return sql`${created_at_col} < ${Number(cursor)}`
		}
		return undefined
	}
	return sql`(${created_at_col} < ${data.created_at} or (${created_at_col} = ${data.created_at} and ${id_col} < ${data.id}))`
}
