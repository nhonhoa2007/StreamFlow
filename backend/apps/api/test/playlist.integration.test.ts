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

describe("Playlist Management & Ownership Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;
  let app: NestFastifyApplication;

  const jwtSecret = "super-secret-jwt-key-with-at-least-32-chars!!";
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let sampleMedia1Id: string;
  let sampleMedia2Id: string;

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

    // Create User A and User B
    userAId = "aaaa1111-1111-1111-1111-111111111111";
    userAToken = jwt.sign({ sub: userAId, email: "user_a@test.com", role: "USER" }, jwtSecret, {
      expiresIn: "1h",
    });
    await dbHandle.client`
      INSERT INTO users (id, email, password_hash, role)
      VALUES (${userAId}::uuid, 'user_a@test.com', 'hash', 'USER')
      ON CONFLICT DO NOTHING;
    `;

    userBId = "bbbb2222-2222-2222-2222-222222222222";
    userBToken = jwt.sign({ sub: userBId, email: "user_b@test.com", role: "USER" }, jwtSecret, {
      expiresIn: "1h",
    });
    await dbHandle.client`
      INSERT INTO users (id, email, password_hash, role)
      VALUES (${userBId}::uuid, 'user_b@test.com', 'hash', 'USER')
      ON CONFLICT DO NOTHING;
    `;

    const [m1] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "AUDIO",
        title: "Track One",
        slug: "track-one-pl",
        status: "READY",
      })
      .returning();
    sampleMedia1Id = m1.id;

    const [m2] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Video Two",
        slug: "video-two-pl",
        status: "READY",
      })
      .returning();
    sampleMedia2Id = m2.id;
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

  describe("Playlist CRUD & Items", () => {
    let playlistId: string;
    let itemId: string;

    it("User A creates a playlist", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/playlists",
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
        payload: {
          name: "User A Playlist",
          description: "Top picks",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe("User A Playlist");
      expect(body.version).toBe(1);
      playlistId = body.id;
    });

    it("User A lists their playlists", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/playlists",
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((p: { id: string }) => p.id === playlistId)).toBe(true);
    });

    it("User A adds an item to their playlist", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/playlists/${playlistId}/items`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
        payload: {
          mediaId: sampleMedia1Id,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.position).toBe(0);
      itemId = body.id;
    });

    it("User A views playlist detail with items", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/playlists/${playlistId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(playlistId);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].mediaId).toBe(sampleMedia1Id);
    });

    describe("Ownership Protection", () => {
      it("User B cannot view User A's playlist (returns 404 Not Found)", async () => {
        const res = await app.inject({
          method: "GET",
          url: `/v1/playlists/${playlistId}`,
          headers: {
            authorization: `Bearer ${userBToken}`,
          },
        });

        expect(res.statusCode).toBe(404);
      });

      it("User B cannot add items to User A's playlist (returns 404 Not Found)", async () => {
        const res = await app.inject({
          method: "POST",
          url: `/v1/playlists/${playlistId}/items`,
          headers: {
            authorization: `Bearer ${userBToken}`,
          },
          payload: {
            mediaId: sampleMedia2Id,
          },
        });

        expect(res.statusCode).toBe(404);
      });

      it("User B cannot delete items from User A's playlist (returns 404 Not Found)", async () => {
        const res = await app.inject({
          method: "DELETE",
          url: `/v1/playlists/${playlistId}/items/${itemId}`,
          headers: {
            authorization: `Bearer ${userBToken}`,
          },
        });

        expect(res.statusCode).toBe(404);
      });
    });

    it("User A deletes item from their playlist", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/playlists/${playlistId}/items/${itemId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("deleted");

      // Verify detail is now empty
      const detailRes = await app.inject({
        method: "GET",
        url: `/v1/playlists/${playlistId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });
      const detailBody = JSON.parse(detailRes.body);
      expect(detailBody.items).toHaveLength(0);
    });
  });
});
