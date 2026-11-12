import { describe, expect, it } from "vitest"
import {
	batchDedupeKey,
	cleanMediaUrl,
	computeAttachmentFingerprint,
	computeEmojiFingerprint,
	computeStickerFingerprint,
	extractMediaItems,
	mediaSignature,
	normalizeFilename,
} from "../src/infrastructure/modules-gateway/ai-moderation/mediaFingerprint.js"

describe("mediaFingerprint", () => {
	it("normalizes filenames safely", () => {
		expect(normalizeFilename("PXL_20261015_044357_193.png")).toBe(
			"pxl_20261015_044357_193.png",
		)
		expect(normalizeFilename("/path/to/IMAGE.PNG")).toBe("image.png")
		expect(normalizeFilename("C:\\Users\\test\\PHOTO.JPG")).toBe("photo.jpg")
	})

	it("strips Discord signed query parameters from URLs", () => {
		const raw =
			"https://cdn.discordapp.com/attachments/111/222/pxl.png?ex=6789&is=1234&hm=abcd#anchor"
		expect(cleanMediaUrl(raw)).toBe(
			"https://cdn.discordapp.com/attachments/111/222/pxl.png",
		)
	})

	it("produces identical fingerprints for the same file across different Discord channels", () => {
		const channel1Url =
			"https://cdn.discordapp.com/attachments/11111/22222/photo.png?ex=6789&hm=aaa"
		const channel2Url =
			"https://cdn.discordapp.com/attachments/33333/44444/photo.png?ex=9999&hm=bbb"

		const fp1 = computeAttachmentFingerprint("photo.png", 102400, channel1Url)
		const fp2 = computeAttachmentFingerprint("photo.png", 102400, channel2Url)

		expect(fp1).toBe("meta:photo.png:102400")
		expect(fp2).toBe("meta:photo.png:102400")
		expect(fp1).toBe(fp2)
	})

	it("falls back to cleaned URL when filename or size is missing", () => {
		const url = "https://cdn.discordapp.com/attachments/1/2/pic.png?ex=1"
		expect(computeAttachmentFingerprint(null, null, url)).toBe(
			"url:https://cdn.discordapp.com/attachments/1/2/pic.png",
		)
	})

	it("extracts sticker and emoji IDs into dedicated fingerprints", () => {
		expect(
			computeStickerFingerprint(
				"https://cdn.discordapp.com/stickers/987654321.png?size=160",
			),
		).toBe("sticker:987654321")
		expect(
			computeEmojiFingerprint(
				"https://cdn.discordapp.com/emojis/123456789.png?v=1",
			),
		).toBe("emoji:123456789")
	})

	it("extracts media items and de-duplicates identical items in the same message", () => {
		const attachments = [
			{
				discord_url: "https://cdn.discordapp.com/attachments/1/2/a.png",
				filename: "a.png",
				size: 5000,
				type: "image/png",
			},
			// Duplicate attachment in same message
			{
				discord_url: "https://cdn.discordapp.com/attachments/1/3/a.png",
				filename: "a.png",
				size: 5000,
				type: "image/png",
			},
			// Non-vision attachment (e.g. zip file)
			{
				discord_url: "https://cdn.discordapp.com/attachments/1/4/data.zip",
				filename: "data.zip",
				size: 10000,
				type: "application/zip",
			},
		]

		const items = extractMediaItems(attachments, null)
		expect(items).toHaveLength(1)
		expect(items[0]).toEqual({
			url: "https://cdn.discordapp.com/attachments/1/2/a.png",
			fingerprint: "meta:a.png:5000",
		})
	})

	it("generates deterministic sorted media signatures", () => {
		const items = [
			{ url: "https://x/b.png", fingerprint: "meta:b.png:200" },
			{ url: "https://x/a.png", fingerprint: "meta:a.png:100" },
		]
		expect(mediaSignature(items)).toBe("meta:a.png:100|meta:b.png:200")
		expect(mediaSignature([])).toBe("")
	})

	it("identifies identical broadcast messages for in-batch deduplication", () => {
		const msg1 = { authorId: "u1", content: "Check this out!" }
		const msg2 = { authorId: "u1", content: "  Check this out!  " }
		const msg3 = { authorId: "u2", content: "Check this out!" }
		const items = [{ url: "https://x/p.png", fingerprint: "meta:p.png:500" }]

		const key1 = batchDedupeKey(msg1, items)
		const key2 = batchDedupeKey(msg2, items)
		const key3 = batchDedupeKey(msg3, items)

		expect(key1).toBe("u1::check this out!::meta:p.png:500")
		expect(key1).toBe(key2)
		expect(key1).not.toBe(key3)
	})
})
