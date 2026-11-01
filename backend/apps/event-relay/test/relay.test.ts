import {
  type DatabaseHandle,
  createDatabase,
  mediaTable,
  outboxEventsTable,
  runMigrations,
} from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type EventRelayHandle, createEventRelay } from "../src/relay.js";

describe("Transactional Outbox Event Relay Integration Tests", () => {
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

  it("claims pending outbox events, publishes to Kafka with partition key, and marks PUBLISHED", async () => {
    // 1. Seed two media items
    const [m1] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Relay Video 1",
        slug: `relay-video-1-${Date.now()}`,
        status: "READY",
      })
      .returning();

    const [m2] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "AUDIO",
        title: "Relay Audio 2",
        slug: `relay-audio-2-${Date.now()}`,
        status: "READY",
      })
      .returning();

    // 2. Insert 3 pending outbox events
    const [e1] = await dbHandle.db
      .insert(outboxEventsTable)
      .values({
        aggregateType: "playback",
        aggregateId: m1.id,
        eventType: "playback.started",
        payload: { mediaId: m1.id, positionMs: 0 },
        status: "PENDING",
      })
      .returning();

    const [e2] = await dbHandle.db
      .insert(outboxEventsTable)
      .values({
        aggregateType: "playback",
        aggregateId: m1.id,
        eventType: "playback.progress",
        payload: { mediaId: m1.id, positionMs: 30000 },
        status: "PENDING",
      })
      .returning();

    const [e3] = await dbHandle.db
      .insert(outboxEventsTable)
      .values({
        aggregateType: "playback",
        aggregateId: m2.id,
        eventType: "playback.started",
        payload: { mediaId: m2.id, positionMs: 0 },
        status: "PENDING",
      })
      .returning();

    const publishedRecords: Array<{ topic: string; key: string; value: string }> = [];

    const mockPublisher = async (records: Array<{ topic: string; key: string; value: string }>) => {
      publishedRecords.push(...records);
    };

    const relay: EventRelayHandle = createEventRelay({
      dbHandle,
      topic: "media-playback-events",
      batchSize: 10,
      publisher: mockPublisher,
    });

    try {
      // 3. Poll once
      const processedCount = await relay.pollOnce();
      expect(processedCount).toBe(3);

      // 4. Verify Kafka messages
      expect(publishedRecords).toHaveLength(3);
      expect(publishedRecords[0].key).toBe(m1.id);
      expect(publishedRecords[1].key).toBe(m1.id);
      expect(publishedRecords[2].key).toBe(m2.id);

      const parsedPayload1 = JSON.parse(publishedRecords[0].value);
      expect(parsedPayload1.eventId).toBe(e1.id);
      expect(parsedPayload1.eventType).toBe("playback.started");

      // 5. Verify database records updated to PUBLISHED
      const dbRecords = await dbHandle.client`
        SELECT id, status, published_at FROM outbox_events WHERE id IN (${e1.id}::uuid, ${e2.id}::uuid, ${e3.id}::uuid)
      `;
      expect(dbRecords).toHaveLength(3);
      for (const row of dbRecords) {
        expect(row.status).toBe("PUBLISHED");
        expect(row.published_at).not.toBeNull();
      }

      // Second poll should find 0 pending records
      const secondPollCount = await relay.pollOnce();
      expect(secondPollCount).toBe(0);
    } finally {
      await relay.close();
    }
  });
});
