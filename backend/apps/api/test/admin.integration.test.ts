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

describe("Admin Media Management Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;
  let app: NestFastifyApplication;

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

    // Create test user and admin tokens
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

  describe("POST /v1/admin/media", () => {
    const validPayload = {
      type: "VIDEO",
      title: "Admin Test Film",
      slug: "admin-test-film",
      durationMs: 450000,
    };

    it("rejects unauthenticated request with 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/media",
        payload: validPayload,
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects USER role with 403 Forbidden", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/media",
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(403);
    });

    it("creates media item as DRAFT with ADMIN role", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/media",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.title).toBe("Admin Test Film");
      expect(body.status).toBe("DRAFT");
    });
  });

  describe("GET /v1/admin/media", () => {
    it("lists all media items including DRAFT items for ADMIN", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/media",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(
        body.some(
          (item: { slug: string; status: string }) =>
            item.slug === "admin-test-film" && item.status === "DRAFT",
        ),
      ).toBe(true);
    });
  });

  describe("PATCH /v1/admin/media/:id", () => {
    it("updates media status to READY and sets published_at timestamp", async () => {
      const [media] = await dbHandle.client`
        SELECT id FROM media WHERE slug = 'admin-test-film'
      `;

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/admin/media/${media.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          status: "READY",
          title: "Admin Test Film (Published)",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("READY");
      expect(body.title).toBe("Admin Test Film (Published)");

      // Check DB published_at is set
      const [dbMedia] = await dbHandle.client`
        SELECT published_at FROM media WHERE id = ${media.id}::uuid
      `;
      expect(dbMedia.published_at).not.toBeNull();
    });
  });

  describe("DELETE /v1/admin/media/:id", () => {
    it("deletes media item with ADMIN role", async () => {
      const [media] = await dbHandle.client`
        SELECT id FROM media WHERE slug = 'admin-test-film'
      `;

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/media/${media.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("deleted");

      const inDb = await dbHandle.client`
        SELECT id FROM media WHERE id = ${media.id}::uuid
      `;
      expect(inDb).toHaveLength(0);
    });
  });
});
