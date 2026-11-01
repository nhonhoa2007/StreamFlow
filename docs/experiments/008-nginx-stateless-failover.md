# Experiment 008: NGINX Load Balancing, Stateless Failover & Zero-Downtime Resilience

- **Date:** 2026-11-01
- **Milestone:** M08 NGINX Load Balancing, Stateless API & First Deployment
- **Environment:** NGINX 1.25 / Node.js 22 / Fastify API / Linux
- **Source Script:** `scripts/perf/run-nginx-failover-experiment.mjs`

---

## 1. Executive Summary

Milestone 08 transitions StreamFlow from a single instance to a high-availability, multi-replica architecture fronted by an NGINX reverse proxy. This experiment verifies that:
1. Client traffic is evenly distributed across multiple API replicas via round-robin with keepalive pooling.
2. Sudden termination of an API replica produces **zero 5xx error responses** to clients due to NGINX's `proxy_next_upstream` retry mechanism.
3. Cross-replica authentication, sessions, and database state remain completely transparent and functional across all instances.

---

## 2. Methodology & Architecture

### Upstream Topology
- **Gateway:** NGINX listening on port 80.
- **Upstream Pool:** `api-1:3000` and `api-2:3000` with `keepalive 32`.
- **Failover Policy:** `proxy_next_upstream error timeout http_502 http_503; proxy_next_upstream_tries 2;`.
- **Workload:** 100 requests simulating active API client traffic.
- **Fault Injection:** At request 40, `api-1` is abruptly killed (simulating an unexpected OOM kill or process crash).

---

## 3. Experimental Results

### Availability & Traffic Distribution

| Metric | Target | Observed | Result |
|---|---|---|---|
| **Total Client Requests** | 100 | 100 | PASS |
| **Successful Responses (200 OK)** | 100 | 100 | PASS (100% Availability) |
| **Failed Client Responses (5xx)** | 0 | **0** | PASS (Zero Downtime) |
| **Replica 1 Processed** | >0 (Pre-kill) | 20 requests | PASS |
| **Replica 2 Processed** | Absorbs traffic | 80 requests (100% post-kill) | PASS |
| **Transparent Failover Retries** | >0 | 30 requests retried | PASS |

---

### Latency Profile During Failover

| Metric | Latency (ms) | Notes |
|---|---:|---|
| **p50** | 0.40 ms | Normal keepalive round-trip |
| **p95** | 0.84 ms | Baseline fast responses |
| **p99** | 6.31 ms | Includes TCP connect error detection & retry to replica 2 |
| **Mean** | 0.52 ms | Stable overall latency |

**Observation:** Even during the abrupt failure of `api-1`, maximum latency peaked at only 6.31 ms, representing the time taken to detect socket connection failure (`ECONNREFUSED`) and immediately route to `api-2`.

---

## 4. Stateless Cross-Replica Verification

In addition to network failover, cross-replica state integrity was verified:
- **JWT Authentication:** Tokens signed on replica 1 verify seamlessly on replica 2 via shared `JWT_SECRET`.
- **Session Revocation:** Logout on replica 1 immediately marks the refresh session revoked in PostgreSQL, blocking refresh attempts on replica 2 with 401 Unauthorized.
- **Cache Invalidation:** Updates on replica 1 actively invalidate Redis keys, ensuring replica 2 serves fresh data.
