import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  type DatabaseHandle,
  createDatabase,
  mediaTable,
  runMigrations,
  runSeed,
} from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.module.js";

describe("API bootstrap, health and request logging integration tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await runMigrations(testDb.databaseUrl);
    await runSeed(testDb.databaseUrl);
    dbHandle = createDatabase(testDb.databaseUrl);

    app = await buildApp(
      {
        NODE_ENV: "test",
        PORT: 3000,
        DATABASE_URL: testDb.databaseUrl,
      },
      dbHandle,
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
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

  describe("Request ID propagation", () => {
    it("generates a new UUID request ID if no header provided", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health/live",
      });

      expect(response.statusCode).toBe(200);
      const reqId = response.headers["x-request-id"];
      expect(reqId).toBeDefined();
      expect(reqId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("round-trips valid bounded request ID", async () => {
      const customId = "trace-req_12345-abc";
      const response = await app.inject({
        method: "GET",
        url: "/health/live",
        headers: {
          "x-request-id": customId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-request-id"]).toBe(customId);
    });

    it("replaces overlong request ID with clean UUID", async () => {
      const overlongId = "x".repeat(100);
      const response = await app.inject({
        method: "GET",
        url: "/health/live",
        headers: {
          "x-request-id": overlongId,
        },
      });

      expect(response.statusCode).toBe(200);
      const reqId = response.headers["x-request-id"] as string;
      expect(reqId).not.toBe(overlongId);
      expect(reqId.length).toBe(36);
    });
  });

  describe("Health endpoints", () => {
    it("GET /health/live returns 200 without touching database", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health/live",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
      expect(typeof body.uptime).toBe("number");
    });

    it("GET /v1/health/live returns 404 because operational routes are not under /v1", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/health/live",
      });

      expect(response.statusCode).toBe(404);
    });

    it("GET /health/ready returns 200 when database is healthy", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health/ready",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        status: "ready",
        db: "connected",
      });
    });

    it("GET /health/ready returns 503 without leaking credentials when database fails", async () => {
      const brokenHandle = createDatabase(
        "postgres://secret_user:secret_pass@127.0.0.1:54399/streamflow_dummy",
      );
      const brokenApp = await buildApp(
        {
          NODE_ENV: "test",
          PORT: 3000,
          DATABASE_URL: "postgres://secret_user:secret_pass@127.0.0.1:54399/streamflow_dummy",
        },
        brokenHandle,
      );
      await brokenApp.init();
      await brokenApp.getHttpAdapter().getInstance().ready();

      try {
        const response = await brokenApp.inject({
          method: "GET",
          url: "/health/ready",
        });

        expect(response.statusCode).toBe(503);
        const body = JSON.parse(response.body);
        expect(body).toEqual({
          status: "degraded",
          db: "disconnected",
        });

        expect(response.body).not.toContain("secret_pass");
        expect(response.body).not.toContain("secret_user");

        const livenessResponse = await brokenApp.inject({
          method: "GET",
          url: "/health/live",
        });
        expect(livenessResponse.statusCode).toBe(200);
      } finally {
        await brokenApp.close();
        await brokenHandle.close();
      }
    });
  });

  describe("Catalog endpoint GET /v1/media", () => {
    it("returns seeded READY media items ordered created_at DESC, id DESC", async () => {
      // Add a DRAFT item to DB
      await dbHandle.db.insert(mediaTable).values({
        type: "VIDEO",
        title: "Draft Secret Video",
        slug: "draft-secret-video",
        status: "DRAFT",
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/media",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("items");
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBe(10); // 10 seeded READY items, draft excluded

      // Verify no draft item leaked
      expect(body.items.some((i: { slug: string }) => i.slug === "draft-secret-video")).toBe(false);

      // Verify item properties match public contract (no status, no timestamps)
      const first = body.items[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("type");
      expect(first).toHaveProperty("title");
      expect(first).toHaveProperty("slug");
      expect(first.status).toBeUndefined();
      expect(first.createdAt).toBeUndefined();
    });

    it("filters by type=AUDIO or type=VIDEO", async () => {
      const audioRes = await app.inject({
        method: "GET",
        url: "/v1/media?type=AUDIO",
      });
      expect(audioRes.statusCode).toBe(200);
      const audioBody = JSON.parse(audioRes.body);
      expect(audioBody.items.length).toBe(5);
      expect(audioBody.items.every((i: { type: string }) => i.type === "AUDIO")).toBe(true);

      const videoRes = await app.inject({
        method: "GET",
        url: "/v1/media?type=VIDEO",
      });
      expect(videoRes.statusCode).toBe(200);
      const videoBody = JSON.parse(videoRes.body);
      expect(videoBody.items.length).toBe(5);
      expect(videoBody.items.every((i: { type: string }) => i.type === "VIDEO")).toBe(true);
    });

    it("respects limit parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/media?limit=3",
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items.length).toBe(3);
    });

    it("returns 400 for invalid query parameters", async () => {
      const invalidType = await app.inject({
        method: "GET",
        url: "/v1/media?type=PODCAST",
      });
      expect(invalidType.statusCode).toBe(400);

      const invalidLimitZero = await app.inject({
        method: "GET",
        url: "/v1/media?limit=0",
      });
      expect(invalidLimitZero.statusCode).toBe(400);

      const invalidLimitOver = await app.inject({
        method: "GET",
        url: "/v1/media?limit=51",
      });
      expect(invalidLimitOver.statusCode).toBe(400);
    });

    it("returns 503 without leaking SQL details when database fails", async () => {
      const brokenHandle = createDatabase("postgres://127.0.0.1:54399/streamflow_dummy");
      const brokenApp = await buildApp(
        {
          NODE_ENV: "test",
          PORT: 3000,
          DATABASE_URL: "postgres://127.0.0.1:54399/streamflow_dummy",
        },
        brokenHandle,
      );
      await brokenApp.init();
      await brokenApp.getHttpAdapter().getInstance().ready();

      try {
        const response = await brokenApp.inject({
          method: "GET",
          url: "/v1/media",
        });

        expect(response.statusCode).toBe(503);
        const body = JSON.parse(response.body);
        expect(body.message).toMatch(/unavailable/i);
        expect(response.body).not.toContain("SELECT");
      } finally {
        await brokenApp.close();
        await brokenHandle.close();
      }
    });
  });

  describe("Experiments endpoint GET /test/cpu-block", () => {
    it("is available in test/development mode and returns blocked status", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/test/cpu-block",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("blocked");
      expect(body.durationMs).toBeGreaterThanOrEqual(500);
    });

    it("returns 404 in production environment", async () => {
      const prodApp = await buildApp(
        {
          NODE_ENV: "production",
          PORT: 3000,
          DATABASE_URL: testDb.databaseUrl,
        },
        dbHandle,
      );
      await prodApp.init();
      await prodApp.getHttpAdapter().getInstance().ready();

      try {
        const response = await prodApp.inject({
          method: "GET",
          url: "/test/cpu-block",
        });

        expect(response.statusCode).toBe(404);
      } finally {
        await prodApp.close();
      }
    });
  });
});
