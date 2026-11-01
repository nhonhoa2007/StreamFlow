# Postmortem 001: Redis Cache Outage & Fail-Open Degradation

- **Incident Date:** 2026-11-01
- **Severity:** SEV-3 (Degraded Latency, Zero Availability Loss)
- **Status:** Resolved / Postmortem Complete
- **Lead Responders:** StreamFlow Core SRE Team

---

## 1. Summary

At 14:15 UTC, the Redis caching node experienced an unexpected OOM kill during kernel memory pressure. StreamFlow API servers were unable to reach Redis on port 6379. Due to the fail-open architecture implemented in `@streamflow/cache`, all API requests automatically bypassed the cache and queried PostgreSQL directly. Client requests succeeded with 100% availability (0 5xx errors), while p95 latency increased from 0.4ms to 580ms during the 15-minute outage.

---

## 2. Trigger

A background memory leak in an experimental Redis module consumed all host cgroup memory, triggering the Linux kernel OOM killer against PID 1 in the Redis container.

---

## 3. Timeline

- **14:15:00 UTC** — Redis container killed by OS kernel OOM killer (`exit code 137`).
- **14:15:02 UTC** — API connection pool logged `ECONNREFUSED 127.0.0.1:6379`.
- **14:15:05 UTC** — Fail-open fallback activated: `getOrSetWithSingleflight` caught Redis connection errors and immediately executed direct database loaders.
- **14:20:05 UTC** — Prometheus alert `HighP95Latency` fired after p95 latency exceeded 500ms for 5 consecutive minutes (measured at 580ms).
- **14:21:00 UTC** — On-call engineer paged, verified Redis offline, confirmed API `/health/ready` reporting 200 OK via PostgreSQL fallback.
- **14:27:00 UTC** — Redis container restarted with adjusted memory limits (`maxmemory 512mb` and `allkeys-lru`).
- **14:30:00 UTC** — Cache connections re-established; p95 latency returned to baseline 0.4ms. Incident closed.

---

## 4. Detection

Detected by Prometheus alert `HighP95Latency` (`p95 > 500ms for 5m`) and automated log alerts on `ECONNREFUSED`.

---

## 5. Impact

- **User Availability:** 100% (zero HTTP 500/502 errors).
- **Latency Impact:** Catalog latency increased from ~0.2ms to ~580ms as queries hit PostgreSQL directly.
- **Database Load:** PostgreSQL CPU utilization rose from 8% to 32% during the outage, within safe operational headroom.

---

## 6. Root Cause

The Redis instance had no explicit `maxmemory` cap configured in Docker Compose, allowing key allocations to grow until triggering the Linux OOM killer.

---

## 7. Corrective Actions

1. [Completed] Configured `maxmemory 512mb` and `maxmemory-policy allkeys-lru` in Redis configuration.
2. [Completed] Verified that all cache methods wrap Redis operations in try/catch and fail-open gracefully to PostgreSQL.
3. [Completed] Added Prometheus alert for Redis connectivity status.
