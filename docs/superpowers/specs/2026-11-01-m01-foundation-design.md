# Milestone 01 Specification: Foundation, Monorepo & Local Infrastructure

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M01 (Weeks 1–2)
- **Date:** 2026-11-01
- **Status:** Draft / Ready for Review

---

## 1. Executive Summary & Objectives

Milestone 01 lays the architectural foundation of StreamFlow as a **Modular Monolith** using **pnpm workspaces** and **Turborepo**. The primary goal is establishing an end-to-end development cycle from database persistence up to frontend display while demonstrating core distributed systems and reliability concepts:
1. Separation of Control Plane (NestJS + Fastify) and Media Storage (MinIO local / Cloudflare R2 cloud-ready).
2. Health check semantics: strictly distinguishing between Liveness (`/health/live`) and Readiness (`/health/ready`).
3. Single-threaded runtime awareness: observing and proving Event Loop blocking consequences.
4. Schema-driven contracts and strict typed environment configuration using Zod.
5. Structured JSON logging with request context propagation (`x-request-id`).

---

## 2. Monorepo Architecture & Workspace Layout

### 2.1 Workspace Configuration
- **Package Manager:** `pnpm` (v10) with workspaces defined in `pnpm-workspace.yaml`.
- **Build & Task Orchestrator:** `turbo` (Turborepo) defining pipeline graphs for `build`, `dev`, `lint`, `test`, `db:migrate`, `db:seed`.
- **TypeScript:** Shared root `tsconfig.base.json` with strict mode, ES2022 target, and bundler module resolution.

```text
StreamFlow/
├── apps/
│   ├── api/                   # NestJS modular monolith with Fastify adapter
│   └── web/                   # Next.js 15 App Router client
├── packages/
│   ├── config/                # Environment variable schema validation (Zod)
│   ├── contracts/             # Shared API DTOs, schemas, and interfaces (Zod)
│   ├── database/              # Drizzle ORM schemas, migrations, pool, and health probe
│   └── logger/                # Pino structured logging with request ID injection
├── infra/
│   └── compose/
│       ├── docker-compose.yml # PostgreSQL 16 + MinIO local infrastructure
│       └── .env.example       # Documented baseline environment variables
├── docs/
│   ├── adr/
│   │   └── 001-modular-monolith.md
│   └── superpowers/specs/
│       └── 2026-11-01-m01-foundation-design.md
├── scripts/
│   └── perf/                  # Benchmark scripts for event loop blocking demo
├── Makefile                   # Unified developer CLI commands
├── package.json               # Root workspace manifest
├── pnpm-workspace.yaml
└── turbo.json                 # Turborepo task pipeline configuration
```

---

## 3. Infrastructure & Storage (`infra/compose`)

### 3.1 Docker Compose Services
- **`postgres`:**
  - Image: `postgres:16-alpine`.
  - Port: `5432:5432`.
  - Environment: `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=streamflow`.
  - Healthcheck: `pg_isready -U postgres -d streamflow`.
  - Volume: `streamflow_pg_data:/var/lib/postgresql/data`.
- **`minio` (Optional / Local S3 emulation):**
  - Image: `minio/minio:latest`.
  - Command: `server /data --console-address ":9001"`.
  - Ports: `9000:9000` (S3 API), `9001:9001` (Web Console).
  - Environment: `MINIO_ROOT_USER=minioadmin`, `MINIO_ROOT_PASSWORD=minioadmin`.
  - Volume: `streamflow_minio_data:/data`.
- **`createbuckets`:**
  - One-shot initialization container using `minio/mc` to create `streamflow-media-dev` bucket if not existing.

### 3.2 Cloudflare R2 Dual-Mode Support
Storage settings are normalized in `@streamflow/config`:
- When `STORAGE_PROVIDER=minio`:
  - `STORAGE_ENDPOINT=http://localhost:9000`
  - `STORAGE_ACCESS_KEY_ID=minioadmin`
  - `STORAGE_SECRET_ACCESS_KEY=minioadmin`
  - `STORAGE_BUCKET_NAME=streamflow-media-dev`
- When `STORAGE_PROVIDER=cloudflare_r2`:
  - `STORAGE_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`
  - `STORAGE_ACCESS_KEY_ID=<cloudflare_r2_access_key>`
  - `STORAGE_SECRET_ACCESS_KEY=<cloudflare_r2_secret_key>`
  - `STORAGE_BUCKET_NAME=<bucket_name>`
  - `STORAGE_PUBLIC_URL=<public_custom_domain>`

---

## 4. Shared Packages Specification

### 4.1 `@streamflow/config`
- Validates process environment variables at startup using Zod schema.
- Throws an informative startup error if required variables are missing or malformed (fail-fast principle).
- Exports a typed configuration object `appConfig`.

### 4.2 `@streamflow/contracts`
- Defines shared runtime schemas and TypeScript types:
  - `HealthResponse`: `{ status: 'ok' | 'degraded', uptime: number, db?: 'connected' | 'disconnected' }`.
  - `MediaItem`: `{ id: string, type: 'AUDIO' | 'VIDEO', title: string, slug: string, status: 'DRAFT' | 'READY', durationMs: number | null, createdAt: string, updatedAt: string }`.
  - `MediaListQuery`: Query parameters for pagination and filtering (`type`, `limit`, `cursor`).

### 4.3 `@streamflow/database`
- **ORM:** Drizzle ORM (`drizzle-orm/node-postgres` or `drizzle-orm/postgres-js`).
- **Schema (`media` table):**
  - `id`: `uuid` (Primary Key, default random UUIDv4).
  - `type`: `varchar(16)` with enum constraint (`AUDIO`, `VIDEO`).
  - `title`: `varchar(255)`, not null.
  - `slug`: `varchar(255)`, unique, not null.
  - `status`: `varchar(16)` with enum constraint (`DRAFT`, `READY`), default `'DRAFT'`.
  - `duration_ms`: `integer`, nullable.
  - `created_at`: `timestamp with time zone`, default `now()`, not null.
  - `updated_at`: `timestamp with time zone`, default `now()`, not null.
- **Indices:**
  - Unique index on `slug`.
  - Composite index on `(status, created_at)`.
- **Health Check Helper:**
  - `checkDatabaseConnection(): Promise<boolean>` executes `SELECT 1` with a 2-second timeout.
- **Scripts:**
  - `pnpm db:generate`: Generate SQL migration files.
  - `pnpm db:migrate`: Run pending migrations against target DB.
  - `pnpm db:seed`: Seed 10 sample media items (5 audio, 5 video).

### 4.4 `@streamflow/logger`
- Wraps `pino` logger.
- Formats logs as JSON in production; uses `pino-pretty` in local development.
- Middleware / Fastify plugin attaching `requestId` (`x-request-id` header or generated UUIDv4) to every log entry.

---

## 5. Applications Specification

### 5.1 `apps/api` (NestJS + Fastify)
- **Main Server:**
  - Bootstrap with `FastifyAdapter`.
  - Configures global prefix `/v1` (with health endpoints at `/health`).
  - Graceful shutdown handlers for `SIGINT` and `SIGTERM`.
- **`HealthModule`:**
  - `GET /health/live`:
    - Checks only that process is running.
    - Returns `200 OK` `{ status: "ok", uptime: process.uptime() }`.
  - `GET /health/ready`:
    - Checks database connectivity via `checkDatabaseConnection()`.
    - Returns `200 OK` `{ status: "ready", db: "connected" }` if DB is reachable.
    - Returns `503 Service Unavailable` `{ status: "degraded", db: "disconnected" }` if DB fails.
- **`MediaModule`:**
  - `GET /v1/media`: Queries media items from PostgreSQL using Drizzle ORM, validating query parameters and response payloads against `@streamflow/contracts`.
- **`TestModule` (Development & Test environments only):**
  - `GET /test/cpu-block`: Runs a synchronous 500ms while-loop calculation to demonstrate event loop blockage.

### 5.2 `apps/web` (Next.js 15)
- **Framework:** Next.js App Router with TypeScript and Tailwind CSS.
- **Media Catalog View (`app/page.tsx`):**
  - Fetches `GET /v1/media` from backend.
  - Displays media card list with title, type badge (Audio/Video), duration, and status.
  - Handles Loading, Empty, and Error states cleanly.

---

## 6. Testing Strategy & Educational Experiments

### 6.1 Testing Pyramid for M01
- **Unit Tests (`vitest`):** Schema validation, config parsing, and contract serialization.
- **Integration Tests (`vitest` + `testcontainers`):**
  - Spawns a real PostgreSQL 16 container.
  - Executes migration scripts.
  - Tests database repository queries and API endpoints (`/v1/media`, `/health/ready`).

### 6.2 Controlled Failure Experiments
1. **Experiment 1 (Healthcheck semantics):**
   - Verify `/health/live` and `/health/ready` both return 200 during normal operation.
   - Stop postgres container: verify `/health/live` remains 200 while `/health/ready` flips to 503.
2. **Experiment 2 (Event Loop blockage):**
   - Send requests to `/test/cpu-block` while simultaneously measuring latency on `/health/live`.
   - Confirm latency increases from <5ms to >500ms due to single-threaded main loop starvation.

---

## 7. Architecture Decision Record: ADR-001 Summary
- **Title:** Modular Monolith Architecture for Initial System Foundation.
- **Decision:** Start with a Modular Monolith with clean boundary interfaces in NestJS and shared packages in a pnpm monorepo rather than microservices.
- **Consequences:** Eliminates network serialization overhead, distributed tracing complexity, and partial deployment coordination overhead during early domain discovery.
- **Decomposition Triggers:** Service separation will only be evaluated when independent scaling requirements arise (e.g. CPU-intensive FFmpeg transcoding workers in M05/M07).

---

## 8. Definition of Done (Acceptance Criteria)
1. Single command bootstrap: `make up` (or `docker compose -f infra/compose/docker-compose.yml up -d`) starts Postgres and MinIO cleanly.
2. Development startup: `pnpm install && pnpm dev` boots both API and Web concurrently via Turborepo.
3. Database migration and seeding work reproducibly via `pnpm db:migrate` and `pnpm db:seed`.
4. Web frontend fetches and renders seeded media catalog items from API.
5. Integration test suite passes against real PostgreSQL via Testcontainers.
6. Linting (`pnpm lint`) and typechecking (`pnpm typecheck`) pass cleanly without warnings.
