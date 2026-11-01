# Milestone 01 Specification: Foundation, Monorepo & Local Infrastructure

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M01 (Weeks 1–2)
- **Date:** 2026-11-01
- **Status:** Approved for implementation planning on 2026-11-01.

---

## 1. Executive Summary & Objectives

Milestone 01 lays the architectural foundation of StreamFlow as a **Modular Monolith** using **pnpm workspaces** and **Turborepo**, with clear physical separation between **Backend**, **Frontend**, and **Shared contracts**, and unified code quality managed via **Biome**. The directory tree represents the entire 24-week project: create and track every planned branch of the tree during M01, but implement, install dependencies for, and register in the workspace only M01 components. Future-stage directories contain only `.gitkeep` until their milestone begins.

The primary goals:
1. Clear domain boundary separation:
   - `backend/`: Core API, background workers, and backend packages.
   - `frontend/`: Web client applications.
   - `shared/`: Cross-cutting contracts and schemas (Single Source of Truth).
2. Modern, high-performance tooling: **Biome** (`@biomejs/biome`) replacing both Prettier and ESLint for sub-second formatting, linting, and import sorting.
3. Establishing a metadata-only API boundary now, with optional local MinIO for exploration and storage integration deferred until M04; Cloudflare R2 remains a planned deployment option.
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
- **Build & Task Orchestrator:** `turbo` for `build`, `dev`, `test`, and `typecheck`. Biome is invoked once at the root (not redundantly per package); migrations and seeds use explicit database-package commands rather than cached Turbo tasks.
- **Code Quality & Formatting:** root `biome.json` manages formatting, linting, and import sorting.
- **TypeScript:** root `tsconfig.base.json` contains shared strictness only; the API sets its own Node-compatible module/module-resolution settings, and Next.js owns its app-specific configuration. Do not force `moduleResolution: Bundler` on the Node API.
- `pnpm-workspace.yaml` patterns may cover placeholder directories, but pnpm/Turbo recognize only directories with `package.json`. Never create placeholder manifests or empty service code.

### 2.2 Target tree across all milestones

`[M01]` denotes a working component delivered in M01. `[later]` denotes a directory tracked in M01 with `.gitkeep` only; implementation begins in the indicated later milestone. No unused scaffolds, empty manifests or future dependencies are installed.

```text
StreamFlow/
├── backend/
│   ├── apps/
│   │   ├── api/                    [M01] NestJS modular monolith
│   │   ├── media-worker/           [later M05/M07] FFmpeg + BullMQ
│   │   ├── event-relay/            [later M09] outbox → Kafka
│   │   └── analytics-consumer/     [later M09] Kafka projections
│   └── packages/
│       ├── config/                 [M01] backend env validation
│       ├── database/               [M01] schema, migration and seed
│       ├── logger/                 [M01] JSON request logging
│       └── testing/                [later] shared fixtures/helpers, if needed
├── frontend/
│   └── apps/
│       └── web/                    [M01] Next.js user/admin web app
├── shared/
│   └── contracts/                  [M01] API schemas; event contracts added later
├── infra/
│   ├── compose/                    [M01] PostgreSQL + optional MinIO profile
│   ├── nginx/                      [later M08] load balancer and media edge
│   ├── kubernetes/                 [later M11] workloads, Ingress, HPA
│   ├── monitoring/                 [later M10] metrics, logs, traces
│   └── terraform/                  [later M12, optional] IaC
├── docs/
│   ├── architecture/               [M01] C4 context/container; expanded later
│   ├── adr/                        [M01] ADR-001; later ADRs added per milestone
│   ├── experiments/                [M01] benchmark/failure evidence; expanded later
│   ├── runbooks/                   [later M08+]
│   ├── postmortems/                [later M10]
│   └── superpowers/specs/          [M01] this specification
├── scripts/
│   ├── perf/                       [M01] event-loop baseline/demo
│   └── smoke/                      [later M11] deployment smoke checks
├── .github/workflows/              [M01] lint, typecheck, test, build
├── .env.example                    [M01] safe development defaults
├── biome.json                      [M01] formatter, linter, import sorting
├── Makefile                        [M01] local tasks
├── README.md                       [M01] setup and architecture overview
├── tsconfig.base.json              [M01] shared TypeScript strictness
├── package.json                    [M01] root workspace manifest
├── pnpm-workspace.yaml             [M01] workspace discovery
└── turbo.json                      [M01] task orchestration
```

Only the `[later]` leaf directories get `.gitkeep`; active directories hold their real files. The tree documents intended ownership without committing to detailed internal layouts or APIs for future milestones. `frontend` can import `shared/contracts` only; backend-specific config/database/logger are never imported into browser code.

---

## 3. Infrastructure & Storage (`infra/compose`)

### 3.1 Docker Compose Services
- **`postgres` (no profile; starts by default):** PostgreSQL 16, localhost-bound development port 5432, persistent named volume, and `pg_isready` healthcheck. Values are local-only and never production credentials.
- **`minio` (opt-in `storage-local` profile):** Local S3-compatible storage on localhost ports 9000/9001, persistent named volume, healthcheck, and local-only development credentials.
- **`createbuckets` (same `storage-local` profile):** One-shot MinIO client creates `streamflow-media-dev` idempotently after MinIO is healthy; a non-running optional service must not block Postgres-only startup.
- Compose service names and profiles are documented in the README. Do not expose DB or storage ports beyond the local machine in the development configuration.

### 3.2 Storage scope and provider selection
M01 verifies that PostgreSQL and optional MinIO can start and that the local bucket exists. The API does **not** upload, sign, fetch or serve media objects in M01; those operations and their MinIO/R2 interoperability tests belong to M04/M05. A configuration seam records the intended provider without constructing an unused S3 adapter.

- M01 has no active `STORAGE_PROVIDER` switch: only Postgres is required to serve the catalog. `make up-storage` explicitly starts MinIO with local-only credentials and `http://localhost:9000` for exploration.
- `.env.example` documents the future R2 settings (`STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET_NAME`, optional `STORAGE_PUBLIC_URL`) as commented examples. No storage provider is selected or initialized by the M01 API. When M04 activates storage operations, provider-specific config will be validated and R2 secrets will be supplied through an untracked `.env` or a secret store, never copied from another project or committed.
- M01 startup validates only consumed values (`DATABASE_URL`, API port and environment). No claim of R2 compatibility is made before an R2-specific integration test exists.
- R2 credentials and public delivery domains are distinct from the S3 API endpoint. Access control for all HLS manifests and segments is a later playback design decision, not implied by a configured public URL.

---

## 4. Shared & Backend Packages Specification

### 4.1 `shared/contracts` (`@streamflow/contracts`)
- Share only schemas used across the API/web boundary. Backend-only readiness and environment parsing stay in the backend.
- `MediaItem` for the public catalog: `{ id: string, type: 'AUDIO' | 'VIDEO', title: string, slug: string, durationMs: number | null }`. No internal `DRAFT` state or DB timestamps in the public DTO.
- `MediaListQuery`: optional `type` (`AUDIO` or `VIDEO`) and `limit` (integer 1–50, default 20); M01 returns a bounded list without a cursor. Cursor pagination is introduced in M02 when there is a realistic dataset and ordering policy to test.
- `MediaListResponse`: `{ items: MediaItem[] }`.

### 4.2 `backend/packages/config` (`@streamflow/config`)
- Exports a pure Zod parser for `NODE_ENV`, `PORT` (API 3000 by default), and required `DATABASE_URL`, called during API startup. Reject missing/malformed consumed values with clear diagnostics and no secrets in error output.
- Future storage configuration is documented in `.env.example`; no unused storage adapter or mandatory R2 credentials at M01 startup.

### 4.3 `backend/packages/database` (`@streamflow/database`)
- **ORM:** Drizzle ORM with `postgres` connection driver / pool.
- **Schema (`media` table):**
  - `id`: `uuid` (Primary Key, database-generated UUID).
  - `type`: enum (`AUDIO`, `VIDEO`).
  - `title`: `varchar(255)`, not null.
  - `slug`: `varchar(255)`, unique, not null.
  - `status`: enum (`DRAFT`, `READY`), default `'DRAFT'`.
  - `duration_ms`: `integer`, nullable.
  - `created_at`: `timestamp with time zone`, default `now()`, not null.
  - `updated_at`: `timestamp with time zone`, default `now()`, not null.
- **Indices:** unique `slug`; for M01's public catalog query add `(status, created_at DESC, id DESC)` to match filtering and deterministic ordering. Validate the index against EXPLAIN evidence rather than claiming a speedup without measurement.
- **Connection lifecycle:** the API owns a bounded pool and closes it on shutdown. A query used by readiness has a 2-second statement/connection deadline so dependency failure returns promptly.
- **Scripts:** `pnpm db:generate` generates reviewable SQL; `pnpm db:migrate` applies versioned migrations and succeeds on repeat runs; `pnpm db:seed` upserts ten synthetic metadata rows using stable slugs (5 audio, 5 video). Seed items marked `READY` are explicitly **metadata-only**, not playable: no media bytes or playback endpoint exists in M01.

### 4.4 `backend/packages/logger` (`@streamflow/logger`)
- Use NestJS/Fastify-compatible Pino integration with JSON output in all environments so experiments and CI can parse the same log structure. Pretty printing is an optional terminal view, not a different application log format.
- Generate a request ID per incoming request; accept an incoming `x-request-id` only after basic length/character validation, otherwise generate a new one. Include it in request-scoped logs and the response header. Never log credentials, tokens or full signed URLs.

---

## 5. Applications Specification

### 5.1 `backend/apps/api` (NestJS + Fastify)
- **Bootstrap:** `FastifyAdapter`, port 3000, graceful shutdown for `SIGINT`/`SIGTERM`. Attach `/v1` only to business routes; register `/health/*` and `/test/*` as unprefixed routes with explicit paths, avoiding accidental `/v1/health/*` routing.
- **`HealthModule` (backend-only response schemas):**
  - `GET /health/live`: Always `200 { "status": "ok", "uptime": number }` while the process can serve HTTP; no database/storage call.
  - `GET /health/ready`: `SELECT 1` on PostgreSQL with 2-second deadline; `200 { "status": "ready", "db": "connected" }` when available, otherwise `503 { "status": "degraded", "db": "disconnected" }`. Use an exception filter/response mechanism that actually preserves this 503 body in NestJS. MinIO/R2 are not readiness dependencies until a storage-dependent API is served.
- **`MediaModule`:** `GET /v1/media` validates `type` and `limit` using the shared query contract. Return only `READY` rows, ordered `(created_at DESC, id DESC)` with `{ items: [...] }`, maximum 50; omit internal state from each item. Invalid query returns 400; unavailable DB returns a controlled 503 without leaking query details. M01 is an unauthenticated metadata demo on localhost only; auth/publish rules arrive in M02. Do not expose this API or catalog publicly before M02 authorization/publishing rules exist.
- **`ExperimentsModule` (development only):** `GET /test/cpu-block` runs a synchronous 500ms loop solely for a controlled local demonstration. It is absent in production and CI release builds; it must never be routed from an externally reachable deployment.

### 5.2 `frontend/apps/web` (Next.js)
- **Framework:** Next.js App Router, TypeScript, Tailwind CSS. Pin compatible versions during implementation rather than treating the illustrative version number in earlier drafts as a hard requirement.
- **Media Catalog View:** Server-rendered fetch of `GET /v1/media` using a server-only API base URL (local API on port 3000; web on port 3001). Parse the response through `@streamflow/contracts`; no browser-side CORS or public API URL is required in M01.
- Render metadata-only audio/video cards without playback controls. Provide distinct loading, empty and API-error states; do not claim seeded rows can be played before assets and playback exist.

---

## 6. Code Quality with Biome (`biome.json`)

Root `biome.json` replaces Prettier and ESLint for supported source files:
- **Formatter:** 2-space indentation, semicolons, double quotes. Use recommended lint rules and import organization; review Next.js-specific compatibility rather than assuming all framework lint rules are provided by Biome.
- **Commands:** `pnpm format` writes formatting; `pnpm check` runs non-mutating Biome checks (format, lint and imports) for local verification and CI; `pnpm check:fix` writes safe fixes. `pnpm typecheck` runs TypeScript separately. Generated code, dependency folders and build outputs are excluded.

---

## 7. Testing Strategy & Educational Experiments

### 7.1 Testing Pyramid for M01
- **Unit (`vitest`):** Shared Zod query/response contracts and fail-fast environment parsing, including invalid input and missing `DATABASE_URL`.
- **Integration (`vitest` + Testcontainers):** Start an isolated PostgreSQL 16 container, run real migrations, seed fixtures, and test API endpoints using Fastify/Nest's HTTP injection or a compatible HTTP client. Check `GET /v1/media` filters DRAFT, respects type/limit/order, rejects invalid input; readiness returns 200 when DB is up and 503 after its connection is broken while liveness remains 200. Run migrations twice to prove repeatability. Tests must never use a Cloudflare bucket or credentials.
- **Web smoke test:** With API and database running, confirm rendered items plus empty and error states in a browser. Automate where practical; do not equate typechecking with UI verification.

### 7.2 Controlled Experiments
1. **Dependency failure:** With API running, stop the local Postgres container and record both health HTTP statuses and bodies; bring the DB back and verify readiness recovers. Do this only in an isolated local environment, never in CI's shared services.
2. **Event Loop:** Measure `/health/live` latency under a fixed local workload before and during a request to `/test/cpu-block`. Record p50/p95/p99, throughput, error rate, hardware and test settings; don't assert universal absolute latency thresholds. Remove the blocking work from the request path (or move it to a child/worker), rerun the same workload, and compare. Disable the test route for release builds.

---

## 8. Developer Workflow, Evidence & Acceptance Criteria

### 8.1 Commands and clean-machine setup
- Prerequisites: compatible Node.js, pnpm, Docker Engine/Compose; document supported versions and how to detect missing Docker access in README. Do not require Cloudflare credentials to run M01.
- From a clean checkout, `pnpm install` installs workspace dependencies; `make init` starts Postgres, waits for health, runs migrations and idempotent seed. `make dev` runs API (3000) and web (3001) via Turbo; `make up` starts **only** Postgres. Thus “one command to start local infrastructure” does not falsely promise installation and application startup in one step.
- When exercising MinIO, `make up-storage` enables the opt-in Compose profile and initializes the bucket. For R2 mode, run only Postgres locally and use untracked credentials when storage functionality arrives in M04.
- README documents these exact commands, health endpoints, test/lint/typecheck commands, expected `docker compose ps` services, sample response, troubleshooting and the distinction between metadata catalog and future playback.

### 8.2 Architecture documentation and CI
- `docs/architecture/` contains C4 context and container diagrams showing browser → web → API → PostgreSQL, with optional MinIO shown as **local-only, not connected to the M01 API**. Future worker/edge/event components are not deployed in M01.
- `docs/adr/001-modular-monolith.md` records context, alternatives, decision, consequences and measurable triggers for extracting worker/services.
- `.github/workflows/` runs non-mutating Biome check, TypeScript typecheck, unit + Testcontainers integration tests, and build on push/PR; fail on errors. CI runner must have Docker access for Testcontainers and must not require R2 secrets. Record one short working demo of catalog plus the health/failure experiments.

### 8.3 Definition of done
1. All 24-week target leaf directories exist in Git; future-stage leaves contain only `.gitkeep`, no unused package manifests or dependencies. FE imports only shared contracts, never backend-private packages.
2. Clean-checkout setup works as documented: install, `make init`, `make dev`; `make up-storage` separately starts and initializes local MinIO. Repeated migration/seed calls succeed.
3. Web renders seeded metadata; catalog filtering, validation, deterministic ordering, and loading/empty/error UI states are verified.
4. API logs JSON with bounded request IDs; `/health/live` stays 200 and `/health/ready` returns 503 when DB is unavailable, then recovers.
5. Unit/integration tests against real PostgreSQL, non-mutating Biome check, TypeScript typecheck, build and CI succeed. C4 diagrams, ADR-001, README, measured Event Loop experiment (with before/after mitigation), failure evidence and a short demo are present.

**Explicitly deferred:** user identity, upload, signed URLs, playable media, HLS, Redis/BullMQ/Kafka, replicas, Kubernetes and a verified Cloudflare R2 integration. Tracked directories are a navigation aid, not evidence that these services exist.
