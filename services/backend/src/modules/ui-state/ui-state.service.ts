import { sql } from "drizzle-orm";
import { createChildLogger } from "@/shared/logger/index";
import { getDatabase } from "../../shared/database/index.js";

const logger = createChildLogger("ui-state.service");

export class UiStateService {
  async getState() {
    const db = getDatabase();
    logger.debug("Fetching UI state");

    const { rows } = await db.execute(
      sql`SELECT key, value, updated_at FROM ui_state ORDER BY key`,
    );

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key as string] = JSON.parse(row.value as string);
      } catch {
        result[row.key as string] = row.value;
      }
    }

    return result;
  }

  async updateState(updates: Record<string, unknown>) {
    const db = getDatabase();
    const now = Date.now();

    logger.debug({ keys: Object.keys(updates) }, "Updating UI state");

    for (const [key, value] of Object.entries(updates)) {
      const serialized =
        typeof value === "string" ? value : JSON.stringify(value);

      await db.execute(sql`
        INSERT INTO ui_state (key, value, updated_at)
        VALUES (${key}, ${serialized}, ${now})
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at
      `);
    }

    return await this.getState();
  }
}

export const uiStateService = new UiStateService();
