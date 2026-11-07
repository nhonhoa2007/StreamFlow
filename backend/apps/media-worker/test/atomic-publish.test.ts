import fs from "node:fs";
import path from "node:path";
import {
  type DatabaseHandle,
  createDatabase,
  mediaAssetsTable,
  mediaTable,
  runMigrations,
  transcodeJobsTable,
} from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { Queue, UnrecoverableError } from "bullmq";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type TranscodeWorkerHandle, createTranscodeWorker } from "../src/worker.js";
import { type TestRedisInstance, startTestRedis } from "./redis-test-helper.js";

describe("Atomic Output Publication & Poison Message Quarantine", () => {
  let testDb: TestDatabaseInstance;
  let testRedis: TestRedisInstance;
  let dbHandle: DatabaseHandle;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await runMigrations(testDb.databaseUrl);
    dbHandle = createDatabase(testDb.databaseUrl);
    testRedis = await startTestRedis();
  }, 20000);

  afterAll(async () => {
    if (dbHandle) await dbHandle.close();
    if (testRedis) await testRedis.cleanup();
    if (testDb) await testDb.cleanup();
  });

  it("leaves media in DRAFT when pipeline is interrupted before atomic promotion", async () => {
    const queueName = `test-atomic-${Date.now()}`;
    const redisUrl = new URL(testRedis.redisUrl);
    const queue = new Queue(queueName, {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port),
        maxRetriesPerRequest: null,
      },
    });

    const [media] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Interrupted Video",
        slug: `interrupted-${Date.now()}`,
        status: "DRAFT",
      })
      .returning();

    const [asset] = await dbHandle.db
      .insert(mediaAssetsTable)
      .values({
        mediaId: media.id,
        kind: "SOURCE_VIDEO",
        objectKey: "uploads/interrupted.mp4",
        sizeBytes: 5000000n,
        mimeType: "video/mp4",
      })
      .returning();

    const [job] = await dbHandle.db
      .insert(transcodeJobsTable)
      .values({
        mediaId: media.id,
        sourceAssetId: asset.id,
        profileVersion: 1,
        status: "QUEUED",
      })
      .returning();

    let attempts = 0;
    const workerHandle = createTranscodeWorker({
      redisUrl: testRedis.redisUrl,
      queueName,
      concurrency: 1,
      dbHandle,
      pipelineRunner: async () => {
        attempts++;
        // Simulate crash right before atomic promotion
        throw new Error("Worker killed or crashed at 80% segments upload");
      },
    });

    try {
      await queue.add(
        "transcode",
        {
          mediaId: media.id,
          sourceAssetId: asset.id,
          profileVersion: 1,
          sourceObjectKey: asset.objectKey,
        },
        {
          jobId: `transcode_${media.id}_${asset.id}_1`,
          attempts: 1,
        },
      );

      // Wait for job failure
      let checks = 0;
      while (attempts === 0 && checks < 50) {
        await new Promise((r) => setTimeout(r, 100));
        checks++;
      }

      // Allow error handler to settle
      await new Promise((r) => setTimeout(r, 200));

      // Assert media status was NEVER set to READY
      const [mediaRecord] = await dbHandle.db
        .select()
        .from(mediaTable)
        .where(eq(mediaTable.id, media.id));
      expect(mediaRecord.status).not.toBe("READY");
      expect(mediaRecord.metadata).toBeNull();
      expect(mediaRecord.classificationLabels).toEqual([]);

      // Assert no HLS assets were published
      const publishedAssets = await dbHandle.db
        .select()
        .from(mediaAssetsTable)
        .where(eq(mediaAssetsTable.mediaId, media.id));
      const hlsAssets = publishedAssets.filter((a) => a.kind === "HLS_PLAYLIST");
      expect(hlsAssets.length).toBe(0);
    } finally {
      await workerHandle.close();
      await queue.close();
    }
  });

  it("immediately quarantines poison messages without retrying 3 times", async () => {
    const queueName = `test-poison-${Date.now()}`;
    const redisUrl = new URL(testRedis.redisUrl);
    const queue = new Queue(queueName, {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port),
        maxRetriesPerRequest: null,
      },
    });

    const [media] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Poison Video",
        slug: `poison-${Date.now()}`,
        status: "DRAFT",
      })
      .returning();

    const [asset] = await dbHandle.db
      .insert(mediaAssetsTable)
      .values({
        mediaId: media.id,
        kind: "SOURCE_VIDEO",
        objectKey: "uploads/corrupted-header.mp4",
        sizeBytes: 100n,
        mimeType: "video/mp4",
      })
      .returning();

    const [job] = await dbHandle.db
      .insert(transcodeJobsTable)
      .values({
        mediaId: media.id,
        sourceAssetId: asset.id,
        profileVersion: 1,
        status: "QUEUED",
      })
      .returning();

    let executionsCount = 0;
    const workerHandle = createTranscodeWorker({
      redisUrl: testRedis.redisUrl,
      queueName,
      concurrency: 1,
      dbHandle,
      pipelineRunner: async () => {
        executionsCount++;
        throw new UnrecoverableError(
          "Invalid or unreadable video media stream: moov atom not found",
        );
      },
    });

    try {
      const bullJob = await queue.add(
        "transcode",
        {
          mediaId: media.id,
          sourceAssetId: asset.id,
          profileVersion: 1,
          sourceObjectKey: asset.objectKey,
        },
        {
          jobId: `transcode_${media.id}_${asset.id}_1`,
          attempts: 3,
        },
      );

      // Wait for BullMQ to process job
      let checks = 0;
      while (executionsCount === 0 && checks < 50) {
        await new Promise((r) => setTimeout(r, 100));
        checks++;
      }

      await new Promise((r) => setTimeout(r, 400));

      // Assert executed exactly 1 time (NOT retried 3 times)
      expect(executionsCount).toBe(1);

      // Assert DB state transitioned to FAILED
      const [updatedJob] = await dbHandle.db
        .select()
        .from(transcodeJobsTable)
        .where(eq(transcodeJobsTable.id, job.id));
      expect(updatedJob.status).toBe("FAILED");
      expect(updatedJob.errorMessage).toContain("moov atom not found");

      const [updatedMedia] = await dbHandle.db
        .select()
        .from(mediaTable)
        .where(eq(mediaTable.id, media.id));
      expect(updatedMedia.status).toBe("DRAFT");
    } finally {
      await workerHandle.close();
      await queue.close();
    }
  });
});
