import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { type DatabaseHandle, createDatabase, runMigrations } from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.module.js";

describe("Auth Endpoints & Token Lifecycle Integration Tests", () => {
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

  function extractCookie(res: { headers: Record<string, unknown> }): string {
    const raw = res.headers["set-cookie"];
    if (Array.isArray(raw)) {
      return raw.join("; ");
    }
    return typeof raw === "string" ? raw : "";
  }

  describe("Registration & Login", () => {
    it("POST /v1/auth/register creates user, returns access token, and sets httpOnly cookie", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "NewUser@example.com",
          password: "StrongPassword123",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.accessToken).toBeDefined();
      expect(body.user.email).toBe("newuser@example.com");
      expect(body.user.role).toBe("USER");

      const cookie = extractCookie(res);
      expect(cookie).toContain("refresh_token=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Path=/v1/auth");
    });

    it("POST /v1/auth/login authenticates with valid credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          email: "newuser@example.com",
          password: "StrongPassword123",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.accessToken).toBeDefined();
      expect(body.user.email).toBe("newuser@example.com");

      const cookie = extractCookie(res);
      expect(cookie).toContain("refresh_token=");
      expect(cookie).toContain("HttpOnly");
    });

    it("POST /v1/auth/login rejects wrong password with 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          email: "newuser@example.com",
          password: "IncorrectPassword999",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/invalid email or password/i);
    });
  });

  describe("Token Rotation & Reuse Detection", () => {
    it("rotates refresh token and returns new cookie on /v1/auth/refresh", async () => {
      // 1. Login to obtain cookie1
      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          email: "newuser@example.com",
          password: "StrongPassword123",
        },
      });
      const cookie1 = extractCookie(loginRes);

      // 2. Call /refresh with cookie1
      const refreshRes = await app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        headers: {
          cookie: cookie1,
        },
      });

      expect(refreshRes.statusCode).toBe(200);
      const refreshBody = JSON.parse(refreshRes.body);
      expect(refreshBody.accessToken).toBeDefined();

      const cookie2 = extractCookie(refreshRes);
      expect(cookie2).toContain("refresh_token=");
      expect(cookie2).not.toBe(cookie1);
    });

    it("detects token reuse, revokes all sessions for user, and returns 401", async () => {
      // 1. Login to obtain cookie1
      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          email: "newuser@example.com",
          password: "StrongPassword123",
        },
      });
      const cookie1 = extractCookie(loginRes);

      // 2. Normal rotation: cookie1 -> cookie2
      const refreshRes = await app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        headers: {
          cookie: cookie1,
        },
      });
      expect(refreshRes.statusCode).toBe(200);
      const cookie2 = extractCookie(refreshRes);

      // 3. Attack / Replay: Attacker presents the already revoked cookie1!
      const replayRes = await app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        headers: {
          cookie: cookie1,
        },
      });

      expect(replayRes.statusCode).toBe(401);

      // 4. Verification of Reuse Defense: cookie2 must now ALSO be revoked!
      const subsequentRes = await app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        headers: {
          cookie: cookie2,
        },
      });

      expect(subsequentRes.statusCode).toBe(401);
    });

    it("POST /v1/auth/logout revokes session and clears cookie", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          email: "newuser@example.com",
          password: "StrongPassword123",
        },
      });
      const cookie = extractCookie(loginRes);

      const logoutRes = await app.inject({
        method: "POST",
        url: "/v1/auth/logout",
        headers: {
          cookie,
        },
      });

      expect(logoutRes.statusCode).toBe(200);
      const clearCookie = extractCookie(logoutRes);
      expect(clearCookie).toMatch(/refresh_token=;|Max-Age=0|expires=/i);

      // Session should no longer be refreshable
      const refreshRes = await app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        headers: {
          cookie,
        },
      });
      expect(refreshRes.statusCode).toBe(401);
    });
  });

  describe("Experiment 1: Registration Concurrency Race Condition", () => {
    it("handles concurrent duplicate registrations: 1 succeeds (201), 1 fails with 409 Conflict", async () => {
      const raceEmail = "race_condition@example.com";
      const payload = {
        email: raceEmail,
        password: "RacePassword123",
      };

      // Send 2 registration requests simultaneously
      const [res1, res2] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/v1/auth/register",
          payload,
        }),
        app.inject({
          method: "POST",
          url: "/v1/auth/register",
          payload,
        }),
      ]);

      const statusCodes = [res1.statusCode, res2.statusCode].sort();
      expect(statusCodes).toEqual([201, 409]);

      // Exactly 1 user exists in DB
      const usersInDb = await dbHandle.client`
        SELECT id, email FROM users WHERE email = ${raceEmail}
      `;
      expect(usersInDb).toHaveLength(1);
    });
  });
});
