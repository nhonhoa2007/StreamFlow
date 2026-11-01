import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { type DatabaseHandle, createDatabase, runMigrations } from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.module.js";
import { type TestRedisInstance, startTestRedis } from "./redis-test-helper.js";

describe("Stateless Multi-Replica Authentication & Session Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let testRedis: TestRedisInstance;
  let dbHandle1: DatabaseHandle;
  let dbHandle2: DatabaseHandle;
  let app1: NestFastifyApplication;
  let app2: NestFastifyApplication;

  const jwtSecret = "super-secret-jwt-key-with-at-least-32-chars!!";
  const userEmail = `stateless-${Date.now()}@test.com`;
  const userPassword = "Password123!Secure";

  let accessToken1: string;
  let refreshCookie1: string;
  let accessToken2: string;
  let refreshCookie2: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await runMigrations(testDb.databaseUrl);
    dbHandle1 = createDatabase(testDb.databaseUrl);
    dbHandle2 = createDatabase(testDb.databaseUrl);
    testRedis = await startTestRedis();

    // Replica 1
    app1 = await buildApp(
      {
        NODE_ENV: "test",
        PORT: 3001,
        DATABASE_URL: testDb.databaseUrl,
        JWT_SECRET: jwtSecret,
        REDIS_URL: testRedis.redisUrl,
      },
      dbHandle1,
    );
    await app1.init();
    await app1.getHttpAdapter().getInstance().ready();

    // Replica 2
    app2 = await buildApp(
      {
        NODE_ENV: "test",
        PORT: 3002,
        DATABASE_URL: testDb.databaseUrl,
        JWT_SECRET: jwtSecret,
        REDIS_URL: testRedis.redisUrl,
      },
      dbHandle2,
    );
    await app2.init();
    await app2.getHttpAdapter().getInstance().ready();
  }, 25000);

  afterAll(async () => {
    if (app1) await app1.close();
    if (app2) await app2.close();
    if (dbHandle1) await dbHandle1.close();
    if (dbHandle2) await dbHandle2.close();
    if (testRedis) await testRedis.cleanup();
    if (testDb) await testDb.cleanup();
  });

  it("Step 1: Registers user on Replica 1 and obtains JWT token + cookie", async () => {
    const res = await app1.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: userEmail,
        password: userPassword,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeDefined();
    accessToken1 = body.accessToken;

    const cookieHeader = res.headers["set-cookie"];
    expect(cookieHeader).toBeDefined();
    refreshCookie1 = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader as string);
    expect(refreshCookie1).toContain("refresh_token=");
  });

  it("Step 2: Authenticates request on Replica 2 using Bearer token issued by Replica 1", async () => {
    const res = await app2.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${accessToken1}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe(userEmail);
  });

  it("Step 3: Rotates refresh token on Replica 2 using cookie issued by Replica 1", async () => {
    const cookieValue = refreshCookie1.split(";")[0];

    const res = await app2.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: {
        cookie: cookieValue,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeDefined();
    accessToken2 = body.accessToken;

    const cookieHeader = res.headers["set-cookie"];
    expect(cookieHeader).toBeDefined();
    refreshCookie2 = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader as string);
  });

  it("Step 4: Accesses profile on Replica 1 using rotated access token from Replica 2", async () => {
    const res = await app1.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${accessToken2}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe(userEmail);
  });

  it("Step 5: Revokes session on Replica 1; verifies session is immediately revoked on Replica 2", async () => {
    const cookieValue = refreshCookie2.split(";")[0];

    // Logout via Replica 1
    const logoutRes = await app1.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        cookie: cookieValue,
      },
    });
    expect(logoutRes.statusCode).toBe(200);

    // Attempt refresh via Replica 2 with revoked cookie
    const refreshRes = await app2.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: {
        cookie: cookieValue,
      },
    });
    expect(refreshRes.statusCode).toBe(401);
  });
});
