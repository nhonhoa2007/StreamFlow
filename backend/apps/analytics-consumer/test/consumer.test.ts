import {
  type DatabaseHandle,
  createDatabase,
  mediaTable,
  runMigrations,
} from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AnalyticsConsumerHandle, createAnalyticsConsumer } from "../src/consumer.js";

describe("Analytics Consumer & Idempotent Projection Tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await runMigrations(testDb.databaseUrl);
    dbHandle = createDatabase(testDb.databaseUrl);
  }, 20000);

  afterAll(async () => {
    if (dbHandle) await dbHandle.close();
    if (testDb) await testDb.cleanup();
  });

  it("processes playback.started event and idempotently updates media_playback_stats", async () => {
    const [media] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Consumer Target Video",
        slug: `consumer-video-${Date.now()}`,
        status: "READY",
      })
      .returning();

    const consumer: AnalyticsConsumerHandle = createAnalyticsConsumer({
      dbHandle,
      consumerGroup: "streamflow-analytics-group",
    });

    try {
      const eventId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const timestamp = new Date();

      // 1. Process initial message
      const firstResult = await consumer.processMessage({
        eventId,
        aggregateType: "playback",
        aggregateId: media.id,
        eventType: "playback.started",
        payload: { mediaId: media.id, positionMs: 0 },
        createdAt: timestamp,
      });

      expect(firstResult.processed).toBe(true);

      const [statsAfterFirst] = await dbHandle.client`
        SELECT play_count, total_watch_time_seconds FROM media_playback_stats WHERE media_id = ${media.id}::uuid
      `;
      expect(statsAfterFirst.play_count).toBe(1);

      // 2. Process duplicate message with identical eventId (e.g. on Kafka consumer crash / redelivery)
      const duplicateResult = await consumer.processMessage({
        eventId,
        aggregateType: "playback",
        aggregateId: media.id,
        eventType: "playback.started",
        payload: { mediaId: media.id, positionMs: 0 },
        createdAt: timestamp,
      });

      expect(duplicateResult.processed).toBe(false);

      const [statsAfterDuplicate] = await dbHandle.client`
        SELECT play_count, total_watch_time_seconds FROM media_playback_stats WHERE media_id = ${media.id}::uuid
      `;
      // Verifies no duplicate increment (still exactly 1)
      expect(statsAfterDuplicate.play_count).toBe(1);
    } finally {
      await consumer.close();
    }
  });
});
