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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.module.js";
import { type TestRedisInstance, startTestRedis } from "./redis-test-helper.js";

describe("Redis Cache-Aside & Invalidation Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let testRedis: TestRedisInstance;
  let dbHandle: DatabaseHandle;
  let app: NestFastifyApplication;

  const jwtSecret = "super-secret-jwt-key-with-at-least-32-chars!!";
  let adminToken: string;
  let sampleMediaId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    testRedis = await startTestRedis();
    await runMigrations(testDb.databaseUrl);
    dbHandle = createDatabase(testDb.databaseUrl);

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

    // Create a sample media item
    const [media] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Cached Original Title",
        slug: "cached-original-slug",
        status: "READY",
        durationMs: 360000,
        publishedAt: new Date(),
      })
      .returning();
    sampleMediaId = media.id;
  }, 25000);

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
    if (testRedis) {
      await testRedis.cleanup();
    }
  });

  describe("Cache-Aside Hit vs. Miss & Active Invalidation", () => {
    it("first request misses cache and populates it; second request hits cache without DB query", async () => {
      // 1. First request -> Misses cache, reads DB
      const res1 = await app.inject({
        method: "GET",
        url: `/v1/media/${sampleMediaId}`,
      });
      expect(res1.statusCode).toBe(200);
      const body1 = JSON.parse(res1.body);
      expect(body1.title).toBe("Cached Original Title");

      // 2. Spy on database client query
      const dbSpy = vi.spyOn(dbHandle.db, "select");

      // 3. Second request -> Must be served from Redis cache (0 DB calls!)
      const res2 = await app.inject({
        method: "GET",
        url: `/v1/media/${sampleMediaId}`,
      });
      expect(res2.statusCode).toBe(200);
      const body2 = JSON.parse(res2.body);
      expect(body2.title).toBe("Cached Original Title");

      // Database select should NOT be called on cache hit!
      expect(dbSpy).not.toHaveBeenCalled();
      dbSpy.mockRestore();
    });

    it("admin updates media title -> invalidates cache -> next request returns fresh data", async () => {
      // 1. Admin updates title
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/media/${sampleMediaId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          title: "Fresh Updated Title",
        },
      });
      expect(patchRes.statusCode).toBe(200);

      // 2. Query detail immediately -> must return updated title (NO stale read!)
      const getRes = await app.inject({
        method: "GET",
        url: `/v1/media/${sampleMediaId}`,
      });
      expect(getRes.statusCode).toBe(200);
      const body = JSON.parse(getRes.body);
      expect(body.title).toBe("Fresh Updated Title");
    });
  });

  describe("Fail-Open Resilience During Redis Outage", () => {
    it("serves catalog and detail from PostgreSQL when Redis is unreachable", async () => {
      // Build separate API app pointing to unreachable Redis port
      const failOpenApp = await buildApp(
        {
          NODE_ENV: "test",
          PORT: 3000,
          DATABASE_URL: testDb.databaseUrl,
          JWT_SECRET: jwtSecret,
          REDIS_URL: "redis://127.0.0.1:63799", // Unreachable!
          CACHE_TTL_SECONDS: 60,
        },
        dbHandle,
      );
      await failOpenApp.init();
      await failOpenApp.getHttpAdapter().getInstance().ready();

      try {
        // Catalog endpoint remains available
        const catalogRes = await failOpenApp.inject({
          method: "GET",
          url: "/v1/media?limit=10",
        });
        expect(catalogRes.statusCode).toBe(200);
        const catalogBody = JSON.parse(catalogRes.body);
        expect(catalogBody.items.length).toBeGreaterThan(0);

        // Detail endpoint remains available
        const detailRes = await failOpenApp.inject({
          method: "GET",
          url: `/v1/media/${sampleMediaId}`,
        });
        expect(detailRes.statusCode).toBe(200);
        const detailBody = JSON.parse(detailRes.body);
        expect(detailBody.id).toBe(sampleMediaId);
        expect(detailBody.title).toBe("Fresh Updated Title");
      } finally {
        await failOpenApp.close();
      }
    });
  });

  describe("Cache Stampede Defense", () => {
    it("100 concurrent cache misses execute database loader exactly once via Singleflight", async () => {
      // Create a new media item whose detail has never been cached
      const [hotMedia] = await dbHandle.db
        .insert(mediaTable)
        .values({
          type: "VIDEO",
          title: "Viral Hot Video",
          slug: "viral-hot-video",
          status: "READY",
          durationMs: 720000,
          publishedAt: new Date(),
        })
        .returning();

      // Spy on database select builder
      const dbSelectSpy = vi.spyOn(dbHandle.db, "select");

      // Launch 100 simultaneous requests on an uncached key!
      const requests = Array.from({ length: 100 }, () =>
        app.inject({
          method: "GET",
          url: `/v1/media/${hotMedia.id}`,
        }),
      );

      const responses = await Promise.all(requests);

      // All 100 requests succeed with identical data
      expect(responses).toHaveLength(100);
      expect(responses.every((r) => r.statusCode === 200)).toBe(true);
      const bodies = responses.map((r) => JSON.parse(r.body));
      expect(bodies.every((b) => b.id === hotMedia.id && b.title === "Viral Hot Video")).toBe(true);

      // The DB select method may be called multiple times by getMediaDetail's joins,
      // but it should only execute for exactly ONE request, not 100.
      // getMediaDetail performs: media select + album select (if any) + artists select
      // Here no album, so expected select call count <= 2 for the single loader.
      expect(dbSelectSpy.mock.calls.length).toBeLessThanOrEqual(2);

      dbSelectSpy.mockRestore();
    });
  });
});
