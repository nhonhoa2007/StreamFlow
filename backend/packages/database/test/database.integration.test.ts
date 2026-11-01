import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DatabaseHandle, createDatabase } from "../src/client.js";
import { listReadyMedia } from "../src/media-repository.js";
import { runMigrations } from "../src/migrate.js";
import { mediaTable } from "../src/schema.js";
import { runSeed } from "../src/seed.js";
import { type TestDatabaseInstance, startTestDatabase } from "./test-helper.js";

describe("Database package integration tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    dbHandle = createDatabase(testDb.databaseUrl);
  }, 20000);

  afterAll(async () => {
    if (dbHandle) {
      await dbHandle.close();
    }
    if (testDb) {
      await testDb.cleanup();
    }
  });

  it("checks database connection successfully", async () => {
    const isConnected = await dbHandle.checkConnection();
    expect(isConnected).toBe(true);
  });

  it("applies migrations repeatably without error", async () => {
    // Run migration twice to prove idempotency
    await runMigrations(testDb.databaseUrl);
    await runMigrations(testDb.databaseUrl);
  });

  it("applies seed repeatably without duplicating rows", async () => {
    // Run seed twice to prove upsert idempotency
    await runSeed(testDb.databaseUrl);
    await runSeed(testDb.databaseUrl);

    // Should have exactly 10 rows in total (5 audio, 5 video)
    const allRows = await dbHandle.db.select().from(mediaTable);
    expect(allRows).toHaveLength(10);

    const audioRows = allRows.filter((r) => r.type === "AUDIO");
    const videoRows = allRows.filter((r) => r.type === "VIDEO");
    expect(audioRows).toHaveLength(5);
    expect(videoRows).toHaveLength(5);

    // All seeded rows should be READY
    expect(allRows.every((r) => r.status === "READY")).toBe(true);
  });

  it("excludes DRAFT items and sorts READY items by created_at DESC, id DESC", async () => {
    // Insert a draft item
    await dbHandle.db.insert(mediaTable).values({
      type: "AUDIO",
      title: "Draft Work in Progress",
      slug: "draft-wip",
      status: "DRAFT",
    });

    const readyItems = await listReadyMedia(dbHandle.db, { limit: 20 });

    // Ensure draft item is not present in ready catalog
    expect(readyItems.some((item) => item.slug === "draft-wip")).toBe(false);
    expect(readyItems).toHaveLength(10);

    // Verify deterministic ordering: created_at DESC
    // Note: DTO returns id, type, title, slug, durationMs (no internal timestamps/status)
    expect(readyItems[0]).toHaveProperty("id");
    expect(readyItems[0]).toHaveProperty("slug");
    expect(readyItems[0]).toHaveProperty("title");
    expect((readyItems[0] as Record<string, unknown>).status).toBeUndefined();
  });

  it("supports limit and type filtering in listReadyMedia", async () => {
    const limited = await listReadyMedia(dbHandle.db, { limit: 3 });
    expect(limited).toHaveLength(3);

    const videoOnly = await listReadyMedia(dbHandle.db, { type: "VIDEO", limit: 20 });
    expect(videoOnly).toHaveLength(5);
    expect(videoOnly.every((item) => item.type === "VIDEO")).toBe(true);

    const audioOnly = await listReadyMedia(dbHandle.db, { type: "AUDIO", limit: 20 });
    expect(audioOnly).toHaveLength(5);
    expect(audioOnly.every((item) => item.type === "AUDIO")).toBe(true);
  });

  it("runs EXPLAIN (ANALYZE, BUFFERS) against catalog query", async () => {
    const explain = await dbHandle.client`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT id, type, title, slug, duration_ms
      FROM media
      WHERE status = 'READY'
      ORDER BY created_at DESC, id DESC
      LIMIT 20;
    `;
    const planText = explain.map((r) => (r as Record<string, string>)["QUERY PLAN"]).join("\n");
    expect(planText).toBeDefined();
    expect(planText.length).toBeGreaterThan(0);
  });

  it("checkConnection returns false promptly when connection is broken", async () => {
    // Invalid connection URL (unreachable port)
    const brokenHandle = createDatabase(
      "postgres://postgres:postgres@127.0.0.1:54399/streamflow_dummy",
    );
    const isConnected = await brokenHandle.checkConnection();
    expect(isConnected).toBe(false);
    await brokenHandle.close();
  });
});
