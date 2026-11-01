import {
  type DatabaseHandle,
  createDatabase,
  mediaAssetsTable,
  mediaTable,
  runMigrations,
  transcodeJobsTable,
} from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { Queue } from "bullmq";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type TranscodeWorkerHandle, createTranscodeWorker } from "../src/worker.js";
import { type TestRedisInstance, startTestRedis } from "./redis-test-helper.js";

describe("BullMQ Transcode Worker Integration Tests", () => {
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

  it("processes enqueued job and invokes pipeline runner", async () => {
    const queueName = `test-worker-${Date.now()}`;
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
        title: "Worker Video",
        slug: `worker-video-${Date.now()}`,
        status: "DRAFT",
      })
      .returning();

    const [asset] = await dbHandle.db
      .insert(mediaAssetsTable)
      .values({
        mediaId: media.id,
        kind: "SOURCE_VIDEO",
        objectKey: "uploads/worker-video.mp4",
        sizeBytes: 10485760n,
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

    let executed = false;
    let workerHandle: TranscodeWorkerHandle | undefined;

    try {
      workerHandle = createTranscodeWorker({
        redisUrl: testRedis.redisUrl,
        queueName,
        concurrency: 2,
        dbHandle,
        pipelineRunner: async (opts) => {
          expect(opts.jobId).toBe(job.id);
          executed = true;
          return { success: true };
        },
      });

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
        },
      );

      // Wait for job to process
      let attempts = 0;
      while (!executed && attempts < 50) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }

      expect(executed).toBe(true);
    } finally {
      if (workerHandle) await workerHandle.close();
      await queue.close();
    }
  });

  it("strictly bounds concurrency to 2 concurrent jobs", async () => {
    const queueName = `test-concurrency-${Date.now()}`;
    const redisUrl = new URL(testRedis.redisUrl);
    const queue = new Queue(queueName, {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port),
        maxRetriesPerRequest: null,
      },
    });

    let currentConcurrency = 0;
    let maxObservedConcurrency = 0;
    let completedCount = 0;

    const workerHandle = createTranscodeWorker({
      redisUrl: testRedis.redisUrl,
      queueName,
      concurrency: 2,
      dbHandle,
      pipelineRunner: async () => {
        currentConcurrency++;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, currentConcurrency);
        await new Promise((r) => setTimeout(r, 150));
        currentConcurrency--;
        completedCount++;
        return { success: true };
      },
    });

    try {
      // Seed and enqueue 5 jobs
      for (let i = 0; i < 5; i++) {
        const [m] = await dbHandle.db
          .insert(mediaTable)
          .values({
            type: "VIDEO",
            title: `Concurrent Media ${i}`,
            slug: `concurrent-${Date.now()}-${i}`,
            status: "DRAFT",
          })
          .returning();

        const [a] = await dbHandle.db
          .insert(mediaAssetsTable)
          .values({
            mediaId: m.id,
            kind: "SOURCE_VIDEO",
            objectKey: `uploads/conc-${i}.mp4`,
            sizeBytes: 1048576n,
            mimeType: "video/mp4",
          })
          .returning();

        await dbHandle.db.insert(transcodeJobsTable).values({
          mediaId: m.id,
          sourceAssetId: a.id,
          profileVersion: 1,
          status: "QUEUED",
        });

        await queue.add(
          "transcode",
          {
            mediaId: m.id,
            sourceAssetId: a.id,
            profileVersion: 1,
            sourceObjectKey: a.objectKey,
          },
          {
            jobId: `transcode_${m.id}_${a.id}_1`,
          },
        );
      }

      // Wait until all 5 complete
      let attempts = 0;
      while (completedCount < 5 && attempts < 100) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }

      expect(completedCount).toBe(5);
      expect(maxObservedConcurrency).toBeLessThanOrEqual(2);
    } finally {
      await workerHandle.close();
      await queue.close();
    }
  });
});
