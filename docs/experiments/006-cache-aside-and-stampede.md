# Experiment 006: Redis Cache-Aside, Stampede Defense & Fail-Open Resilience

- **Date:** 2026-11-01
- **Milestone:** M06 Database Tuning, Redis Caching & Load Testing
- **Environment:** Redis 7 / PostgreSQL 16 / Node.js API / ioredis 5.6
- **Source Script:** `scripts/perf/run-cache-benchmark.mjs`

---

## 1. Cache-Aside Latency Comparison

The catalog API uses the Cache-Aside pattern:
1. Check Redis first.
2. On cache hit -> return JSON data directly.
3. On miss -> query PostgreSQL, return result, then store in Redis with jittered TTL.

### Benchmark Results

| Scenario | Samples | p50 (ms) | p95 (ms) | p99 (ms) | Mean (ms) |
|---|---:|---:|---:|---:|---:|
| **Cache MISS (DB query)** | 50 | 5.45 | 7.12 | 9.03 | 5.83 |
| **Cache HIT (Redis)** | 1,000 | 0.18 | 0.42 | 0.76 | 0.24 |

**Result:** Redis cache hits reduce average catalog read latency by approximately **24×** compared to simulated PostgreSQL queries.

---

## 2. Cache Stampede / Thundering Herd Defense

### The Problem
When a hot cache key expires, hundreds of concurrent requests can hit the database simultaneously. Without protection, 1,000 users requesting the same media detail after TTL expiration produce 1,000 identical SQL queries.

### Singleflight Solution
StreamFlow keeps an in-memory map of in-flight Promises keyed by cache key:
- The first request executes the loader/query.
- All subsequent requests await the exact same Promise.
- When the Promise settles, the entry is removed.

### Experimental Evidence

| Concurrent Cache Misses | DB Loader Executions | Coalesced Requests | Invariant |
|---:|---:|---:|---|
| **100** | **1** | **99** | 100% protected |

---

## 3. Fail-Open Redis Outage Experiment

We intentionally configured the API with an unreachable Redis URL (`redis://127.0.0.1:63799`).

| Endpoint | Redis State | Response | Data Source |
|---|---|---|---|
| `GET /v1/media` | Offline | 200 OK | PostgreSQL fallback |
| `GET /v1/media/:id` | Offline | 200 OK | PostgreSQL fallback |

**Observation:** No 500 errors, no application crash, and zero downtime. Redis is treated as an optimization, never a correctness dependency.

---

## 4. TTL Jitter Strategy

Base TTL of 60 seconds is randomized by ±15% (51–69 seconds). This distributes expiration times and prevents synchronized mass-expiration of catalog keys.
