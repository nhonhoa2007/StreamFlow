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

    it("User A updates playlist metadata and User B cannot update or delete it", async () => {
      const update = await app.inject({
        method: "PATCH",
        url: `/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { name: "Updated Playlist", description: "Updated description" },
      });
      expect(update.statusCode).toBe(200);
      expect(JSON.parse(update.body)).toMatchObject({ name: "Updated Playlist", version: 2 });

      const forbiddenUpdate = await app.inject({
        method: "PATCH",
        url: `/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${userBToken}` },
        payload: { name: "Should not work" },
      });
      expect(forbiddenUpdate.statusCode).toBe(404);

      const forbiddenDelete = await app.inject({
        method: "DELETE",
        url: `/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(forbiddenDelete.statusCode).toBe(404);
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

  describe("PATCH /v1/playlists/:id/items/reorder & Experiment 1 Concurrency", () => {
    let reorderPlaylistId: string;
    let item1Id: string;
    let item2Id: string;
    let item3Id: string;

    beforeAll(async () => {
      // Create fresh playlist with 3 items
      const res = await app.inject({
        method: "POST",
        url: "/v1/playlists",
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
        payload: {
          name: "Reorder Concurrency Test Playlist",
        },
      });
      reorderPlaylistId = JSON.parse(res.body).id;

      // Add 3 items
      const it1 = await app.inject({
        method: "POST",
        url: `/v1/playlists/${reorderPlaylistId}/items`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { mediaId: sampleMedia1Id },
      });
      item1Id = JSON.parse(it1.body).id;

      const it2 = await app.inject({
        method: "POST",
        url: `/v1/playlists/${reorderPlaylistId}/items`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { mediaId: sampleMedia2Id },
      });
      item2Id = JSON.parse(it2.body).id;

      // Create a 3rd media item for testing
      const [m3] = await dbHandle.db
        .insert(mediaTable)
        .values({
          type: "AUDIO",
          title: "Track Three",
          slug: "track-three-pl",
          status: "READY",
        })
        .returning();
      const it3 = await app.inject({
        method: "POST",
        url: `/v1/playlists/${reorderPlaylistId}/items`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { mediaId: m3.id },
      });
      item3Id = JSON.parse(it3.body).id;
    });

    it("reorders items sequentially with valid expectedVersion", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/playlists/${reorderPlaylistId}/items/reorder`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          expectedVersion: 1,
          itemIds: [item3Id, item2Id, item1Id],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.newVersion).toBe(2);

      // Verify positions
      const detailRes = await app.inject({
        method: "GET",
        url: `/v1/playlists/${reorderPlaylistId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const detail = JSON.parse(detailRes.body);
      expect(detail.version).toBe(2);
      expect(detail.items[0].id).toBe(item3Id);
      expect(detail.items[0].position).toBe(0);
      expect(detail.items[1].id).toBe(item2Id);
      expect(detail.items[1].position).toBe(1);
      expect(detail.items[2].id).toBe(item1Id);
      expect(detail.items[2].position).toBe(2);
    });

    it("returns 409 Conflict when expectedVersion is stale", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/playlists/${reorderPlaylistId}/items/reorder`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          expectedVersion: 1, // Stale! Current is 2
          itemIds: [item1Id, item2Id, item3Id],
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/concurrently/i);
    });

    it("Experiment 1: 20 concurrent reorder requests -> exactly 1 succeeds (200), 19 conflict (409)", async () => {
      // Current version is 2
      const targetVersion = 2;

      // 20 concurrent requests with different order permutations
      const requests = Array.from({ length: 20 }, (_, idx) => {
        const itemIds = idx % 2 === 0 ? [item1Id, item3Id, item2Id] : [item2Id, item1Id, item3Id];

        return app.inject({
          method: "PATCH",
          url: `/v1/playlists/${reorderPlaylistId}/items/reorder`,
          headers: { authorization: `Bearer ${userAToken}` },
          payload: {
            expectedVersion: targetVersion,
            itemIds,
          },
        });
      });

      const responses = await Promise.all(requests);
      const successCount = responses.filter((r) => r.statusCode === 200).length;
      const conflictCount = responses.filter((r) => r.statusCode === 409).length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(19);

      // Verify playlist final state invariants:
      // 1. Version incremented by exactly 1 (from 2 to 3)
      // 2. Exactly 3 items remain
      // 3. Positions are contiguous 0, 1, 2
      const detailRes = await app.inject({
        method: "GET",
        url: `/v1/playlists/${reorderPlaylistId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const detail = JSON.parse(detailRes.body);
      expect(detail.version).toBe(3);
      expect(detail.items).toHaveLength(3);
      expect(detail.items.map((it: { position: number }) => it.position)).toEqual([0, 1, 2]);
    });
  });
});
