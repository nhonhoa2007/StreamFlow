# Experiment 001: Event Loop Starvation & Healthcheck Semantics

- **Date:** 2026-11-01
- **Milestone:** M01 Foundation
- **Environment:** Node.js v26 / Arch Linux x86_64 / Fastify NestJS

---

## Part 1: Healthcheck Semantics (Liveness vs. Readiness)

### Hypothesis
During an external dependency outage (PostgreSQL crash/unavailability), the API process must:
1. Maintain `200 OK` on `/health/live` (reflecting that the Node.js process is alive, healthy, and not deadlocked).
2. Promptly return `503 Service Unavailable` on `/health/ready` within 2 seconds (reflecting that the instance cannot accept catalog queries).
3. Automatically recover to `200 OK` on `/health/ready` once database connectivity is restored.

### Observed Evidence
When PostgreSQL is stopped or uncontactable:
```http
GET /health/live
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
x-request-id: 3c5e88bb-8da7-4e76-8f83-e18e3a2b7b5c

{"status":"ok","uptime":14.28}
```

```http
GET /health/ready
HTTP/1.1 503 Service Unavailable
Content-Type: application/json; charset=utf-8
x-request-id: 61e1b782-dc31-419b-a01c-6b3a985a9bc4

{"status":"degraded","db":"disconnected"}
```

### Architectural Takeaway
Container orchestrators (Docker Swarm, Kubernetes) use:
- **Liveness probe failure:** To restart a deadlocked or hung container. If readiness were coupled to liveness, a database blip would cause all API replicas to restart simultaneously (CrashLoopBackOff stampede).
- **Readiness probe failure:** To temporarily remove the failing instance from the load balancer rotation while leaving the process intact, allowing it to recover gracefully once the database is back up.

---

## Part 2: Single-Threaded Node.js Event Loop Blocking

### Hypothesis
Because Node.js executes JavaScript on a single-threaded Event Loop, any CPU-intensive synchronous task (such as video hashing, frame parsing, or a while-loop) running on the main thread will starve all concurrent requests, causing latency spikes on even the simplest endpoints.

### Benchmark Results
Measured via `scripts/perf/run-event-loop-experiment.mjs` comparing `/health/live` requests:

| Scenario | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Mean (ms) | Samples |
|---|---|---|---|---|---|---|
| **Baseline** (Idle API) | 1.15 | 2.45 | 3.10 | 3.52 | 1.34 | 30 |
| **Under 500ms CPU Block** | 260.40 | 485.10 | 498.20 | 502.80 | 258.90 | 16 |

### Observation
While `/test/cpu-block` executed its 500ms synchronous loop:
- In-flight and newly arriving `/health/live` HTTP requests queued in the TCP backlog / kernel socket buffer.
- Latency skyrocketed from ~1.3ms to over 500ms.
- Node.js could not process I/O events, timers, or network callbacks during that 500ms window.

### Mitigation in StreamFlow Architecture
1. **Never perform media processing in the API control plane:** Transcoding (FFmpeg), thumbnail generation, and HLS packaging are strictly offloaded to worker processes running on separate container replicas (`backend/apps/media-worker` in M05/M07).
2. **Asynchronous job queuing:** The API only registers jobs in BullMQ / Redis and returns immediately, protecting the main thread.
