# Experiment 010: Chaos Engineering, Resilience Under Outages & Log Redaction

- **Date:** 2026-11-01
- **Milestone:** M10 Observability, Resiliency, Chaos Exercises & Postmortems
- **Environment:** Node.js 22 / Fastify API / PostgreSQL 16 / Redis 7 / BullMQ
- **Source Script:** `scripts/perf/run-chaos-resiliency-experiment.mjs`

---

## 1. Executive Summary

Milestone 10 validates the system's ability to withstand catastrophic infrastructure failures, shed load gracefully, and maintain zero sensitive credential leakage under operational chaos:
1. **Chaos 1 (Redis Outage):** Simulates sudden loss of the Redis caching and queue layer; verifies fail-open degradation to PostgreSQL with 0 HTTP 500 errors.
2. **Chaos 2 (Media Worker Crash):** Simulates an unhandled worker process crash while uploads are enqueued; verifies BullMQ queue safety and backlog recovery without partial publication.
3. **Chaos 3 (Database Connection Pool Saturation):** Simulates pool exhaustion; verifies `/health/ready` immediately trips to 503 and prompts reverse proxy load shedding.
4. **Security Verification (Log Redaction):** Injects passwords, bearer tokens, and presigned S3 signature query parameters into log calls; verifies 100% masking.

---

## 2. Experimental Scenarios & Invariant Verification

### Exercise 1: Redis Outage (Fail-Open Degradation)

- **Fault:** Network socket connection error to Redis (`ECONNREFUSED 127.0.0.1:6379`).
- **Expected Behavior:** API catches cache failure transparently and serves catalog queries directly from PostgreSQL.
- **Observed:** 100% 200 OK responses; zero application crashes.

| Metric | Target | Observed | Result |
|---|---|---|---|
| HTTP 5xx Error Rate | 0% | 0% | PASS |
| Data Fallback Source | PostgreSQL | PostgreSQL | PASS |
| Service Health | Operational | Operational | PASS |

---

### Exercise 2: Media Worker Crash & Backlog Drain

- **Fault:** Abrupt worker process termination during high upload volume.
- **Expected Behavior:** API continues accepting uploads; jobs safely accumulate in Redis; restarted worker drains backlog in bounded concurrency waves (`concurrency: 2`).
- **Observed:** 15 jobs accumulated and drained with zero duplicate artifacts.

| Phase | Metric | Observed | Result |
|---|---|---|---|
| Worker Offline | Jobs Enqueued Safely | 15 jobs | PASS |
| Worker Restart | Jobs Drained | 15/15 jobs | PASS |
| Publication State | Clean READY promotion | 0 partial states | PASS |

---

### Exercise 3: Database Pool Saturation & Readiness Shedding

- **Fault:** Active database connections reach max pool capacity (10/10).
- **Expected Behavior:** `/health/ready` trips from 200 OK to 503 Service Unavailable, signaling NGINX to shed incoming traffic.
- **Observed:** 503 returned immediately; no memory leak or cascading failure.

| State | Pool Usage | `/health/ready` Status | Gateway Action |
|---|---|---|---|
| Normal | 2/10 connections | 200 OK | Traffic routed |
| Saturated | 10/10 connections | **503 Service Unavailable** | Traffic shed |

---

### Security Exercise 4: Sensitive Data & Secret Log Redaction

- **Test:** Injected 5 sensitive credential types into Pino logger output.
- **Target:** Zero occurrences of raw passwords, bearer tokens, or S3 signatures.
- **Observed:** 0 leaks detected; all sensitive values masked with `[REDACTED]`.

---

## 3. Summary Table

| Exercise | Expected Outcome | Observed Outcome | Status |
|---|---|---|---|
| **1. Redis Outage** | Fail-open to DB (200 OK) | 100% requests served from DB | PASS |
| **2. Worker Crash** | Queue holds jobs, drains on restart | 15 jobs accumulated & drained | PASS |
| **3. DB Saturation** | Readiness trips to 503, sheds load | 503 Service Unavailable | PASS |
| **4. Log Redaction** | Zero secret leaks in log streams | 0 leaks, masked [REDACTED] | PASS |
