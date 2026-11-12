import { extractMessageMediaEvidence } from "../message-capture/messageMetadata.js"

export interface MediaItem {
	readonly url: string
	readonly fingerprint: string
}

export interface AttachmentMediaInput {
	readonly discord_url: string | null
	readonly type?: string | null
	readonly filename?: string | null
	readonly size?: number | null
}

export function isVisionCapable(
	contentType: string | null | undefined,
	url?: string | null,
): boolean {
	const type = (contentType ?? "").toLowerCase().split(";")[0].trim()
	if (type.startsWith("image/")) {
		return !type.includes("svg") && !type.includes("avif")
	}
	if (type) return false
	const ext = (url ?? "")
		.split("?")[0]
		.split("#")[0]
		.split(".")
		.pop()
		?.toLowerCase()
	return ext
		? ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)
		: false
}

export function normalizeFilename(raw: string): string {
	const basename = raw.split("/").pop()?.split("\\").pop() ?? ""
	return basename.trim().toLowerCase()
}

export function cleanMediaUrl(rawUrl: string): string {
	return rawUrl.split("?")[0].split("#")[0].trim().toLowerCase()
}

export function computeAttachmentFingerprint(
	filename: string | null | undefined,
	size: number | null | undefined,
	url: string | null | undefined,
): string | null {
	if (filename && typeof size === "number" && size > 0) {
		const cleanName = normalizeFilename(filename)
		if (cleanName.length > 0) {
			return `meta:${cleanName}:${size}`
		}
	}
	if (!url) return null
	const cleanUrl = cleanMediaUrl(url)
	return cleanUrl.length > 0 ? `url:${cleanUrl}` : null
}

export function computeStickerFingerprint(url: string): string {
	const stickerMatch = /cdn\.discordapp\.com\/stickers\/(\d+)/.exec(url)
	if (stickerMatch?.[1]) {
		return `sticker:${stickerMatch[1]}`
	}
	return `url:${cleanMediaUrl(url)}`
}

export function computeEmojiFingerprint(url: string): string {
	const emojiMatch = /cdn\.discordapp\.com\/emojis\/(\d+)/.exec(url)
	if (emojiMatch?.[1]) {
		return `emoji:${emojiMatch[1]}`
	}
	return `url:${cleanMediaUrl(url)}`
}

export function extractMediaItems(
	attachments: ReadonlyArray<AttachmentMediaInput>,
	metadata?: string | null,
): MediaItem[] {
	const items: MediaItem[] = []
	const seenFingerprints = new Set<string>()

	for (const a of attachments) {
		if (!a.discord_url || !isVisionCapable(a.type, a.discord_url)) continue
		const fp = computeAttachmentFingerprint(a.filename, a.size, a.discord_url)
		if (!fp || seenFingerprints.has(fp)) continue
		seenFingerprints.add(fp)
		items.push({ url: a.discord_url, fingerprint: fp })
	}

	if (metadata) {
		const { stickers, customEmojis } = extractMessageMediaEvidence(metadata)
		for (const s of stickers) {
			if (!s.url) continue
			const fp = computeStickerFingerprint(s.url)
			if (seenFingerprints.has(fp)) continue
			seenFingerprints.add(fp)
			items.push({ url: s.url, fingerprint: fp })
		}
		for (const e of customEmojis) {
			if (!e.url) continue
			const fp = computeEmojiFingerprint(e.url)
			if (seenFingerprints.has(fp)) continue
			seenFingerprints.add(fp)
			items.push({ url: e.url, fingerprint: fp })
		}
	}

	return items
}

export function mediaSignature(items: readonly MediaItem[]): string {
	if (items.length === 0) return ""
	return items
		.map((i) => i.fingerprint)
		.sort()
		.join("|")
}

export function batchDedupeKey(
	msg: { authorId: string; content: string },
	items?: readonly MediaItem[],
): string | null {
	const sig = items ? mediaSignature(items) : ""
	const text = msg.content.trim().toLowerCase()
	if (!sig && !text) return null
	return `${msg.authorId}::${text}::${sig}`
}
