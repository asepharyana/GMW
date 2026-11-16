import { once } from "node:events"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { expect, it, vi } from "vitest"
import { WebSocket } from "ws"
import { mapMessageRow } from "../src/domain/utils/messageMapper.js"
import { decodeCursor } from "../src/domain/utils/pagination.js"
import type { UseCases } from "../src/presentation/composition.js"
import {
	closeWebSocketServer,
	createWebSocketServer,
} from "../src/presentation/ws/server.js"

// Test the real WS handler; actual database paging is covered separately by
// messagesRepositoryPaging.test.ts, including same-millisecond page boundaries.
it("streams one frame per message and resumes with the last emitted composite cursor", async () => {
	const rows = ["c", "b", "a"].map((id) =>
		mapMessageRow({ id, created_at: 100, content: "private text" }),
	)
	const streamMessages = vi
		.fn()
		.mockImplementationOnce(async function* () {
			yield* rows
		})
		.mockImplementationOnce(async function* () {
			yield rows[2]
		})
		.mockImplementationOnce(async function* () {
			for (let i = 0; i < 501; i++) yield rows[0]
		})
	const useCases = {
		messages: { streamMessages },
		uiState: { getState: async () => ({}) },
	} as unknown as UseCases
	const server = http.createServer()
	createWebSocketServer(server, useCases)
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const { port } = server.address() as AddressInfo
	const client = new WebSocket(`ws://127.0.0.1:${port}/ws`)
	try {
		await once(client, "open")
		const request = (payload: unknown) =>
			new Promise<{
				ids: string[]
				cursor: string
				sent: number
				error?: boolean
			}>((resolve) => {
				const ids: string[] = []
				const onMessage = (raw: Buffer) => {
					const frame = JSON.parse(raw.toString())
					if (frame.type === "message_snapshot") ids.push(frame.data.id)
					if (frame.type === "message_snapshot_end") {
						client.off("message", onMessage)
						resolve({
							ids,
							cursor: frame.data.nextCursor,
							sent: frame.data.sent,
							error: frame.data.error,
						})
					}
				}
				client.on("message", onMessage)
				client.send(JSON.stringify({ type: "stream_messages", payload }))
			})
		for (const payload of [
			{ guildId: "g1", limit: "nonsense" },
			{ guildId: "g1", limit: 0 },
			{ guildId: "g1", limit: -1 },
			{ guildId: "g1", limit: 1.5 },
			{ guildId: 123 },
			{ guildId: "" },
			{},
			null,
			[],
		]) {
			const invalid = await request(payload)
			expect(invalid).toMatchObject({ ids: [], sent: 0, error: true })
		}
		expect(streamMessages).not.toHaveBeenCalled()

		const first = await request({ guildId: "g1", limit: 2 })
		expect(first.ids).toEqual(["c", "b"])
		expect(first.sent).toBe(2)
		expect(decodeCursor(first.cursor)).toEqual({ created_at: 100, id: "b" })
		// Cursor payloads contain only the resume key, never message text/metadata.
		expect(JSON.parse(Buffer.from(first.cursor, "base64").toString())).toEqual({
			created_at: 100,
			id: "b",
		})
		const second = await request({ guildId: "g1", cursor: first.cursor })
		expect(second.ids).toEqual(["a"])
		expect(streamMessages.mock.calls[1][0]).toMatchObject({
			guildId: "g1",
			cursor: first.cursor,
		})
		const capped = await request({ guildId: "g1", limit: 1000 })
		expect(capped.ids).toHaveLength(500)
		expect(capped.sent).toBe(500)
	} finally {
		client.terminate()
		closeWebSocketServer()
		await new Promise<void>((resolve, reject) =>
			server.close((err) => (err ? reject(err) : resolve())),
		)
	}
})
