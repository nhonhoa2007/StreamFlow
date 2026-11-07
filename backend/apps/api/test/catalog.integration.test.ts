import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  type DatabaseHandle,
  albumsTable,
  artistsTable,
  createDatabase,
  mediaArtistsTable,
  mediaTable,
  runMigrations,
} from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.module.js";

describe("Catalog Keyset Pagination, Detail & Search Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;
  let app: NestFastifyApplication;

  const jwtSecret = "super-secret-jwt-key-with-at-least-32-chars!!";
  let sampleAlbumId: string;
  let sampleArtistId: string;
  let sampleMediaId: string;
  let draftMediaId: string;

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

    // 1. Seed artist and album
    const [artist] = await dbHandle.db
      .insert(artistsTable)
      .values({
        name: "Starlight Orchestra",
        slug: "starlight-orchestra",
        bio: "Symphonic electronic ensemble",
      })
      .returning();
    sampleArtistId = artist.id;

    const [album] = await dbHandle.db
      .insert(albumsTable)
      .values({
        title: "Galactic Journey",
        slug: "galactic-journey",
        artistId: sampleArtistId,
        releaseYear: 2026,
      })
      .returning();
    sampleAlbumId = album.id;

    // 2. Seed 25 READY items with staggered published_at timestamps (1 minute apart)
    const baseTime = new Date("2026-11-01T00:00:00Z").getTime();
    for (let i = 1; i <= 25; i++) {
      const publishedAt = new Date(baseTime + i * 60000);
      const [m] = await dbHandle.db
        .insert(mediaTable)
        .values({
          type: i % 2 === 0 ? "VIDEO" : "AUDIO",
          title: `Track Number ${i.toString().padStart(2, "0")}`,
          slug: `track-${i.toString().padStart(2, "0")}`,
          status: "READY",
          durationMs: 180000 + i * 1000,
          classificationLabels:
            i % 2 === 0
              ? ["video-hd", i % 4 === 0 ? "genre-rock" : "genre-pop"]
              : ["audio-lossy", i % 3 === 0 ? "genre-rock" : "genre-jazz"],
          albumId: i === 1 ? sampleAlbumId : null,
          publishedAt,
        })
        .returning();

      if (i === 1) {
        sampleMediaId = m.id;
        await dbHandle.db.insert(mediaArtistsTable).values({
          mediaId: m.id,
          artistId: sampleArtistId,
          role: "MAIN",
        });
      }
    }

    // 3. Seed 1 DRAFT item
    const [draft] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Secret Unreleased Film",
        slug: "secret-unreleased",
        status: "DRAFT",
      })
      .returning();
    draftMediaId = draft.id;
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

  describe("Keyset Cursor Pagination (GET /v1/media)", () => {
    it("pages through 25 items with limit=10 without duplicates or skipped items", async () => {
      // Page 1
      const res1 = await app.inject({
        method: "GET",
        url: "/v1/media?limit=10",
      });

      expect(res1.statusCode).toBe(200);
      const page1 = JSON.parse(res1.body);
      expect(page1.items).toHaveLength(10);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();

      const page1Ids = new Set(page1.items.map((i: { id: string }) => i.id));
      expect(page1Ids.size).toBe(10);

      // Page 2
      const res2 = await app.inject({
        method: "GET",
        url: `/v1/media?limit=10&cursor=${encodeURIComponent(page1.nextCursor)}`,
      });

      expect(res2.statusCode).toBe(200);
      const page2 = JSON.parse(res2.body);
      expect(page2.items).toHaveLength(10);
      expect(page2.hasMore).toBe(true);
      expect(page2.nextCursor).toBeDefined();

      // Ensure NO item in page 2 was in page 1
      for (const item of page2.items) {
        expect(page1Ids.has(item.id)).toBe(false);
      }
      const page2Ids = new Set(page2.items.map((i: { id: string }) => i.id));

      // Page 3 (Remaining 5 items)
      const res3 = await app.inject({
        method: "GET",
        url: `/v1/media?limit=10&cursor=${encodeURIComponent(page2.nextCursor)}`,
      });

      expect(res3.statusCode).toBe(200);
      const page3 = JSON.parse(res3.body);
      expect(page3.items).toHaveLength(5);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeNull();

      for (const item of page3.items) {
        expect(page1Ids.has(item.id)).toBe(false);
        expect(page2Ids.has(item.id)).toBe(false);
      }
    });

    it("filters by type with keyset pagination", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/media?type=VIDEO&limit=5",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items).toHaveLength(5);
      expect(body.items.every((i: { type: string }) => i.type === "VIDEO")).toBe(true);
    });
  });

  describe("Media Detail (GET /v1/media/:id)", () => {
    it("returns media detail with album and artist relationships", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/media/${sampleMediaId}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(sampleMediaId);
      expect(body.title).toBe("Track Number 01");
      expect(body.classificationLabels).toEqual(["audio-lossy", "genre-jazz"]);
      expect(body.metadata).toBeUndefined();
      expect(body.album).toEqual({
        id: sampleAlbumId,
        title: "Galactic Journey",
        slug: "galactic-journey",
      });
      expect(body.artists).toEqual([
        {
          id: sampleArtistId,
          name: "Starlight Orchestra",
          slug: "starlight-orchestra",
          role: "MAIN",
        },
      ]);
    });

    it("returns 404 for DRAFT media item on public detail endpoint", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/media/${draftMediaId}`,
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for non-existent media id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/media/00000000-0000-0000-0000-000000000000",
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("Search (GET /v1/search)", () => {
    it("pages through every search result without repeating or skipping media", async () => {
      const ids: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 3; page++) {
        const query = new URLSearchParams({ q: "Track Number", limit: "10" });
        if (cursor) query.set("cursor", cursor);
        const response = await app.inject({ method: "GET", url: `/v1/search?${query}` });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        ids.push(...body.items.map((item: { id: string }) => item.id));
        expect(body.hasMore).toBe(page < 2);
        cursor = body.nextCursor;
      }
      expect(ids).toHaveLength(25);
      expect(new Set(ids).size).toBe(25);
      expect(cursor).toBeNull();
    });

    it("keeps tied microsecond timestamps when READY items have no publication date", async () => {
      for (let index = 1; index <= 3; index++) {
        const id = `00000000-0000-4000-8000-00000000200${index}`;
        await dbHandle.client`
          INSERT INTO media (id, type, title, slug, status, created_at)
          VALUES (${id}::uuid, 'VIDEO', ${`Microsecond batch ${index}`}, ${`microsecond-${index}`}, 'READY', ${"2026-11-06 10:00:00.123456+00"}::timestamptz)
        `;
      }
      const first = await app.inject({ method: "GET", url: "/v1/search?q=Microsecond&limit=2" });
      expect(first.statusCode).toBe(200);
      const page = JSON.parse(first.body);
      expect(page.items).toHaveLength(2);
      expect(page.hasMore).toBe(true);
      const second = await app.inject({
        method: "GET",
        url: `/v1/search?q=Microsecond&limit=2&cursor=${encodeURIComponent(page.nextCursor)}`,
      });
      expect(second.statusCode).toBe(200);
      const last = JSON.parse(second.body);
      expect(last.items).toHaveLength(1);
      expect(last.hasMore).toBe(false);
      expect(
        new Set([...page.items, ...last.items].map((item: { id: string }) => item.id)).size,
      ).toBe(3);
    });

    it("searches media items by title substring (case-insensitive)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/search?q=tRaCk%20NuMbEr",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items[0].title).toMatch(/Track Number/i);
    });

    it("searches media items by associated artist name", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/search?q=Starlight",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items[0].title).toBe("Track Number 01");
    });

    it("filters exact classification labels while preserving keyset pagination", async () => {
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({
          q: "Track Number",
          classification: "genre-rock",
          limit: "2",
        });
        if (cursor) query.set("cursor", cursor);
        const response = await app.inject({ method: "GET", url: `/v1/search?${query}` });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(
          body.items.every((item: { classificationLabels: string[] }) =>
            item.classificationLabels.includes("genre-rock"),
          ),
        ).toBe(true);
        ids.push(...body.items.map((item: { id: string }) => item.id));
        cursor = body.nextCursor;
      } while (cursor);

      expect(ids.length).toBeGreaterThan(1);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(draftMediaId);
    });
  });

  describe("Classification filter (GET /v1/media)", () => {
    it("returns labels and filters exact labels without duplicate cursor pages", async () => {
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ classification: "genre-rock", limit: "2" });
        if (cursor) query.set("cursor", cursor);
        const response = await app.inject({ method: "GET", url: `/v1/media?${query}` });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(
          body.items.every((item: { classificationLabels: string[] }) =>
            item.classificationLabels.includes("genre-rock"),
          ),
        ).toBe(true);
        ids.push(...body.items.map((item: { id: string }) => item.id));
        cursor = body.nextCursor;
      } while (cursor);

      expect(ids.length).toBeGreaterThan(1);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(draftMediaId);
    });
  });
});
