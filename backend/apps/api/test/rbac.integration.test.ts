import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { type DatabaseHandle, createDatabase, runMigrations } from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.module.js";

describe("RBAC & Guards Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;
  let app: NestFastifyApplication;

  const jwtSecret = "super-secret-jwt-key-with-at-least-32-chars!!";

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

  function createTestToken(payload: {
    sub: string;
    email: string;
    role: "USER" | "ADMIN";
  }): string {
    return jwt.sign(payload, jwtSecret, { expiresIn: "15m" });
  }

  describe("AuthGuard on /v1/auth/me", () => {
    it("rejects request without Authorization header with 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects request with invalid token with 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
        headers: {
          authorization: "Bearer invalid.jwt.token",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("accepts valid token and returns user profile", async () => {
      // First create a user in db
      const [user] = await dbHandle.client`
        INSERT INTO users (email, password_hash, role)
        VALUES ('me_user@example.com', 'dummy_hash', 'USER')
        RETURNING id, email, role
      `;

      const token = createTestToken({
        sub: user.id as string,
        email: user.email as string,
        role: user.role as "USER",
      });

      const res = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(user.id);
      expect(body.email).toBe("me_user@example.com");
      expect(body.role).toBe("USER");
    });
  });

  describe("Public Routes Bypass", () => {
    it("allows access to public endpoints without any token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/health/live",
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe("RolesGuard on Protected Routes", () => {
    it("rejects non-admin user with 403 Forbidden on @Roles('ADMIN') route", async () => {
      const userToken = createTestToken({
        sub: "user-uuid",
        email: "regular@example.com",
        role: "USER",
      });

      const res = await app.inject({
        method: "GET",
        url: "/test/admin-only",
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/insufficient permissions/i);
    });

    it("allows admin user with 200 OK on @Roles('ADMIN') route", async () => {
      const adminToken = createTestToken({
        sub: "admin-uuid",
        email: "superadmin@example.com",
        role: "ADMIN",
      });

      const res = await app.inject({
        method: "GET",
        url: "/test/admin-only",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("admin-ok");
    });

    it("rejects unauthenticated request with 401 Unauthorized on @Roles('ADMIN') route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/test/admin-only",
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
