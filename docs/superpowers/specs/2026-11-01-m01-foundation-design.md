# Milestone 01 Specification: Foundation, Monorepo & Local Infrastructure

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M01 (Weeks 1–2)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 01 lays the architectural foundation of StreamFlow as a **Modular Monolith** using **pnpm workspaces** and **Turborepo**, with clear physical separation between **Backend**, **Frontend**, and **Shared contracts**, and unified code quality managed via **Biome**.

The primary goals:
1. Clear domain boundary separation:
   - `backend/`: Core API, background workers, and backend packages.
   - `frontend/`: Web client applications.
   - `shared/`: Cross-cutting contracts and schemas (Single Source of Truth).
2. Modern, high-performance tooling: **Biome** (`@biomejs/biome`) replacing both Prettier and ESLint for sub-second formatting, linting, and import sorting.
3. Separation of Control Plane (NestJS + Fastify) and Media Storage (MinIO local / Cloudflare R2 cloud-ready).
4. Health check semantics: strictly distinguishing between Liveness (`/health/live`) and Readiness (`/health/ready`).
5. Single-threaded runtime awareness: observing and demonstrating Event Loop blocking consequences.
6. Schema-driven contracts and strict typed environment configuration using Zod.
7. Structured JSON logging with request context propagation (`x-request-id`).

---

## 2. Monorepo Architecture & Workspace Layout

### 2.1 Workspace Configuration
- **Package Manager:** `pnpm` (v10) with workspaces declared in `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - 'backend/apps/*'
    - 'backend/packages/*'
    - 'frontend/apps/*'
    - 'shared/*'
  ```
- **Build & Task Orchestrator:** `turbo` (Turborepo) defining pipeline graphs for `build`, `dev`, `lint`, `check`, `test`, `db:migrate`, `db:seed`.
- **Code Quality & Formatting:** `biome.json` at root managing formatting, linting, and import sorting for all workspaces.
- **TypeScript:** Shared root `tsconfig.base.json` with strict mode, ES2022 target, and bundler module resolution.

```text
StreamFlow/
├── backend/
│   ├── apps/
│   │   └── api/                # NestJS modular monolith with Fastify adapter
│   └── packages/
│       ├── config/             # Backend environment schema validation (Zod)
│       ├── database/           # Drizzle ORM schema, migrations, connection pool, health probe
│       └── logger/             # Pino structured logging with request ID injection
│
├── frontend/
│   └── apps/
│       └── web/                # Next.js 15 App Router client + Tailwind CSS
│
├── shared/
│   └── contracts/              # Shared Zod schemas, API DTOs, and TypeScript types
│
├── infra/
│   └── compose/
│       ├── docker-compose.yml  # PostgreSQL 16 + MinIO local infrastructure
│       └── .env.example        # Documented baseline environment variables
│
├── docs/
│   ├── adr/
│   │   └── 001-modular-monolith.md
│   └── superpowers/specs/
│       └── 2026-11-01-m01-foundation-design.md
│
├── scripts/
│   └── perf/                   # Benchmark scripts for event loop blocking demonstration
│
├── biome.json                  # Unified Biome configuration (linter + formatter)
├── Makefile                    # Unified developer CLI commands
├── package.json                # Root workspace manifest
├── pnpm-workspace.yaml
└── turbo.json                  # Turborepo task pipeline configuration
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
- **`minio` (Local S3 Emulation / Offline Dev):**
  - Image: `minio/minio:latest`.
  - Command: `server /data --console-address ":9001"`.
  - Ports: `9000:9000` (S3 API), `9001:9001` (Web Console).
  - Environment: `MINIO_ROOT_USER=minioadmin`, `MINIO_ROOT_PASSWORD=minioadmin`.
  - Volume: `streamflow_minio_data:/data`.
- **`createbuckets`:**
  - One-shot initialization container using `minio/mc` to ensure `streamflow-media-dev` bucket exists.

### 3.2 Dual-Mode Storage Architecture (MinIO & Cloudflare R2)
Storage configuration in `backend/packages/config` accepts either provider transparently:
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

## 4. Shared & Backend Packages Specification

### 4.1 `shared/contracts` (`@streamflow/contracts`)
- Single Source of Truth for runtime schemas and TypeScript interfaces:
  - `HealthResponse`: `{ status: 'ok' | 'degraded', uptime: number, db?: 'connected' | 'disconnected' }`.
  - `MediaItem`: `{ id: string, type: 'AUDIO' | 'VIDEO', title: string, slug: string, status: 'DRAFT' | 'READY', durationMs: number | null, createdAt: string, updatedAt: string }`.
  - `MediaListQuery`: Query parameters for pagination and filtering (`type`, `limit`, `cursor`).

### 4.2 `backend/packages/config` (`@streamflow/config`)
- Validates environment variables at process bootstrap using Zod schema.
- Enforces fail-fast behavior: if mandatory variables are missing, process halts with clear diagnostic output.
- Exports typed `appConfig`.

### 4.3 `backend/packages/database` (`@streamflow/database`)
- **ORM:** Drizzle ORM with `postgres` connection driver / pool.
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
  - `checkDatabaseConnection(): Promise<boolean>` executing `SELECT 1` with a 2-second timeout.
- **Scripts:**
  - `pnpm db:generate`: Generate SQL migration files.
  - `pnpm db:migrate`: Run pending migrations.
  - `pnpm db:seed`: Seed sample media catalog items (5 audio, 5 video).

### 4.4 `backend/packages/logger` (`@streamflow/logger`)
- High-performance logging wrapping `pino`.
- Production: Raw structured JSON. Development: Formatted stream via `pino-pretty`.
- Middleware injecting and propagating `x-request-id` header (UUIDv4) across all log outputs.

---

## 5. Applications Specification

### 5.1 `backend/apps/api` (NestJS + Fastify)
- **Bootstrap:**
  - Initialized with `FastifyAdapter`.
  - Root prefix `/v1` for business endpoints, `/health` for operational probes.
  - Registered shutdown hooks for `SIGINT` and `SIGTERM`.
- **Modules:**
  - `HealthModule`:
    - `GET /health/live`: Process liveness check, returns 200 `{ status: "ok", uptime: process.uptime() }`.
    - `GET /health/ready`: Database dependency check via `checkDatabaseConnection()`. Returns 200 `{ status: "ready", db: "connected" }` when healthy; 503 `{ status: "degraded", db: "disconnected" }` on failure.
  - `MediaModule`:
    - `GET /v1/media`: Retrieves media catalog from PostgreSQL using Drizzle ORM, validating input and output against `@streamflow/contracts`.
  - `TestModule` (Active in dev/test only):
    - `GET /test/cpu-block`: Executes 500ms synchronous loop to illustrate Event Loop starvation.

### 5.2 `frontend/apps/web` (Next.js 15)
- **Framework:** Next.js App Router, TypeScript, Tailwind CSS.
- **Media Catalog View (`app/page.tsx`):**
  - Fetches `GET /v1/media` from backend.
  - Renders media items with responsive cards, badge types, and durations.
  - Complete UI states: Loading skeleton, Empty state, Error banner.

---

## 6. Code Quality with Biome (`biome.json`)

Root `biome.json` replaces Prettier and ESLint:
- **Formatter:** 2 spaces indent, semicolons required, double quotes.
- **Linter:** Recommended rule-set for TypeScript, React, and Node.js.
- **Imports:** Automatic organization and sorting on save/check.
- **Commands:**
  - `pnpm format`: `biome format --write .`
  - `pnpm lint`: `biome lint .`
  - `pnpm check`: `biome check --write .`

---

## 7. Testing Strategy & Educational Experiments

### 7.1 Testing Pyramid for M01
- **Unit Tests (`vitest`):** Zod contracts, config validation, logger utilities.
- **Integration Tests (`vitest` + `testcontainers`):**
  - Spawns real PostgreSQL 16 container.
  - Executes Drizzle migrations.
  - Tests database repository queries and API endpoints (`/v1/media`, `/health/ready`).

### 7.2 Controlled Failure Experiments
1. **Experiment 1 (Healthcheck semantics):**
   - Verify both probes return 200.
   - Stop postgres container: verify `/health/live` remains 200 while `/health/ready` returns 503.
2. **Experiment 2 (Event Loop blockage):**
   - Send requests to `/test/cpu-block` while simultaneously benchmarking `/health/live`.
   - Record latency spike from <5ms to >500ms demonstrating main thread starvation.

---

## 8. Definition of Done (Acceptance Criteria)
1. Single command bootstrap: `make up` boots PostgreSQL and MinIO cleanly.
2. Development startup: `pnpm install && pnpm dev` boots both API and Web concurrently via Turborepo.
3. Database migration and seeding work cleanly via `pnpm db:migrate` and `pnpm db:seed`.
4. Web frontend renders seeded media items fetched from API.
5. Integration test suite passes against real PostgreSQL via Testcontainers.
6. Biome check (`pnpm check`) and TypeScript typecheck (`pnpm typecheck`) pass with 0 errors.
