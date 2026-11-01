# Postmortem 003: Database Saturation & Readiness Probe Load Shedding

- **Incident Date:** 2026-11-01
- **Severity:** SEV-2 (Temporary Gateway Load Shedding)
- **Status:** Resolved / Postmortem Complete
- **Lead Responders:** StreamFlow Reliability & Database Team

---

## 1. Summary

At 18:00 UTC, a batch migration script executed on the primary PostgreSQL database with an unindexed table scan, acquiring an exclusive lock on `playback_sessions` and causing client connection pool saturation. Within 3 seconds, the API's `/health/ready` probe detected pool starvation and tripped to `503 Service Unavailable`. The NGINX reverse proxy detected the 503 and immediately redirected traffic to the secondary healthy API replica, preventing cascading server crashes.

---

## 2. Trigger

An ad-hoc, unindexed analytical query was run on the production database during peak hours, acquiring table-level locks and exhausting pool connections.

---

## 3. Timeline

- **18:00:00 UTC** — Heavy analytic query executed without index, consuming all available database connection pool slots.
- **18:00:03 UTC** — `/health/ready` probe failed on `api-1`, returning HTTP 503.
- **18:00:05 UTC** — NGINX `proxy_next_upstream` detected 503 on `api-1` and automatically routed client requests to `api-2`.
- **18:03:05 UTC** — Prometheus alert `DatabasePoolSaturation` fired after pool utilization exceeded 85% for 3 minutes.
- **18:04:00 UTC** — Engineer identified and terminated the blocking PID in PostgreSQL (`SELECT pg_terminate_backend(pid)`).
- **18:04:30 UTC** — Connection pool recovered; `/health/ready` on `api-1` returned 200 OK.
- **18:05:00 UTC** — NGINX re-enabled balanced distribution across both replicas. Incident closed.

---

## 4. Detection

Detected by `/health/ready` failing in 3 seconds and Prometheus alert `DatabasePoolSaturation` (`saturation > 85% for 3m`).

---

## 5. Impact

- **End-User Impact:** Zero dropped user requests (transparently retried by NGINX).
- **Service Protection:** API process memory and event loop remained stable; no process crash occurred.

---

## 6. Root Cause

Unoptimized manual query executed during peak load without query timeout limits (`statement_timeout`).

---

## 7. Corrective Actions

1. [Completed] Enforced `statement_timeout = 5000` (5 seconds) across all API connection pools to prevent long-running queries from locking connection slots.
2. [Completed] Verified that `/health/ready` checks connection health independently of business endpoints.
3. [Completed] Added automated pg_stat_activity connection monitoring in Prometheus alerts.
