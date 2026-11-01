import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  type DatabaseHandle,
  createDatabase,
  mediaAssetsTable,
  mediaTable,
  runMigrations,
  transcodeJobsTable,
} from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.module.js";
import { type TestRedisInstance, startTestRedis } from "./redis-test-helper.js";

describe("BullMQ Transcode Queue & Admin Endpoints Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let testRedis: TestRedisInstance;
  let dbHandle: DatabaseHandle;
  let app: NestFastifyApplication;

  const jwtSecret = "super-secret-jwt-key-with-at-least-32-chars!!";
  let adminToken: string;
  let mediaId: string;
  let sourceAssetId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await runMigrations(testDb.databaseUrl);
    dbHandle = createDatabase(testDb.databaseUrl);
    testRedis = await startTestRedis();

    app = await buildApp(
      {
        NODE_ENV: "test",
        PORT: 3000,
        DATABASE_URL: testDb.databaseUrl,
        JWT_SECRET: jwtSecret,
        REDIS_URL: testRedis.redisUrl,
      },
      dbHandle,
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    adminToken = jwt.sign(
      { sub: "22222222-2222-2222-2222-222222222222", email: "admin@test.com", role: "ADMIN" },
      jwtSecret,
      { expiresIn: "1h" },
    );

    // Seed test media item in DRAFT state
    const [media] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Test Queue Video",
        slug: "test-queue-video",
        status: "DRAFT",
      })
      .returning();
    mediaId = media.id;

    // Seed source asset
    const [asset] = await dbHandle.db
      .insert(mediaAssetsTable)
      .values({
        mediaId,
        kind: "SOURCE_VIDEO",
        objectKey: "uploads/test-video.mp4",
        sizeBytes: 10485760n,
        mimeType: "video/mp4",
      })
      .returning();
    sourceAssetId = asset.id;
  }, 20000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dbHandle) {
      await dbHandle.close();
    }
    if (testRedis) {
      await testRedis.cleanup();
    }
    if (testDb) {
      await testDb.cleanup();
    }
  });

  it("POST /v1/admin/media/:id/transcode enqueues job and returns 202 with deterministic jobId", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/admin/media/${mediaId}/transcode`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBe(`transcode_${mediaId}_${sourceAssetId}_1`);
    expect(body.status).toBe("QUEUED");

    // Check database has exactly 1 job record
    const jobs = await dbHandle.db
      .select()
      .from(transcodeJobsTable)
      .where(eq(transcodeJobsTable.mediaId, mediaId));
    expect(jobs.length).toBe(1);
    expect(jobs[0].status).toBe("QUEUED");
  });

  it("POST /v1/admin/media/:id/transcode is idempotent under duplicate enqueues", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/admin/media/${mediaId}/transcode`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBe(`transcode_${mediaId}_${sourceAssetId}_1`);

    // Verify DB still only has 1 record (no duplicate inserted)
    const jobs = await dbHandle.db
      .select()
      .from(transcodeJobsTable)
      .where(eq(transcodeJobsTable.mediaId, mediaId));
    expect(jobs.length).toBe(1);
  });

  it("GET /v1/admin/transcode-jobs/:id returns status and attempts", async () => {
    const expectedJobId = `transcode_${mediaId}_${sourceAssetId}_1`;

    const res = await app.inject({
      method: "GET",
      url: `/v1/admin/transcode-jobs/${encodeURIComponent(expectedJobId)}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBe(expectedJobId);
    expect(body.status).toBe("QUEUED");
    expect(body.progressPercent).toBe(0);
    expect(body.attempts).toBe(0);
  });

  it("GET /v1/admin/media/:id/transcode-jobs returns array of jobs for media item", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/admin/media/${mediaId}/transcode-jobs`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].jobId).toBe(`transcode_${mediaId}_${sourceAssetId}_1`);
  });
});
