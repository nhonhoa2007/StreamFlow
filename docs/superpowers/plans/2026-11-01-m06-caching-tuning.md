# StreamFlow M06 Database Tuning, Redis Caching & Cache Stampede Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Redis Cache-Aside for media catalog and detail queries with TTL jitter, active cache invalidation on admin edits, Singleflight in-flight deduplication to defeat Cache Stampede, and fail-open graceful degradation during cache outages.

**Architecture:** Create `backend/packages/cache` (`@streamflow/cache`) wrapping `ioredis`. Implement `getOrSetWithSingleflight` which provides in-memory request coalescing during cache misses so 100 concurrent requests trigger only 1 database query. Integrate cache into `MediaService` (`media:catalog:*` and `media:detail:*`) and invalidation into `AdminService`. The system operates fail-open: Redis connection failure logs a warning and falls back to querying PostgreSQL directly.

**Tech Stack:** Redis 7 / ioredis, NestJS 11, Fastify, Drizzle ORM, PostgreSQL 16, Vitest, Testcontainers, Biome.

**Spec:** `docs/superpowers/specs/2026-11-01-m06-caching-tuning-design.md`

## Global Constraints

- Cache misses under concurrency must be coalesced via Singleflight (in-flight promise map) so that identical concurrent queries result in exactly 1 underlying loader invocation.
- All cached keys must include a TTL with jitter (±15% pseudo-random) to prevent simultaneous expiration stampedes.
- If Redis is unreachable, offline, or returns an error, cache methods must fail-open (execute the loader query directly) without crashing the application or returning 500 errors to clients.
- Admin mutations (create, update, publish, delete) must actively invalidate matching cache keys (`media:detail:${id}` and `media:catalog:*`).
- Commits use Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. 100 concurrent requests for an uncached item must execute the database query exactly once via Singleflight deduplication (Task 5).
2. Shutting down or disconnecting Redis must not cause any 500 Internal Server Error on cached endpoints (Task 4).
3. Updating or deleting a media item must immediately invalidate its cached detail and catalog entries (Task 3).
4. Cache keys must be properly namespaced and parameterized (e.g. `media:catalog:${type}:${limit}:${cursor}`) to prevent cross-query cache collisions (Task 2).
5. TTL values must be varied with jitter to prevent mass synchronized cache expirations (Task 2).

---

## File Map

- `infra/compose/compose.yaml`: Add Redis 7 container service.
- `backend/packages/config/src/index.ts`: Add `REDIS_URL`, `CACHE_TTL_SECONDS`.
- `backend/packages/cache/package.json`: Cache package manifest.
- `backend/packages/cache/tsconfig.json`: Cache package TypeScript config.
- `backend/packages/cache/src/{cache-client,singleflight,index}.ts`: Core cache implementation.
- `backend/packages/cache/test/cache.test.ts`: Unit tests for singleflight and jitter.
- `backend/apps/api/src/cache/{cache.module,cache.service}.ts`: NestJS integration.
- `backend/apps/api/src/media/media.service.ts`: Cache-aside on catalog and detail.
- `backend/apps/api/src/admin/admin.service.ts`: Cache invalidation on mutations.
- `backend/apps/api/test/cache.integration.test.ts`: Tests for hit/miss, invalidation, stampede, and fail-open.
- `scripts/perf/run-cache-benchmark.mjs` & `docs/experiments/006-cache-aside-and-stampede.md`: Benchmark report.
- `docs/adr/006-cache-aside-and-stampede-mitigation.md`: ADR-006 documentation.

---

### Task 1: Infrastructure & Configuration

**Files:**
- Modify: `infra/compose/compose.yaml`
- Modify: `backend/packages/config/src/index.ts`
- Modify: `backend/packages/config/src/index.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing unit test for Redis config**
In `config/src/index.test.ts`, assert `REDIS_URL` defaults to `redis://127.0.0.1:6379` and `CACHE_TTL_SECONDS` defaults to 60.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/config test`
Expected: FAIL.

- [ ] **Step 3: Update config and compose.yaml**
Add `redis` container (image `redis:7-alpine`, ports `127.0.0.1:6379:6379`) to `compose.yaml`. Add `REDIS_URL` and `CACHE_TTL_SECONDS` to `config/src/index.ts`. Update `.env.example`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/config test`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add infra/compose/compose.yaml backend/packages/config/ .env.example
git commit -m "feat(config): add redis service to compose and cache environment settings"
```

---

### Task 2: Core Cache Package with Singleflight & Jitter

**Files:**
- Create: `backend/packages/cache/package.json`
- Create: `backend/packages/cache/tsconfig.json`
- Create: `backend/packages/cache/src/singleflight.ts`
- Create: `backend/packages/cache/src/cache-client.ts`
- Create: `backend/packages/cache/src/index.ts`
- Create: `backend/packages/cache/test/singleflight.test.ts`

- [ ] **Step 1: Write failing unit tests for Singleflight & TTL jitter**
In `singleflight.test.ts`:
1. Coalesces 50 concurrent calls to `run(key, fn)` so `fn` executes exactly once and all 50 resolve to the same result.
2. Subsequent calls after resolution execute `fn` again.
3. If `fn` rejects, all waiting calls receive the rejection.
4. Jitter calculator produces values within ±15% of base TTL.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/cache test`
Expected: FAIL.

- [ ] **Step 3: Implement Singleflight and CacheClient**
Add `ioredis` to `backend/packages/cache/package.json`. Implement in-memory `Singleflight` map and `createCacheClient` with fail-open error handling.

- [ ] **Step 4: Run tests and typecheck to verify success**
Run: `pnpm --filter @streamflow/cache test && pnpm --filter @streamflow/cache typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/cache/
git commit -m "feat(cache): implement singleflight deduplication and redis cache client"
```

---

### Task 3: Cache-Aside & Active Invalidation in API

**Files:**
- Create: `backend/apps/api/src/cache/cache.service.ts`
- Create: `backend/apps/api/src/cache/cache.module.ts`
- Modify: `backend/apps/api/src/app.module.ts`
- Modify: `backend/apps/api/src/media/media.service.ts`
- Modify: `backend/apps/api/src/admin/admin.service.ts`
- Modify: `backend/apps/api/package.json`
- Test: `backend/apps/api/test/cache.integration.test.ts`

- [ ] **Step 1: Write failing integration test for Cache-Aside & Invalidation**
In `cache.integration.test.ts`:
1. First query to `GET /v1/media/:id` hits DB and stores in cache.
2. Second query serves from cache without hitting DB.
3. Admin calls `PATCH /v1/admin/media/:id` with new title -> cache is invalidated.
4. Next query returns updated title immediately (no stale read).

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL.

- [ ] **Step 3: Implement CacheModule and integrate into MediaService and AdminService**
Connect `CacheService` in API, wrapping catalog and detail queries in `getOrSetWithSingleflight`, and calling invalidations on admin mutations.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/
git commit -m "feat(api): integrate cache-aside on catalog and active invalidation on admin edits"
```

---

### Task 4: Fail-Open Resilience (Redis Outage Simulation)

**Files:**
- Modify: `backend/apps/api/test/cache.integration.test.ts`
- Modify: `backend/packages/cache/src/cache-client.ts`

- [ ] **Step 1: Write failing test for Redis connection failure**
In `cache.integration.test.ts`, initialize API pointing to an unreachable Redis port (e.g. `63799`).
Query `GET /v1/media` and `GET /v1/media/:id`.
Assert: Returns 200 OK with correct data from PostgreSQL, 0 exceptions, and logs a warning.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL if cache errors are not caught.

- [ ] **Step 3: Ensure fail-open error handling in cache client**
Wrap all Redis calls in try/catch; on connection error or command timeout, immediately invoke loader fallback.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS with 100% graceful degradation.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/cache/ backend/apps/api/
git commit -m "feat(cache): ensure fail-open resilience and zero downtime during redis outages"
```

---

### Task 5: Cache Stampede Defense (100 Concurrent Misses)

**Files:**
- Modify: `backend/apps/api/test/cache.integration.test.ts`

- [ ] **Step 1: Write failing test for 100 concurrent cache misses**
In `cache.integration.test.ts`:
Spies on database query function.
Launches 100 concurrent requests via `Promise.all` for an uncached media item.
Assert: All 100 requests return 200 OK with identical data.
Assert: Database loader function was called **exactly 1 time**.

- [ ] **Step 2: Run test to verify failure / verify singleflight behavior**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 3: Commit**
Run:
```bash
git add backend/apps/api/test/cache.integration.test.ts
git commit -m "test(api): verify singleflight eliminates cache stampede under 100 concurrent misses"
```

---

### Task 6: Benchmark Runner, ADR-006 & Acceptance

**Files:**
- Create: `scripts/perf/run-cache-benchmark.mjs`
- Create: `docs/experiments/006-cache-aside-and-stampede.md`
- Create: `docs/adr/006-cache-aside-and-stampede-mitigation.md`
- Modify: `scripts/acceptance.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write failing acceptance test checking M06 deliverables**
In `scripts/acceptance.test.mjs`, assert `docs/adr/006-cache-aside-and-stampede-mitigation.md`, `docs/experiments/006-cache-aside-and-stampede.md`, and cache benchmark script exist.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement benchmark script, ADR-006, and update README**
Write `run-cache-benchmark.mjs` measuring latency, hit ratio, and stampede metrics. Write ADR-006 and experiment report. Update README.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All pass 100%.

- [ ] **Step 5: Commit**
Run:
```bash
git add .
git commit -m "docs: add m06 cache benchmark report, adr-006, and acceptance tests"
```
