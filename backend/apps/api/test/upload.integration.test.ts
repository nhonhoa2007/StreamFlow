import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { type DatabaseHandle, createDatabase, runMigrations } from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.module.js";
import { QueueService } from "../src/queue/queue.service.js";
import { StorageService } from "../src/storage/storage.service.js";

describe("Admin Upload Lifecycle & Idempotency Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;
  let app: NestFastifyApplication;
  let storageService: StorageService;
  let queueService: QueueService;

  const jwtSecret = "super-secret-jwt-key-with-at-least-32-chars!!";
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await runMigrations(testDb.databaseUrl);
    dbHandle = createDatabase(testDb.databaseUrl);

    app = await buildApp(
      {
        NODE_ENV: "test",
        PORT: 3000,
        DATABASE_URL: testDb.databaseUrl,
        JWT_SECRET: jwtSecret,
      },
      dbHandle,
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    storageService = app.get(StorageService);
    queueService = app.get(QueueService);

    userToken = jwt.sign(
      { sub: "11111111-1111-1111-1111-111111111111", email: "user@test.com", role: "USER" },
      jwtSecret,
      { expiresIn: "1h" },
    );
    adminToken = jwt.sign(
      { sub: "22222222-2222-2222-2222-222222222222", email: "admin@test.com", role: "ADMIN" },
      jwtSecret,
      { expiresIn: "1h" },
    );

    // Create admin user in db for foreign key
    await dbHandle.client`
      INSERT INTO users (id, email, password_hash, role)
      VALUES ('22222222-2222-2222-2222-222222222222'::uuid, 'admin@test.com', 'hash', 'ADMIN')
      ON CONFLICT DO NOTHING;
    `;
  }, 20000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dbHandle) {
      await dbHandle.close();
    }
    if (testDb) {
      await testDb.cleanup();
    }
  });

  describe("POST /v1/admin/uploads/init", () => {
    const validInitPayload = {
      filename: "cinema_trailer.mp4",
      expectedSize: 104857600, // 100 MB
      mimeType: "video/mp4",
      type: "VIDEO",
      title: "Cinema Trailer 4K",
    };

    it("rejects unauthenticated request with 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/uploads/init",
        payload: validInitPayload,
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects non-admin user with 403 Forbidden", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/uploads/init",
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: validInitPayload,
      });

      expect(res.statusCode).toBe(403);
    });

    it("creates upload session and returns presigned URL for ADMIN", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/uploads/init",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: validInitPayload,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.uploadId).toBeDefined();
      expect(body.mediaId).toBeDefined();
      expect(body.objectKey).toMatch(/^raw\/[0-9a-f-]{36}\/[0-9a-f]{32}\/cinema_trailer\.mp4$/);
      expect(body.presignedUrl).toContain("http");
      expect(body.expiresAt).toBeDefined();
    });
  });

  describe("POST /v1/admin/uploads/:id/complete", () => {
    let uploadId: string;
    let mediaId: string;
    let objectKey: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/uploads/init",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          filename: "podcast_ep1.flac",
          expectedSize: 20971520, // 20 MB
          mimeType: "audio/flac",
          type: "AUDIO",
          title: "Podcast Episode 1",
        },
      });

      const body = JSON.parse(res.body);
      uploadId = body.uploadId;
      mediaId = body.mediaId;
      objectKey = body.objectKey;
    });

    it("rejects forged complete with 400 Bad Request when S3 object is missing", async () => {
      // Mock storageService.verifyObjectExists to return exists: false
      vi.spyOn(storageService, "verifyObjectExists").mockResolvedValueOnce({
        exists: false,
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/admin/uploads/${uploadId}/complete`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/not found in storage/i);
    });

    it("completes upload session, updates status to UPLOADED, and registers media_assets", async () => {
      const enqueueSpy = vi
        .spyOn(queueService, "enqueueMetadataClassification")
        .mockResolvedValue({ jobId: "metadata-test", status: "QUEUED" });
      // Mock storageService.verifyObjectExists to return exists: true with valid size
      vi.spyOn(storageService, "verifyObjectExists").mockResolvedValueOnce({
        exists: true,
        sizeBytes: 20971520,
        mimeType: "audio/flac",
        checksum: "sha256_mock_hash",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/admin/uploads/${uploadId}/complete`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("UPLOADED");
      expect(body.mediaId).toBe(mediaId);
      expect(body.assetId).toBeDefined();
      expect(body.objectKey).toBe(objectKey);
      expect(body.sizeBytes).toBe(20971520);

      // Verify in DB
      const [asset] = await dbHandle.client`
        SELECT * FROM media_assets WHERE id = ${body.assetId}::uuid
      `;
      expect(asset.kind).toBe("SOURCE_AUDIO");
      expect(asset.object_key).toBe(objectKey);
      expect(enqueueSpy).toHaveBeenCalledTimes(1);
      expect(enqueueSpy).toHaveBeenCalledWith(mediaId, body.assetId);
    });

    it("handles replaying /complete idempotently with ALREADY_COMPLETED and no duplicate assets", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/admin/uploads/${uploadId}/complete`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("ALREADY_COMPLETED");
      expect(body.mediaId).toBe(mediaId);
      expect(body.objectKey).toBe(objectKey);

      // Ensure no duplicate assets were created in DB
      const assets = await dbHandle.client`
        SELECT * FROM media_assets WHERE media_id = ${mediaId}::uuid
      `;
      expect(assets).toHaveLength(1);
    });

    it("retries metadata enqueue on a replay after the first enqueue failed", async () => {
      const enqueueSpy = vi.mocked(queueService.enqueueMetadataClassification);
      enqueueSpy.mockReset().mockRejectedValueOnce(new Error("redis unavailable"));

      const failed = await app.inject({
        method: "POST",
        url: `/v1/admin/uploads/${uploadId}/complete`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(failed.statusCode).toBe(500);

      enqueueSpy.mockResolvedValueOnce({ jobId: "metadata-retry", status: "QUEUED" });
      const retried = await app.inject({
        method: "POST",
        url: `/v1/admin/uploads/${uploadId}/complete`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(retried.statusCode).toBe(200);
      expect(JSON.parse(retried.body).status).toBe("ALREADY_COMPLETED");
      expect(enqueueSpy).toHaveBeenCalledTimes(2);
    });

    it("does not enqueue standalone metadata classification for video uploads", async () => {
      const init = await app.inject({
        method: "POST",
        url: "/v1/admin/uploads/init",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          filename: "movie.mp4",
          expectedSize: 1024,
          mimeType: "video/mp4",
          type: "VIDEO",
          title: "Movie",
        },
      });
      const initialized = JSON.parse(init.body);
      vi.spyOn(storageService, "verifyObjectExists").mockResolvedValueOnce({
        exists: true,
        sizeBytes: 1024,
        mimeType: "video/mp4",
      });
      const enqueueSpy = vi.mocked(queueService.enqueueMetadataClassification);
      enqueueSpy.mockClear();

      const completed = await app.inject({
        method: "POST",
        url: `/v1/admin/uploads/${initialized.uploadId}/complete`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(completed.statusCode).toBe(200);
      expect(enqueueSpy).not.toHaveBeenCalled();
    });
  });

  describe("POST /v1/admin/uploads/cleanup", () => {
    it("expires abandoned upload sessions past their expires_at deadline", async () => {
      // 1. Insert an expired upload session directly in DB
      const expiredKey = "raw/media-expired/test-key-999/old.mp4";
      const [session] = await dbHandle.client`
        INSERT INTO upload_sessions (
          user_id, object_key, filename, mime_type, expected_size, status, expires_at
        )
        VALUES (
          '22222222-2222-2222-2222-222222222222'::uuid,
          ${expiredKey},
          'old.mp4',
          'video/mp4',
          5000000,
          'UPLOADING',
          now() - interval '1 hour'
        )
        RETURNING id;
      `;

      // 2. Call cleanup endpoint
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/uploads/cleanup",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.expiredCount).toBeGreaterThanOrEqual(1);

      // 3. Verify in DB that status is now EXPIRED
      const [updatedSession] = await dbHandle.client`
        SELECT status FROM upload_sessions WHERE id = ${session.id}::uuid
      `;
      expect(updatedSession.status).toBe("EXPIRED");
    });
  });
});
