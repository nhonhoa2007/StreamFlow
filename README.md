# StreamFlow — Advanced Backend & Distributed Systems Lab

StreamFlow is a Video on Demand (VOD) and media streaming platform built as an engineering laboratory for **Backend Engineering, Distributed Systems, High Performance, and Reliability (SRE)** using end-to-end TypeScript.

For the full 24-week engineering curriculum, see [StreamFlow Advanced Roadmap](./StreamFlow_Advanced_Roadmap%20(3).md).

---

## 3-Minute Executive Overview

- **Architecture:** Modular Monolith using `pnpm` workspaces and Turborepo. Core modules communicate via typed interfaces; CPU-heavy and asynchronous tasks run as independent services (BullMQ, Kafka).
- **Core Invariants:**
  - **Zero Dual-Write Hazard:** Domain operations write business state and outbox events in a single PostgreSQL ACID transaction. The asynchronous **Event Relay** guarantees at-least-once delivery to Kafka.
  - **Thundering Herd Immunity:** Cache misses under concurrency are coalesced via **Singleflight in-flight promise deduplication**: 100 simultaneous misses trigger exactly 1 database query.
  - **High Availability & Fail-Open:** All cache operations fail-open gracefully to PostgreSQL during Redis outages with 0 HTTP 500 errors. NGINX L7 proxy provides passive failover across stateless replicas.
  - **Zero-Downtime Rolling Deployment:** Kubernetes Deployments enforce `maxSurge: 1, maxUnavailable: 0` with HTTP `/health/live` and `/health/ready` probes and Horizontal Pod Autoscaling (HPA).
- **Tested Scale:** Capacity modeled for 10,000 concurrent streaming viewers at 3 Mbps (30 Gbps raw peak egress, reduced by 95% CDN caching to 1.5 Gbps origin bandwidth).

---

## 1. Architecture Overview (Milestones 01–12)

StreamFlow is structured as a **Modular Monolith** using `pnpm` workspaces and `Turborepo`:

```text
StreamFlow/
├── backend/
│   ├── apps/
│   │   ├── api/                    # NestJS 11 + Fastify adapter (Port 3000)
│   │   ├── media-worker/           # [M05+] FFmpeg & BullMQ worker
│   │   ├── event-relay/            # [M09+] Transactional Outbox to Kafka
│   │   └── analytics-consumer/     # [M09+] Kafka consumer projections
│   └── packages/
│       ├── config/                 # Fail-fast Zod environment configuration
│       ├── database/               # Drizzle ORM schema, migrations, connection pool
│       ├── logger/                 # Pino structured JSON logging with request ID
│       └── testing/                # [Later] Test fixtures & shared helpers
├── frontend/
│   └── apps/
│       └── web/                    # Next.js 15 App Router web client (Port 3001)
├── shared/
│   └── contracts/                  # Shared Zod schemas & DTOs (Single source of truth)
├── infra/
│   ├── compose/                    # Docker Compose local infrastructure
│   ├── nginx/                      # [M08+] Reverse proxy & load balancing
│   ├── kubernetes/                 # [M11+] Helm / K8s manifests
│   ├── monitoring/                 # [M10+] Prometheus / Grafana / Loki / Tempo
│   └── terraform/                  # [M12+] Infrastructure as Code
└── docs/                           # Architecture diagrams, ADRs, and experiment logs
```

---

## 2. Quickstart (From Clean Checkout)

### Prerequisites
- Node.js >= 22 (tested on Node v22/v26)
- pnpm >= 10 (`corepack enable pnpm` or `npm install -g pnpm`)
- Docker & Docker Compose

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Initialize Database & Seed Sample Media
```bash
make init
```
This command starts PostgreSQL 16 via Docker Compose, waits for its healthcheck (`pg_isready`), executes Drizzle migrations, and seeds 10 sample media items (5 audio, 5 video).

### Step 3: Run Development Servers
```bash
make dev
```
Runs both **API (http://127.0.0.1:3000)** and **Web (http://127.0.0.1:3001)** concurrently via Turborepo.

---

## 3. Infrastructure & Storage Commands

StreamFlow separates the database from optional object storage:

| Command | Action |
|---|---|
| `make up` | Starts **only** PostgreSQL 16 container (`127.0.0.1:5432`) |
| `make up-storage` | Starts PostgreSQL + **MinIO** local S3 emulation (`127.0.0.1:9000` / Console `9001`) with automatic bucket creation |
| `make down` | Stops all local containers |

> **Note on Cloudflare R2:** In production and cloud staging, StreamFlow uses Cloudflare R2 (S3-compatible, zero egress fees). You can configure R2 credentials in `.env` without modifying any backend code.

---

## 4. Key Endpoints

### Public & Catalog Endpoints
- **Web App:** [http://localhost:3001](http://localhost:3001) (Catalog with Keyset pagination & Auth modal)
- **API Catalog (Keyset Cursor):** `GET http://localhost:3000/v1/media?limit=20&cursor=...`
- **Media Detail (with Album & Artists):** `GET http://localhost:3000/v1/media/:id`
- **Search:** `GET http://localhost:3000/v1/search?q=query`
- **Liveness Probe:** `GET http://localhost:3000/health/live` (Process uptime, no DB dependency)
- **Readiness Probe:** `GET http://localhost:3000/health/ready` (Verifies database pool connectivity; returns 503 if DB is down)
- **Event Loop Experiment (Dev Only):** `GET http://localhost:3000/test/cpu-block` (Demonstrates single-threaded starvation)

### Authentication Endpoints (`/v1/auth`)
- **Register:** `POST http://localhost:3000/v1/auth/register` (Argon2id hashing, sets HttpOnly refresh cookie)
- **Login:** `POST http://localhost:3000/v1/auth/login` (Rate-limited, sets HttpOnly refresh cookie)
- **Token Rotation:** `POST http://localhost:3000/v1/auth/refresh` (Rotates token; revokes all sessions on reuse detection)
- **Logout:** `POST http://localhost:3000/v1/auth/logout` (Revokes session and clears cookie)
- **Current User Profile:** `GET http://localhost:3000/v1/auth/me` (Protected by `AuthGuard`, requires Bearer token)

### Library, Playlists & Playback Telemetry (`/v1/library`, `/v1/playlists`, `/v1/playback`)
- **Favorites:** `POST` / `DELETE http://localhost:3000/v1/media/:id/favorite` (Idempotent)
- **User Library:** `GET http://localhost:3000/v1/library/favorites` & `GET http://localhost:3000/v1/library/continue`
- **Playlists CRUD:** `POST` / `GET http://localhost:3000/v1/playlists` & `GET http://localhost:3000/v1/playlists/:id`
- **Playlist Items:** `POST` / `DELETE http://localhost:3000/v1/playlists/:id/items`
- **Atomic Reorder (OCC):** `PATCH http://localhost:3000/v1/playlists/:id/items/reorder` (Requires `expectedVersion`)
- **Start Playback:** `POST http://localhost:3000/v1/playback/:id/start` (Returns session and resume position)
- **Playback Manifest (HLS ABR):** `GET http://localhost:3000/v1/playback/:id/manifest` (Returns master playlist URL and renditions)
- **Playback Thumbnail:** `GET http://localhost:3000/v1/playback/:id/thumbnail`
- **Progress Telemetry:** `PUT http://localhost:3000/v1/playback/sessions/:id/progress` (Monotonic sequence protection)

### Administrative Endpoints (`/v1/admin/*`, protected by `@Roles('ADMIN')`)
- **Direct Upload Init:** `POST http://localhost:3000/v1/admin/uploads/init` (Allocates object key, signs PUT URL)
- **Direct Upload Complete:** `POST http://localhost:3000/v1/admin/uploads/:id/complete` (S3 HeadObject verification, idempotent)
- **Upload Session Detail:** `GET http://localhost:3000/v1/admin/uploads/:id`
- **Expired Sessions Cleanup:** `POST http://localhost:3000/v1/admin/uploads/cleanup`
- **Create Media Draft:** `POST http://localhost:3000/v1/admin/media`
- **List All Media (Drafts + Ready):** `GET http://localhost:3000/v1/admin/media`
- **Publish / Update:** `PATCH http://localhost:3000/v1/admin/media/:id`
- **Delete:** `DELETE http://localhost:3000/v1/admin/media/:id`
- **Trigger Transcode:** `POST http://localhost:3000/v1/admin/media/:id/transcode` (BullMQ idempotent enqueue)
- **Transcode Job Detail:** `GET http://localhost:3000/v1/admin/transcode-jobs/:id`
- **Media Transcode Jobs:** `GET http://localhost:3000/v1/admin/media/:id/transcode-jobs`

---

## 5. Verification & Testing

```bash
# Code formatting, linting & import sorting via Biome
pnpm check

# Fix Biome issues automatically
pnpm check:fix

# TypeScript strict type checking
pnpm typecheck

# Run unit and integration tests (against real PostgreSQL)
pnpm test

# Build all applications and packages
pnpm build

# Run acceptance smoke tests
node --test scripts/acceptance.test.mjs

# Seed 10,000 synthetic records for SQL benchmark
pnpm --filter @streamflow/database db:seed-10k

# Run Keyset Cursor vs. OFFSET benchmark
node scripts/perf/run-pagination-benchmark.mjs

# Run Concurrency OCC & Monotonic Telemetry experiment
node scripts/perf/run-concurrency-experiment.mjs

# Run Direct Upload Memory Isolation experiment
node scripts/perf/run-upload-memory-experiment.mjs

# Run HLS Transcoding & ABR experiment
node scripts/perf/run-transcode-experiment.mjs

# Run Redis Cache-Aside & Stampede benchmark
node scripts/perf/run-cache-benchmark.mjs

# Run BullMQ Robust Transcode Queue experiment
node scripts/perf/run-transcode-queue-experiment.mjs

# Run NGINX Stateless Failover experiment
node scripts/perf/run-nginx-failover-experiment.mjs

# Run Transactional Outbox & Kafka experiment
node scripts/perf/run-outbox-kafka-experiment.mjs

# Run Chaos Resiliency & Observability experiment
node scripts/perf/run-chaos-resiliency-experiment.mjs

# Run Kubernetes Autoscaling & Rolling Update experiment
node scripts/perf/run-k8s-scaling-experiment.mjs

# Run Capstone Capacity & Security experiment
node scripts/perf/run-capstone-capacity-experiment.mjs

# Run Disaster Recovery Backup & Restoration drill
node scripts/dr-backup-restore-drill.mjs
```

---

## 6. Architecture Documentation & Experiments

- [C4 System Context Diagram](./docs/architecture/context.md)
- [C4 Container Diagram](./docs/architecture/container.md)
- [C4 Deployment Diagram (Stage B Multi-Replica)](./docs/architecture/deployment.md)
- [Capacity Planning & Bandwidth Cost Model](./docs/architecture/capacity-planning-and-cost.md)
- [Transactional Outbox & Event-Driven Analytics Sequence](./docs/architecture/outbox-sequence.md)
- [STRIDE Threat Model & Security Hardening Architecture](./docs/security/threat-model-and-hardening.md)
- [Runbook: Deployment, Rolling Restart & Rollback](./docs/runbooks/deployment-and-rollback.md)
- [Runbook: Incident Response & Golden Signals Triage](./docs/runbooks/incident-response.md)
- [Runbook: Database Disaster Recovery & Backup Restoration](./docs/runbooks/disaster-recovery-and-backup.md)
- [ADR-001: Modular Monolith Architecture](./docs/adr/001-modular-monolith.md)
- [ADR-002: Token & Session Management Strategy](./docs/adr/002-token-and-session-strategy.md)
- [ADR-003: Concurrency Control Strategy: Optimistic Locking & Monotonic Sequences](./docs/adr/003-concurrency-control-strategy.md)
- [ADR-004: Direct-to-Storage Media Upload Architecture](./docs/adr/004-direct-object-storage-architecture.md)
- [ADR-005: HLS Adaptive Streaming Architecture & Origin Decoupling](./docs/adr/005-hls-adaptive-streaming-architecture.md)
- [ADR-006: Redis Cache-Aside Strategy & Stampede Mitigation](./docs/adr/006-cache-aside-and-stampede-mitigation.md)
- [ADR-007: BullMQ Asynchronous Processing, Idempotency & Retry Strategy](./docs/adr/007-job-idempotency-and-retry-strategy.md)
- [ADR-008: NGINX Reverse Proxy, Stateless Architecture & Passive Failover](./docs/adr/008-nginx-reverse-proxy-and-stateless-failover.md)
- [ADR-009: Transactional Outbox Pattern, Kafka Event Streaming & Idempotent Projections](./docs/adr/009-transactional-outbox-and-event-streaming.md)
- [ADR-010: Observability Strategy, Service Level Objectives (SLOs) & Chaos Engineering](./docs/adr/010-observability-slo-and-chaos-engineering.md)
- [ADR-011: Kubernetes Adoption Tradeoffs & Runtime Topology](./docs/adr/011-kubernetes-adoption-tradeoffs.md)
- [ADR-012: Capstone Architecture Evolution & System Retrospective](./docs/adr/012-capstone-architecture-evolution.md)
- [Postmortem 001: Redis Cache Outage & Fail-Open Degradation](./docs/postmortems/001-redis-outage-cache-degradation.md)
- [Postmortem 002: Media Worker Failure & Queue Backlog Draining](./docs/postmortems/002-transcode-worker-backlog-and-recovery.md)
- [Postmortem 003: Database Saturation & Readiness Probe Load Shedding](./docs/postmortems/003-database-saturation-and-readiness-tripping.md)
- [Experiment 001: Event Loop Starvation & Healthcheck Semantics](./docs/experiments/001-event-loop-and-healthchecks.md)
- [Experiment 002: Keyset (Cursor) Pagination vs. OFFSET Benchmark (10,000 Records)](./docs/experiments/002-keyset-pagination-benchmark.md)
- [Experiment 003: Concurrency Control (OCC) & Monotonic Playback Telemetry](./docs/experiments/003-concurrency-and-telemetry.md)
- [Experiment 004: Direct-to-Storage Upload & Process Memory Isolation](./docs/experiments/004-direct-upload-memory.md)
- [Experiment 005: Video Transcoding Performance & Adaptive Bitrate (ABR) Switching](./docs/experiments/005-hls-transcoding-and-abr.md)
- [Experiment 006: Redis Cache-Aside, Stampede Defense & Fail-Open Resilience](./docs/experiments/006-cache-aside-and-stampede.md)
- [Experiment 007: BullMQ, Robust Transcode Jobs & Idempotency Defense](./docs/experiments/007-robust-transcode-jobs.md)
- [Experiment 008: NGINX Load Balancing, Stateless Failover & Zero-Downtime Resilience](./docs/experiments/008-nginx-stateless-failover.md)
- [Experiment 009: Transactional Outbox, Kafka Streaming & Idempotent Projections](./docs/experiments/009-transactional-outbox-and-kafka.md)
- [Experiment 010: Chaos Engineering, Resilience Under Outages & Log Redaction](./docs/experiments/010-chaos-and-observability.md)
- [Experiment 011: Kubernetes Horizontal Pod Autoscaler (HPA) & Rolling Updates](./docs/experiments/011-kubernetes-hpa-and-rolling-updates.md)
- [Experiment 012: Capstone Capacity Planning, Security Hardening & Disaster Recovery](./docs/experiments/012-capstone-capacity-and-security.md)
