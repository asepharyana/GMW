import { LRUCache } from "lru-cache"
import type { Pool } from "pg"
import { createChildLogger } from "../../logger/index.js"

const log = createChildLogger("media-vision-cache")

export interface VisionCacheEntry {
	readonly fingerprint: string
	readonly description: string
}

export class MediaVisionCacheService {
	private readonly lru: LRUCache<string, string>
	private readonly inFlight = new Map<string, Promise<string>>()
	private readonly pool?: Pool

	constructor(pool?: Pool, maxItems = 2000) {
		this.pool = pool
		this.lru = new LRUCache<string, string>({ max: maxItems })
	}

	get(fingerprint: string): string | undefined {
		return this.lru.get(fingerprint)
	}

	async getMany(fingerprints: readonly string[]): Promise<Map<string, string>> {
		const results = new Map<string, string>()
		if (fingerprints.length === 0) return results

		const missing: string[] = []
		for (const fp of fingerprints) {
			const cached = this.lru.get(fp)
			if (cached) {
				results.set(fp, cached)
			} else {
				missing.push(fp)
			}
		}

		if (missing.length === 0 || !this.pool) {
			return results
		}

		try {
			const res = await this.pool.query<{
				fingerprint: string
				description: string
			}>(
				`SELECT fingerprint, description
				   FROM media_vision_cache
				  WHERE fingerprint = ANY($1::text[])`,
				[missing],
			)

			const hitFingerprints: string[] = []
			for (const row of res.rows) {
				this.lru.set(row.fingerprint, row.description)
				results.set(row.fingerprint, row.description)
				hitFingerprints.push(row.fingerprint)
			}

			if (hitFingerprints.length > 0) {
				this.pool
					.query(
						`UPDATE media_vision_cache
						    SET hit_count = hit_count + 1
						  WHERE fingerprint = ANY($1::text[])`,
						[hitFingerprints],
					)
					.catch((err: unknown) => {
						log.warn(
							{ err },
							"Failed to increment hit_count in media_vision_cache",
						)
					})
			}
		} catch (err) {
			log.warn({ err }, "Failed to read media_vision_cache from database")
		}

		return results
	}

	async setMany(entries: ReadonlyArray<VisionCacheEntry>): Promise<void> {
		if (entries.length === 0) return

		for (const { fingerprint, description } of entries) {
			this.lru.set(fingerprint, description)
		}

		if (!this.pool) return

		try {
			const now = Date.now()
			const rowsSql: string[] = []
			const values: unknown[] = []
			let idx = 1

			for (const { fingerprint, description } of entries) {
				rowsSql.push(`($${idx++}, $${idx++}, $${idx++}, 1)`)
				values.push(fingerprint, description, now)
			}

			await this.pool.query(
				`INSERT INTO media_vision_cache
				   (fingerprint, description, resolved_at, hit_count)
				 VALUES ${rowsSql.join(", ")}
				 ON CONFLICT (fingerprint) DO UPDATE SET
				   description = EXCLUDED.description,
				   resolved_at = EXCLUDED.resolved_at,
				   hit_count = media_vision_cache.hit_count + 1`,
				values,
			)
		} catch (err) {
			log.warn({ err }, "Failed to persist entries to media_vision_cache")
		}
	}

	async coalesce(key: string, task: () => Promise<string>): Promise<string> {
		const existing = this.inFlight.get(key)
		if (existing) return existing

		const promise = (async () => {
			try {
				return await task()
			} finally {
				this.inFlight.delete(key)
			}
		})()

		this.inFlight.set(key, promise)
		return promise
	}

	clear(): void {
		this.lru.clear()
		this.inFlight.clear()
	}

	get size(): number {
		return this.lru.size
	}
}
