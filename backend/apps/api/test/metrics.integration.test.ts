import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { type DatabaseHandle, createDatabase, runMigrations } from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.module.js";
import { type TestRedisInstance, startTestRedis } from "./redis-test-helper.js";

describe("Prometheus Metrics Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let testRedis: TestRedisInstance;
  let dbHandle: DatabaseHandle;
  let app: NestFastifyApplication;

  const jwtSecret = "super-secret-jwt-key-with-at-least-32-chars!!";

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await runMigrations(testDb.databaseUrl);
    dbHandle = createDatabase(testDb.databaseUrl);
    testRedis = await startTestRedis();

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
  }, 20000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbHandle) await dbHandle.close();
    if (testRedis) await testRedis.cleanup();
    if (testDb) await testDb.cleanup();
  });

  it("serves GET /metrics in standard Prometheus text format with RED and USE signals", async () => {
    // Generate traffic: success, parameterized route, and 404 error
    await app.inject({ method: "GET", url: "/health/live" });
    await app.inject({ method: "GET", url: "/v1/media" });
    await app.inject({ method: "GET", url: "/v1/media/11111111-1111-1111-1111-111111111111" });
    await app.inject({ method: "GET", url: "/non-existent-route-for-metrics" });

    // Scrape metrics
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");

    const body = res.body;

    // RED signals
    expect(body).toContain("# HELP http_requests_total");
    expect(body).toContain("# TYPE http_requests_total counter");
    expect(body).toContain('status="200"');
    expect(body).toContain('status="404"'); // Verifies errors are captured!

    expect(body).toContain("# HELP http_request_duration_seconds");
    expect(body).toContain("# TYPE http_request_duration_seconds histogram");
    expect(body).toContain('le="+Inf"');
    expect(body).toContain("http_request_duration_seconds_sum");
    expect(body).toContain("http_request_duration_seconds_count");

    // USE signals
    expect(body).toContain("# HELP db_pool_connections_active");
    expect(body).toContain("# TYPE db_pool_connections_active gauge");
    expect(body).toContain("db_pool_connections_active");
    expect(body).toContain("db_pool_connections_idle");
    expect(body).toContain("transcode_queue_waiting_jobs");
    expect(body).toContain("outbox_events_pending_count");
  });
});
