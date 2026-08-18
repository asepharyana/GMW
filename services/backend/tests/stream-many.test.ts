import { describe, it, expect } from "vitest";

/**
 * Lock the contract that the WS `stream_messages` handler + frontend
 * `useMessagesStream` depend on.
 *
 * Real behavior (src/modules/messages/messages.repository.ts → streamMany, and
 * src/ws/server.ts stream_messages handler):
 *  - ONE `stream_messages` request streams the WHOLE history for the scope,
 *    internally paging `limit+1` at a time (cursor = oldest created_at of the
 *    page) until exhausted or maxFrames is hit.
 *  - Messages are emitted ONE AT A TIME, DESC (newest first).
 *  - The final `message_snapshot_end` carries `nextCursor` = the OLDEST emitted
 *    row's `created_at`, so the FE's next "load older" request pages forward.
 *
 * We replicate streamMany's pagination algorithm over an in-memory array so the
 * test needs no DB.
 */

type Row = { id: string; created_at: number; guild_id: string };

function makeStream(
  rows: Row[],
  query: { guildId?: string; channelId?: string; cursor?: string },
  pageSize = 50,
): () => Generator<Row, void, unknown> {
  return function* () {
    let cursor = query.cursor;
    while (true) {
      const page = rows
        .filter((r) => (query.guildId ? r.guild_id === query.guildId : true))
        .filter((r) => (cursor ? r.created_at < Number(cursor) : true))
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, pageSize + 1);

      if (page.length === 0) return;
      const hasMore = page.length > pageSize;
      const pageRows = hasMore ? page.slice(0, pageSize) : page;
      for (const r of pageRows) yield r;
      if (!hasMore) return;
      cursor = String(page[pageSize - 1].created_at);
    }
  };
}

function streamAll(
  rows: Row[],
  query: { guildId?: string; channelId?: string; cursor?: string },
  pageSize = 50,
  maxFrames = Infinity,
): { data: Row[]; nextCursor: string | null } {
  const data: Row[] = [];
  let nextCursor: string | null = null;
  for (const r of makeStream(rows, query, pageSize)()) {
    nextCursor = String(r.created_at);
    data.push(r);
    if (data.length >= maxFrames) break;
  }
  return { data, nextCursor };
}

const mk = (id: string, created_at: number, guild_id = "g1"): Row => ({
  id,
  created_at,
  guild_id,
});

describe("messages.streamMany contract", () => {
  it("emits newest-first and sets nextCursor to oldest created_at", () => {
    const rows = [mk("a", 300), mk("b", 200), mk("c", 100)];
    const { data, nextCursor } = streamAll(rows, { guildId: "g1" });
    expect(data.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(nextCursor).toBe("100"); // oldest emitted
  });

  it("streams the entire history in one request, one frame at a time", () => {
    // 120 rows; one request must yield all 120 (no 50-row batch boundary).
    const rows = Array.from({ length: 120 }, (_, i) => mk(`m${i}`, 1000 - i));
    const { data, nextCursor } = streamAll(rows, { guildId: "g1" }, 50);
    expect(data).toHaveLength(120);
    expect(data[0].id).toBe("m0"); // newest first
    expect(nextCursor).toBe("881"); // oldest = m119 (1000-119)
  });

  it("honors a frame cap and leaves nextCursor mid-history", () => {
    const rows = Array.from({ length: 120 }, (_, i) => mk(`m${i}`, 1000 - i));
    const { data, nextCursor } = streamAll(rows, { guildId: "g1" }, 50, 60);
    expect(data).toHaveLength(60);
    // nextCursor = 60th oldest = m59 (1000-59=941)
    expect(nextCursor).toBe("941");
  });

  it("paginates correctly across subsequent load-older requests", () => {
    const rows = Array.from({ length: 120 }, (_, i) => mk(`m${i}`, 1000 - i));
    const first = streamAll(rows, { guildId: "g1" }, 50, 50);
    expect(first.data).toHaveLength(50);
    expect(first.nextCursor).toBe("951"); // 50th oldest = m49

    const older = streamAll(
      rows,
      { guildId: "g1", cursor: first.nextCursor ?? undefined },
      50,
      50,
    );
    expect(older.data[0].id).toBe("m50"); // continues right after m49
    expect(older.nextCursor).toBe("901"); // 100th oldest
  });

  it("filters by guild", () => {
    const rows = [mk("x", 500, "g1"), mk("y", 400, "g2")];
    const { data } = streamAll(rows, { guildId: "g2" });
    expect(data.map((r) => r.id)).toEqual(["y"]);
  });
});
