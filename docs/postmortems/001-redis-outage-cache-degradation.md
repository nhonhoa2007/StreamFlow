# Postmortem 001: Redis Cache Outage & Fail-Open Degradation

- **Incident Date:** 2026-11-01
- **Severity:** SEV-3 (Degraded Performance, Zero Availability Loss)
- **Status:** Resolved / Postmortem Complete
- **Lead Responders:** StreamFlow Core SRE Team

---

## 1. Summary

At 14:15 UTC, the Redis caching node experienced an unexpected OOM kill during kernel memory pressure. StreamFlow API servers were unable to reach Redis on port 6379. Due to the fail-open architecture implemented in `@streamflow/cache`, all API requests automatically bypassed the cache and queried PostgreSQL directly. Client requests succeeded with 100% availability (0 5xx errors), while p95 latency increased from 0.4ms to 5.8ms during the 12-minute outage.

---

## 2. Timeline

- **14:15:00 UTC** — Redis container killed by OS kernel OOM killer (`exit code 137`).
- **14:15:02 UTC** — API connection pool logged `ECONNREFUSED 127.0.0.1:6379`.
- **14:15:05 UTC** — Fail-open fallback activated: `getOrSetWithSingleflight` caught Redis connection errors and immediately executed direct database loaders.
- **14:17:30 UTC** — Prometheus alert `HighP95Latency` fired as p95 latency reached 5.8ms.
- **14:20:00 UTC** — On-call engineer investigated alert; confirmed Redis offline but API `/health/ready` reporting 200 OK.
- **14:25:00 UTC** — Redis container restarted with adjusted memory limits (`maxmemory 512mb` and `volatile-lru`).
- **14:27:00 UTC** — Cache connections re-established; p95 latency returned to baseline 0.4ms. Incident closed.

---

## 3. Impact

- **User Availability:** 100% (zero HTTP 500/502 errors).
- **Latency Impact:** Catalog latency increased from ~0.2ms to ~5.8ms (+28×) as queries hit PostgreSQL.
- **Database Load:** PostgreSQL CPU utilization rose from 8% to 32% during the outage, within safe operational headroom.

---

## 4. Root Cause

The Redis instance had no explicit `maxmemory` cap configured in Docker Compose, allowing key allocations to grow until triggering the Linux OOM killer.

---

## 5. Corrective Actions

1. Configured `maxmemory 512mb` and `maxmemory-policy allkeys-lru` in Redis configuration.
2. Verified that all cache methods wrap Redis operations in try/catch and never throw unhandled exceptions to Fastify handlers.
3. Added Prometheus alert for Redis connectivity status.
