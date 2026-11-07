import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  type DatabaseHandle,
  createDatabase,
  mediaTable,
  runMigrations,
} from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.module.js";

describe("Library & Favorites Integration Tests", () => {
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

    // Create user and media
    userId = "33333333-3333-3333-3333-333333333333";
    userToken = jwt.sign({ sub: userId, email: "fav_user@test.com", role: "USER" }, jwtSecret, {
      expiresIn: "1h",
    });
    await dbHandle.client`
      INSERT INTO users (id, email, password_hash, role)
      VALUES (${userId}::uuid, 'fav_user@test.com', 'hash', 'USER')
      ON CONFLICT DO NOTHING;
    `;

    const [media] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "AUDIO",
        title: "Favorite Song",
        slug: "favorite-song",
        status: "READY",
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

  describe("POST /v1/media/:id/favorite", () => {
    it("rejects unauthenticated request with 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/media/${sampleMediaId}/favorite`,
      });

      expect(res.statusCode).toBe(401);
    });

    it("adds media to user favorites idempotently", async () => {
      // First call -> added
      const res1 = await app.inject({
        method: "POST",
        url: `/v1/media/${sampleMediaId}/favorite`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(res1.statusCode).toBe(200);
      const body1 = JSON.parse(res1.body);
      expect(body1).toEqual({ status: "ok", favorited: true });

      // Second call (idempotent) -> still 200, favorited true
      const res2 = await app.inject({
        method: "POST",
        url: `/v1/media/${sampleMediaId}/favorite`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(res2.statusCode).toBe(200);
      const body2 = JSON.parse(res2.body);
      expect(body2).toEqual({ status: "ok", favorited: true });
    });
  });

  describe("GET /v1/library/favorites", () => {
    it("rejects unauthenticated request with 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/library/favorites",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns list of user favorites", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/library/favorites",
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].mediaId).toBe(sampleMediaId);
      expect(body.items[0].media.title).toBe("Favorite Song");
    });
  });

  describe("GET /v1/library/history", () => {
    it("rejects unauthenticated requests", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/library/history" });
      expect(res.statusCode).toBe(401);
    });

    it("returns the user's ready playback history ordered by recency", async () => {
      await dbHandle.client`
        INSERT INTO playback_progress (user_id, media_id, position_ms, last_sequence, updated_at)
        VALUES (${userId}::uuid, ${sampleMediaId}::uuid, 12000, 1, now())
        ON CONFLICT (user_id, media_id) DO UPDATE SET position_ms = EXCLUDED.position_ms, updated_at = EXCLUDED.updated_at;
      `;
      const res = await app.inject({
        method: "GET",
        url: "/v1/library/history",
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).items[0]).toMatchObject({
        mediaId: sampleMediaId,
        positionMs: 12000,
      });
    });
  });

  describe("DELETE /v1/media/:id/favorite", () => {
    it("removes media from user favorites idempotently", async () => {
      // First delete -> removed
      const res1 = await app.inject({
        method: "DELETE",
        url: `/v1/media/${sampleMediaId}/favorite`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(res1.statusCode).toBe(200);
      const body1 = JSON.parse(res1.body);
      expect(body1).toEqual({ status: "ok", favorited: false });

      // Second delete (idempotent) -> still 200
      const res2 = await app.inject({
        method: "DELETE",
        url: `/v1/media/${sampleMediaId}/favorite`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(res2.statusCode).toBe(200);
      const body2 = JSON.parse(res2.body);
      expect(body2).toEqual({ status: "ok", favorited: false });

      // Verify list is now empty
      const listRes = await app.inject({
        method: "GET",
        url: "/v1/library/favorites",
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });
      const listBody = JSON.parse(listRes.body);
      expect(listBody.items).toHaveLength(0);
    });
  });
});
