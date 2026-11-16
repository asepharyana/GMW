/**
 * Walk `metadata.channel.channelName`, parsing `metadata` first when it is the
 * raw JSON string. Returns the string exactly as stored (including ""), or
 * undefined when the value is null, unparseable, or lacks the path — the JS
 * equivalent of the SQL expression evaluating to NULL.
 */
function extractChannelName(metadata: unknown): string | undefined {
	if (typeof metadata === "string") {
		if (metadata === "") return undefined
		let parsed: unknown
		try {
			parsed = JSON.parse(metadata)
		} catch {
			// A malformed cell used to make the `::jsonb` cast abort the whole
			// query. One unreadable row must not take out the entire page.
			return undefined
		}
		return extractChannelName(parsed)
	}

	if (metadata == null || typeof metadata !== "object") return undefined
	const channel = (metadata as Record<string, unknown>).channel
	if (channel == null || typeof channel !== "object") return undefined
	const name = (channel as Record<string, unknown>).channelName
	return typeof name === "string" ? name : undefined
}

/**
 * Read `messages.metadata -> 'channel' ->> 'channelName'`.
 *
 * Prisma's query builder has no `->>` path expression, so the JSON traversal
 * these SQL fragments used to perform is done in JS.
 *
 * `messages.metadata` is a `text` column holding a JSON document — it is not a
 * jsonb column — so Prisma hands it back as the raw string and the parse has to
 * happen here. An object is accepted too, since `verdicts.evidence` IS jsonb and
 * callers reuse this for it. Returns `undefined` rather than throwing when the
 * value is null, unparseable, or lacks the key, matching the SQL, which yielded
 * NULL in every one of those cases.
 *
 * Shared because several repositories resolve channel names the same way: a
 * caller that wanted the id it fell back to had to re-implement the same
 * COALESCE(NULLIF(...), channel_id) shape.
 */
export function readChannelName(metadata: unknown): string | undefined {
	const name = extractChannelName(metadata)
	return name === "" ? undefined : name
}

/**
 * The raw `channelName` value the way SQL sees it, WITHOUT the empty-string /
 * missing collapse. The old queries GROUP BY `->> 'channelName'`, so a real
 * name, an empty string, and a missing key are three distinct keys for the
 * same channel_id. `readChannelName` collapses all three to the channel_id
 * fallback, which is right for display but loses the distinction that made
 * the SQL group them separately. Returns the string if present (even ""), or
 * undefined if the path is absent / unparseable -- the JS equivalent of the
 * expression evaluating to SQL NULL.
 */
export function rawChannelName(metadata: unknown): string | undefined {
	return extractChannelName(metadata)
}
