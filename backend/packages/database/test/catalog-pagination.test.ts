import { drizzle } from "drizzle-orm/pg-proxy";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  listMediaKeyset,
  searchMedia,
} from "../src/catalog-repository.js";
const ids = [
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000001",
];
const time = "2026-11-06T10:00:00.000Z";
const rows = ids.map((id, i) => [id, "VIDEO", `Ocean ${i}`, `ocean-${i}`, 1000, [], time]);
function database(resultRows: unknown[][]) {
  const queries: { text: string; params: unknown[] }[] = [];
  const db = drizzle(async (text, params) => {
    queries.push({ text, params });
    return { rows: text.includes('from "media_artists"') ? [] : resultRows };
  });
  // Both drivers use the same PostgreSQL query builder; only execution is replaced.
  return { db: db as unknown as PostgresJsDatabase<Record<string, unknown>>, queries };
}
describe("catalog pagination", () => {
  it("uses the creation-time fallback consistently for READY items without publication time", async () => {
    const { db, queries } = database(rows);
    const page = await listMediaKeyset(db, { limit: 2 });
    expect(page.items.map((item) => item.id)).toEqual(ids.slice(0, 2));
    expect(page.hasMore).toBe(true);
    expect(decodeCursor(page.nextCursor ?? "")).toEqual({ publishedAt: time, id: ids[1] });
    expect(queries[0].text).toMatch(
      /order by coalesce\("media"\."published_at", "media"\."created_at"\) desc/,
    );
    expect(queries[0].params).toContain(3);
  });
  it("returns a search cursor and includes query, type and keyset boundaries in its SQL", async () => {
    const { db, queries } = database(rows);
    const cursor = encodeCursor({ publishedAt: time, id: ids[0] });
    const page = await searchMedia(db, { q: "Ocean", type: "VIDEO", limit: 2, cursor });
    expect(page.items.map((item) => item.id)).toEqual(ids.slice(0, 2));
    expect(page.hasMore).toBe(true);
    expect(decodeCursor(page.nextCursor ?? "")).toEqual({ publishedAt: time, id: ids[1] });
    const query = queries[1];
    expect(query.params).toContain("%Ocean%");
    expect(query.params).toContain("VIDEO");
    expect(query.params).toContain(ids[0]);
    expect(query.text).toMatch(/coalesce\("media"\."published_at", "media"\."created_at"\) </);
    expect(query.params.at(-1)).toBe(3);
  });
  it("stops after the final search page", async () => {
    const { db } = database(rows.slice(0, 1));
    const page = await searchMedia(db, { q: "Ocean", limit: 2 });
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("filters catalog pages by an exact classification label", async () => {
    const { db, queries } = database(rows);
    await listMediaKeyset(db, { limit: 2, classification: "video-hd" });
    expect(queries[0].text).toMatch(/classification_labels.*@>/);
    expect(queries[0].params).toContain("video-hd");
  });

  it("filters search pages by an exact classification label", async () => {
    const { db, queries } = database(rows);
    await searchMedia(db, { q: "Ocean", limit: 2, classification: "genre-rock" });
    expect(queries[1].text).toMatch(/classification_labels.*@>/);
    expect(queries[1].params).toContain("genre-rock");
  });
});

describe("cursor timestamp fidelity", () => {
  it("binds cursor timestamps as driver-safe strings rather than raw Date objects", async () => {
    const { db, queries } = database(rows.slice(0, 1));
    await listMediaKeyset(db, {
      limit: 2,
      cursor: encodeCursor({ publishedAt: time, id: ids[0] }),
    });
    expect(queries[0].params.filter((value) => value instanceof Date)).toEqual([]);
    expect(queries[0].params).toContain(time);
  });
  it("round-trips PostgreSQL microseconds without skipping tied timestamp rows", async () => {
    const exact = "2026-11-06 10:00:00.123456+00";
    const { db, queries } = database(
      ids.map((id) => [id, "VIDEO", "Ocean", "ocean", 1000, [], exact]),
    );
    const first = await listMediaKeyset(db, { limit: 2 });
    expect(decodeCursor(first.nextCursor ?? "")?.publishedAt).toBe(exact);
    await listMediaKeyset(db, { limit: 2, cursor: first.nextCursor ?? undefined });
    expect(queries[1].params).toContain(exact);
  });
});
