import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDatabase } from "@/shared/database/index.js";
import {
  type MateriDocument,
  materiDocumentsTable,
} from "@/shared/database/schema.js";
import type { MateriQueryInput } from "./materi.schema.js";

export class MateriRepository {
  /** List materi documents with optional filtering and search. */
  async list(input: MateriQueryInput): Promise<MateriDocument[]> {
    const db = getDatabase();

    const conditions = [];

    // Text search across title and content
    if (input.search) {
      const term = `%${input.search}%`;
      conditions.push(
        or(
          ilike(materiDocumentsTable.title, term),
          ilike(materiDocumentsTable.content, term),
        ),
      );
    }

    // Category filter
    if (input.category) {
      conditions.push(eq(materiDocumentsTable.category, input.category));
    }

    // Owner filter
    if (input.ownerId) {
      conditions.push(eq(materiDocumentsTable.owner_user_id, input.ownerId));
    }

    // Only public (if requested)
    if (input.onlyPublic) {
      conditions.push(eq(materiDocumentsTable.is_public, true));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await db
      .select()
      .from(materiDocumentsTable)
      .where(whereClause)
      .orderBy(desc(materiDocumentsTable.created_at))
      .limit(input.limit);

    return result;
  }

  /** Get a single materi by id. */
  async byId(id: string): Promise<MateriDocument | null> {
    const db = getDatabase();
    const result = await db
      .select()
      .from(materiDocumentsTable)
      .where(eq(materiDocumentsTable.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /** Create a new materi document. */
  async create(data: {
    title: string;
    description?: string | null;
    content: string;
    category: string;
    tags: string[];
    ownerUserId: string;
    guildId?: string | null;
    channelId?: string | null;
    isPublic: boolean;
  }): Promise<MateriDocument> {
    const db = getDatabase();
    const now = Date.now();
    const result = await db
      .insert(materiDocumentsTable)
      .values({
        title: data.title,
        description: data.description ?? null,
        content: data.content,
        category: data.category,
        tags: data.tags,
        owner_user_id: data.ownerUserId,
        guild_id: data.guildId ?? null,
        channel_id: data.channelId ?? null,
        is_public: data.isPublic,
        view_count: 0,
        created_at: now,
        updated_at: now,
      })
      .returning();
    return result[0]!;
  }

  /** Update an existing materi. */
  async update(
    id: string,
    data: Partial<{
      title: string;
      description?: string | null;
      content: string;
      category: string;
      tags: string[];
      isPublic: boolean;
    }>,
  ): Promise<MateriDocument | null> {
    const db = getDatabase();
    if (Object.keys(data).length === 0) return this.byId(id);

    const result = await db
      .update(materiDocumentsTable)
      .set({
        ...data,
        updated_at: Date.now(),
      })
      .where(eq(materiDocumentsTable.id, id))
      .returning();
    return result[0] ?? null;
  }

  /** Delete a materi. */
  async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db
      .delete(materiDocumentsTable)
      .where(eq(materiDocumentsTable.id, id))
      .returning({ deletedId: materiDocumentsTable.id });
    return result.length > 0;
  }

  /** Increment view count (for analytics). */
  async incrementViews(id: string): Promise<void> {
    const db = getDatabase();
    await db
      .update(materiDocumentsTable)
      .set({
        view_count: sql`${materiDocumentsTable.view_count} + 1`,
      })
      .where(eq(materiDocumentsTable.id, id));
  }
}

export const materiRepository = new MateriRepository();
