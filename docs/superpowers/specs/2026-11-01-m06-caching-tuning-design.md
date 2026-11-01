# Milestone 06 Specification: Database Tuning, Redis Caching & Cache Stampede Defense

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M06 (Weeks 11–12)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 06 addresses database read scalability, latency optimization, and memory tiering using **Redis** and the **Cache-Aside Pattern**:
1. **Cache-Aside Pattern (`backend/packages/cache`):**
   - High-performance caching layer powered by `ioredis`.
   - Caching media catalog listings (`media:catalog:*`) and detailed media records (`media:detail:*`).
   - Active cache invalidation on administrative mutations (create, update, publish, delete).
2. **Cache Stampede & Thundering Herd Defense:**
   - **TTL with Jitter:** Adding deterministic/pseudo-random jitter (±15%) to base TTLs (e.g., 60s ± 10s) to prevent simultaneous mass-expiration of hot keys.
   - **Singleflight In-Flight Deduplication:** When a cache miss occurs under high concurrency (e.g. 100 simultaneous requests for the same uncached item), an in-memory lock/promise coalescer ensures **exactly 1 query hits PostgreSQL**, and all 99 waiting requests receive the coalesced result.
3. **Graceful Degradation (Fail-Open Resilience):**
   - If Redis crashes, restarts, or times out, the API gracefully falls back to querying PostgreSQL directly without raising 500 errors to clients.
4. **Educational Benchmarks & Experiments:**
   - Experiment 1: Measuring p50/p95/p99 latency, DB queries, and throughput between Cache Hit vs. Cache Miss.
   - Experiment 2: Cache stampede simulation proving 100 concurrent misses trigger only 1 database query.
   - Experiment 3: Redis failure simulation proving zero API downtime during cache outage.
5. **Architecture Decision Record (ADR-006):** Cache-Aside Strategy, Invalidation, and Stampede Mitigation.

---

## 2. Infrastructure & Configuration

- **Docker Compose:** Added `redis` service (image: `redis:7-alpine`, port: `6379:6379`).
- **Configuration (`backend/packages/config`):**
  - `REDIS_URL`: `z.string().url().default("redis://127.0.0.1:6379")`.
  - `CACHE_TTL_SECONDS`: `z.coerce.number().int().positive().default(60)`.
  - `CACHE_ENABLED`: `z.coerce.boolean().default(true)`.

---

## 3. Cache Package Architecture (`@streamflow/cache`)

Exported functions:
1. `createCacheClient(redisUrl: string): CacheHandle`
   - Provides `{ redis, get, set, del, deleteByPattern, getOrSetWithSingleflight, checkHealth, close }`.
2. `getOrSetWithSingleflight<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>`:
   - 1. Check Redis cache. If hit -> return deserialized JSON.
   - 2. If miss -> check in-memory flight registry for key:
        - If promise exists -> await existing in-flight promise.
        - If not -> initiate loader promise, register in flight map, execute DB query, store in Redis with jittered TTL, delete from flight map, return result.
3. Invalidation patterns:
   - When admin updates media ID: `del("media:detail:" + id)` and `deleteByPattern("media:catalog:*")`.

---

## 4. API Integration (`backend/apps/api`)

1. `CacheModule` registered as a global or feature module in `AppModule`.
2. `MediaService` uses `cache.getOrSetWithSingleflight` for:
   - `list(query)` -> key `media:catalog:${type}:${limit}:${cursor}`
   - `getDetail(id)` -> key `media:detail:${id}`
3. `AdminService` calls invalidation on `update`, `delete`, and `create`.

---

## 5. Definition of Done
1. `@streamflow/cache` package created with ioredis, singleflight coalescing, and TTL jitter.
2. Redis service added to Compose and tested with real Redis instance.
3. Cache-aside implemented on catalog and detail queries with active invalidation on admin edits.
4. Fail-open behavior verified: stopping Redis allows API to continue serving from DB without errors.
5. Stampede defense verified: 100 concurrent misses on same key produce exactly 1 DB query.
6. Benchmark runner measures and documents latency improvements in `docs/experiments/006-cache-aside-and-stampede.md`.
7. ADR-006 documented and committed.
8. 100% tests passing, clean Biome, clean Typecheck, clean build.
