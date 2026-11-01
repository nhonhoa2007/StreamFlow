import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  type DatabaseHandle,
  createDatabase,
  mediaAssetsTable,
  mediaTable,
  runMigrations,
} from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.module.js";

describe("Playback Sessions & Telemetry Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;
  let app: NestFastifyApplication;

  const jwtSecret = "super-secret-jwt-key-with-at-least-32-chars!!";
  let userToken: string;
  let userId: string;
  let sampleMediaId: string;

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

    userId = "77777777-7777-7777-7777-777777777777";
    userToken = jwt.sign(
      { sub: userId, email: "playback_user@test.com", role: "USER" },
      jwtSecret,
      { expiresIn: "1h" },
    );

    await dbHandle.client`
      INSERT INTO users (id, email, password_hash, role)
      VALUES (${userId}::uuid, 'playback_user@test.com', 'hash', 'USER')
      ON CONFLICT DO NOTHING;
    `;

    const [media] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Streaming Documentary",
        slug: "streaming-documentary",
        status: "READY",
        durationMs: 720000,
      })
      .returning();
    sampleMediaId = media.id;
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

  describe("POST /v1/playback/:id/start", () => {
    it("rejects unauthenticated request with 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/playback/${sampleMediaId}/start`,
      });

      expect(res.statusCode).toBe(401);
    });

    it("starts playback session and returns initial positionMs (0)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/playback/${sampleMediaId}/start`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.sessionId).toBeDefined();
      expect(body.mediaId).toBe(sampleMediaId);
      expect(body.positionMs).toBe(0);
    });
  });

  describe("PUT /v1/playback/sessions/:id/progress & Experiment 2", () => {
    let activeSessionId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/playback/${sampleMediaId}/start`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });
      activeSessionId = JSON.parse(res.body).sessionId;
    });

    it("rejects unauthenticated progress update with 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/v1/playback/sessions/${activeSessionId}/progress`,
        payload: {
          sequence: 1,
          positionMs: 15000,
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("updates progress with sequence 1 (30s)", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/v1/playback/sessions/${activeSessionId}/progress`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          sequence: 1,
          positionMs: 30000,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("updated");
      expect(body.positionMs).toBe(30000);
      expect(body.lastSequence).toBe(1);
    });

    it("updates progress with sequence 3 (90s)", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/v1/playback/sessions/${activeSessionId}/progress`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          sequence: 3,
          positionMs: 90000,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("updated");
      expect(body.positionMs).toBe(90000);
      expect(body.lastSequence).toBe(3);
    });

    it("Experiment 2: Stale sequence 2 (60s) arriving out-of-order is rejected/ignored", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/v1/playback/sessions/${activeSessionId}/progress`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          sequence: 2, // Out-of-order! Older than sequence 3
          positionMs: 60000,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("ignored");
      expect(body.reason).toBe("stale_sequence");
      expect(body.positionMs).toBe(90000); // Preserved newer position
      expect(body.lastSequence).toBe(3);

      // Verify resume position reflects sequence 3 (90000) when starting a new session
      const startRes = await app.inject({
        method: "POST",
        url: `/v1/playback/${sampleMediaId}/start`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });
      const startBody = JSON.parse(startRes.body);
      expect(startBody.positionMs).toBe(90000);
    });
  });

  describe("Playback Manifest & Thumbnail Endpoints", () => {
    let draftMediaId: string;

    beforeAll(async () => {
      // Create a DRAFT media
      const [draft] = await dbHandle.db
        .insert(mediaTable)
        .values({
          type: "VIDEO",
          title: "Draft Unfinished Film",
          slug: "draft-unfinished-manifest",
          status: "DRAFT",
        })
        .returning();
      draftMediaId = draft.id;

      // Add HLS and Thumbnail assets for sampleMediaId (READY)
      await dbHandle.db.insert(mediaAssetsTable).values([
        {
          mediaId: sampleMediaId,
          kind: "HLS_PLAYLIST",
          objectKey: `hls/${sampleMediaId}/master.m3u8`,
          sizeBytes: 500n,
          mimeType: "application/vnd.apple.mpegurl",
        },
        {
          mediaId: sampleMediaId,
          kind: "HLS_PLAYLIST",
          objectKey: `hls/${sampleMediaId}/720p.m3u8`,
          sizeBytes: 1500n,
          mimeType: "application/vnd.apple.mpegurl",
        },
        {
          mediaId: sampleMediaId,
          kind: "THUMBNAIL",
          objectKey: `thumbnails/${sampleMediaId}/poster.jpg`,
          sizeBytes: 45000n,
          mimeType: "image/jpeg",
        },
      ]);
    });

    it("GET /v1/playback/:id/manifest returns 404 for DRAFT media", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/playback/${draftMediaId}/manifest`,
      });

      expect(res.statusCode).toBe(404);
    });

    it("GET /v1/playback/:id/manifest returns master playlist and renditions for READY media", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/playback/${sampleMediaId}/manifest`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.mediaId).toBe(sampleMediaId);
      expect(body.masterPlaylistUrl).toContain(`hls/${sampleMediaId}/master.m3u8`);
      expect(body.thumbnailUrl).toContain(`thumbnails/${sampleMediaId}/poster.jpg`);
      expect(body.renditions.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /v1/playback/:id/thumbnail returns thumbnail information for READY media", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/playback/${sampleMediaId}/thumbnail`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.mediaId).toBe(sampleMediaId);
      expect(body.objectKey).toBe(`thumbnails/${sampleMediaId}/poster.jpg`);
      expect(body.thumbnailUrl).toContain(`thumbnails/${sampleMediaId}/poster.jpg`);
    });
  });
});
