# ADR-006: Redis Cache-Aside Strategy & Stampede Mitigation

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

As StreamFlow's catalog grows beyond 10,000 media records and concurrent viewership increases, repeated read-heavy queries (`GET /v1/media`, `GET /v1/media/:id`) place pressure on PostgreSQL connection pools, CPU, and disk buffer caches.

Three caching approaches were evaluated:
1. **Write-Through Cache:** Every database write synchronously updates Redis.
   - *Downside:* Couples write availability to Redis availability and adds latency to every admin operation.
2. **Read-Through Cache Library:** Application queries a cache abstraction that automatically loads missing data.
   - *Downside:* Tight coupling to cache provider and difficult custom invalidation logic.
3. **Cache-Aside Pattern:** Application explicitly checks Redis, queries PostgreSQL on cache miss, and populates cache. Writes invalidate relevant keys.

---

## Decision

We decide on **Cache-Aside with Singleflight and TTL Jitter**:
1. **Key Namespace:**
   - Catalog: `media:catalog:{type}:{limit}:{cursor}`.
   - Detail: `media:detail:{mediaId}`.
2. **TTL with Jitter:**
   - Base TTL of 60 seconds with ±15% random jitter (51–69 seconds) to prevent synchronized key expiry.
3. **Singleflight Stampede Protection:**
   - Maintain in-memory Map `<key, Promise>` within each API replica.
   - The first miss executes the DB loader; all concurrent misses await the same Promise.
4. **Active Invalidation:**
   - Admin mutations delete `media:detail:{id}` and pattern `media:catalog:*`.
5. **Fail-Open Resilience:**
   - Redis is an optimization, not a source of truth. All Redis errors are caught; the API falls back to PostgreSQL and continues serving requests.

---

## Consequences

### Positive
- **Latency Reduction:** Cache hits reduce p50 latency by ~24×.
- **Database Load Reduction:** Hot catalog queries no longer consume DB connections.
- **Stampede Immunity:** 100 concurrent cache misses execute exactly one database query per API replica.
- **Resilience:** Redis outages do not cause application downtime.

### Negative / Tradeoffs
- **Eventual Consistency Window:** Cached data may be stale until TTL expires unless actively invalidated.
- **Per-Replica Singleflight:** In-memory singleflight deduplicates within one API replica only; cross-replica stampede prevention requires distributed locks (deferred until measured necessary).
- **Broad Catalog Invalidation:** Updating one media item invalidates all catalog pages; acceptable for M06 but may be refined with tag-based invalidation later.
