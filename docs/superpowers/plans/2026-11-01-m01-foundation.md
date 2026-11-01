# StreamFlow M01 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable metadata-only StreamFlow catalog across PostgreSQL, NestJS/Fastify and Next.js, while tracking the entire 24-week directory map.

**Architecture:** One pnpm/Turbo workspace with separate `backend/`, `frontend/` and `shared/` roots. Only M01 components have code or package manifests; future leaves contain `.gitkeep`. The API is a modular monolith; optional local MinIO is isolated from the M01 request path.

**Tech Stack:** pnpm 10, Turbo, TypeScript, Biome, NestJS/Fastify, Next.js, Zod, PostgreSQL 16, Drizzle + postgres.js, Vitest, Testcontainers, Docker Compose, Pino.

**Spec:** `docs/superpowers/specs/2026-11-01-m01-foundation-design.md`

## Global Constraints

- Create all later-stage leaf directories in the spec tree, tracked with `.gitkeep` only; do not create future package manifests, code or dependencies.
- Backend packages are private to backend; frontend imports only `@streamflow/contracts`. API and web use ports 3000 and 3001 on localhost.
- M01 has no upload, playback, media bytes, R2 access or active storage-provider switch. MinIO runs only through `storage-local`; no CI/R2 credentials.
- Public catalog returns only READY metadata, `type` optional, `limit` 1–50 default 20, ordered `created_at DESC, id DESC`, response `{ items: MediaItem[] }`; no cursor until M02.
- Health: live `200 {status:"ok",uptime:number}` without DB access; ready `200 {status:"ready",db:"connected"}` or `503 {status:"degraded",db:"disconnected"}` with a two-second DB deadline.
- JSON request logs in every environment; validated/bounded `x-request-id`; no secrets in logs. Experiment route is development-only, never deployed publicly.
- Biome replaces Prettier/ESLint; `pnpm check` is read-only. Root TS config shares strictness, but Node/Next have separate module-resolution settings.
- Do not commit or push unless explicitly requested. When authorized, use one short English Conventional Commit subject, no body or attribution.

## Review Focus

1. A malformed or huge incoming `x-request-id` must be replaced with a bounded generated ID, not echoed into logs/responses (Task 4 test).
2. A Postgres outage that occurs **after startup** must return readiness 503 promptly while liveness stays 200, then recover (Task 4 test).
3. Malformed `type`/`limit`, repeated parameters, or `limit=0/51` must yield 400 rather than ambiguous coercion (Tasks 2 and 5 tests).
4. Running migrations and seed twice must not duplicate data or fail; DRAFT items must not leak (Tasks 3 and 5 tests).
5. A web fetch that fails or returns invalid JSON must show the error state without leaking backend diagnostics (Task 6 test).

---

## File Map

- Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `biome.json`, `Makefile`, `.env.example`, `.gitignore`: scripts, workspace/tooling, safe setup; no app implementation.
- `infra/compose/compose.yaml`: isolated local Postgres, optional MinIO and bucket-init; `scripts/check-layout.mjs` and `scripts/check-layout.test.mjs`: scaffold assertions executable with Node's built-in test runner before installation.
- `backend/apps/{media-worker,event-relay,analytics-consumer}`, `backend/packages/testing`, `infra/{nginx,kubernetes,monitoring,terraform}`, `docs/{runbooks,postmortems}`, `scripts/smoke`: future `.gitkeep` leaves per spec (not under active API). Do not put `.gitkeep` in the active `backend/apps/api`.
- `shared/contracts/src/media.ts`: input/output schemas/types for catalog; `src/media.test.ts` tests them. Export through `src/index.ts`; a `media.ts` test ensures internal fields are stripped from public DTOs.
- `backend/packages/config/src/index.ts`: `parseApiEnv(source: NodeJS.ProcessEnv): ApiEnv`; `src/index.test.ts` tests missing/malformed inputs.
- `backend/packages/database/src/schema.ts`: Drizzle media table and enum; `src/client.ts`: `createDatabase(url: string): DatabaseHandle`; `src/media-repository.ts`: catalog query; `src/migrate.ts` and `src/seed.ts`: repeatable commands; `drizzle/`: reviewed SQL migration; `test/database.integration.test.ts`: Testcontainers.
- `backend/packages/logger/src/index.ts`: Fastify/Nest-compatible request ID generation, Pino JSON configuration; unit tests in `src/index.test.ts`.
- `backend/apps/api/src/main.ts`, `app.module.ts`, `health/*`, `media/*`, `experiments/*`: bootstrap, probes, catalog and local-only exercise; `test/api.integration.test.ts`: Testcontainers HTTP tests.
- `frontend/apps/web/src/app/{page.tsx,loading.tsx,globals.css,layout.tsx}` and `src/components/catalog.tsx`, `src/lib/media-api.ts`, `src/lib/media-api.test.ts`: server-side API fetch, cards and states.
- `scripts/perf/`: repeatable local benchmark; `docs/experiments/`: measured evidence; `docs/architecture/{context,container}.md`, `docs/adr/001-modular-monolith.md`, `.github/workflows/ci.yml`, `README.md`: architecture and verification artifacts.

### Task 1: Workspace, directory map and local dependencies

**Files:** Create root manifests/config, Compose and Makefile from File Map; create `.gitkeep` in future-stage leaf directories; modify `.gitignore` for generated output and local `.env`. Test: `scripts/check-layout.test.mjs` using Node's built-in test runner.

**Interfaces:** Produces root scripts `dev`, `build`, `test`, `typecheck`, `check`, `check:fix`, `format`, `db:migrate`, `db:seed`; Make targets `up`, `up-storage`, `init`, `dev`. Only folders with real packages become pnpm workspaces.

- [ ] **Step 1: Write failing structure test.** Assert all spec-listed future leaves exist and contain only `.gitkeep`; check root workspace patterns include BE apps/packages, FE apps, shared contracts; assert no package manifest in future leaves.
- [ ] **Step 2: Run test before scaffold.** `node --test scripts/check-layout.test.mjs`; expect missing files/paths.
- [ ] **Step 3: Create scaffold.** Configure Turbo dev persistent/no cache, build/typecheck/test dependency graph and root-only read-only Biome check; root Make targets: `up` starts only Postgres, `up-storage` starts MinIO + idempotent bucket init, `init` waits for Postgres health then runs migrations and seed, `dev` starts API/web. Compose binds ports to `127.0.0.1`, stores named volumes, and gives bucket-init the `storage-local` profile. `.env.example` documents `DATABASE_URL` and commented future R2 keys; no real secrets.
- [ ] **Step 4: Verify.** Run `node --test scripts/check-layout.test.mjs` and `docker compose -f infra/compose/compose.yaml config --services`; expect PASS/config valid and default service list contains `postgres` but not `minio`/`createbuckets`. Verify `--profile storage-local config --services` includes both optional services.

### Task 2: Shared catalog contracts and API configuration

**Files:** Create `shared/contracts/package.json`, `src/{index,media,media.test}.ts`; `backend/packages/config/package.json`, `src/{index,index.test}.ts`; scoped TS configs.

**Interfaces:** `MediaListQuerySchema` parses optional `type: "AUDIO"|"VIDEO"` and `limit: number` (default 20, 1–50); `MediaItemSchema`/`MediaListResponseSchema`; `parseApiEnv(source: NodeJS.ProcessEnv): ApiEnv` returns typed `NODE_ENV`, `PORT`, `DATABASE_URL`. Schema parser rejects repeated/array query values.

- [ ] **Step 1: Write failing tests.** Defaults: `{}` → `{limit:20}`; `type=VIDEO&limit=50` passes; invalid type, `limit=0`, `limit=51`, decimal/non-numeric, repeated limit reject. Media response exposes exactly `id`, `type`, `title`, `slug`, `durationMs` and strips internal `status`/timestamps; an invalid item fails. Config missing/invalid DB URL fails without echoing its value; `PORT=3000` passes and invalid port fails.
- [ ] **Step 2: Run targeted tests.** `pnpm --filter @streamflow/contracts test && pnpm --filter @streamflow/config test`; expect FAIL before implementation.
- [ ] **Step 3: Implement exports.** Zod input schema handles HTTP strings; config parses env only at API bootstrap, not at import time. Never expose backend config to web.
- [ ] **Step 4: Verify targeted tests and typecheck.** Expect PASS and no TS errors in either package.

### Task 3: PostgreSQL schema, repeatable migration/seed and repository

**Files:** Create `backend/packages/database/package.json`, `drizzle.config.ts`, `src/{schema,client,media-repository,migrate,seed}.ts`, reviewed migration in `drizzle/`, `test/database.integration.test.ts`.

**Interfaces:** `createDatabase(url: string): DatabaseHandle` provides `{db, close():Promise<void>, checkConnection():Promise<boolean>}`; `listReadyMedia(db, query: MediaListQuery): Promise<MediaItem[]>`. Export the DB schema/types only to backend. `DATABASE_URL` is supplied explicitly to scripts/tests.

- [ ] **Step 1: Write failing Testcontainers test.** On isolated PostgreSQL 16, run migration twice, seed twice; verify 10 synthetic rows with stable slugs, 5 AUDIO/5 VIDEO; DRAFT fixture excluded, READY items sorted by `(created_at DESC,id DESC)`; limit and type filter work. Check connection helper returns false within deadline on a broken connection and closes resources.
- [ ] **Step 2: Run isolated test.** `pnpm --filter @streamflow/database test:integration`; expect FAIL before table/scripts exist.
- [ ] **Step 3: Implement minimal schema and repository.** PostgreSQL enums, DB-generated UUID, `slug` unique, `(status,created_at DESC,id DESC)` index, `max` bounded pool, two-second connection/query deadline for health. Seed upserts by slug. Keep migration SQL checked in; do not replace reviewable migrations with schema push.
- [ ] **Step 4: Verify integration test and run `EXPLAIN` against representative catalog query.** Expect PASS, repeatable migration/seed, correct index availability; document query-plan observations without asserting an unmeasured speedup.

### Task 4: Fastify API bootstrap, health and request logging

**Files:** Create `backend/packages/logger/src/{index,index.test}.ts` and package manifest; `backend/apps/api/package.json`, `src/{main,app.module}.ts`, `src/health/*`, `test/api.integration.test.ts`.

**Interfaces:** `buildApp(config: ApiEnv, database: DatabaseHandle): Promise<INestApplication>` for tests/bootstrap; `HealthController` exposes `/health/live` and `/health/ready`; JSON logger accepts or replaces request IDs and includes response header.

- [ ] **Step 1: Write failing tests.** Request without header gets UUID; valid bounded ID round-trips to response/log, overlong/control-character ID is replaced. Health live does not query DB; readiness returns exact 200/503 bodies with interrupted DB and recovers afterward; error contains no DB credentials. Exercise real HTTP using Fastify adapter and Testcontainers database.
- [ ] **Step 2: Run logger unit + API integration tests.** Expect FAIL before controller/bootstrap exist.
- [ ] **Step 3: Implement app lifecycle.** Attach request ID at Fastify request boundary, JSON Pino and Nest adapter; API binds localhost in dev and closes DB pool on shutdown. Keep operational routes outside `/v1` without relying on a global prefix. Set explicit 503 response body and timeout.
- [ ] **Step 4: Verify targeted tests.** Expect PASS and valid parseable JSON logs; ensure `pnpm --filter @streamflow/api build` succeeds.

### Task 5: Catalog endpoint and dev-only CPU experiment

**Files:** Create `backend/apps/api/src/media/{media.module,media.controller,media.service}.ts`, `src/experiments/{experiments.module,experiments.controller}.ts`; extend `test/api.integration.test.ts`.

**Interfaces:** `GET /v1/media` uses `MediaListQuerySchema`, `listReadyMedia`, `MediaListResponseSchema`; `GET /test/cpu-block` exists only in development and never in production/release bootstrap.

- [ ] **Step 1: Write failing HTTP tests.** Ready rows only; predictable order/type/limit, 400 for invalid/repeated params; DB error returns 503 without SQL details; `GET /v1/health/live` 404; CPU route available in development but 404 when `NODE_ENV=production` (and in CI release build). Ensure API binds only to `127.0.0.1` in local mode.
- [ ] **Step 2: Run API integration tests.** Expect FAIL on missing routes.
- [ ] **Step 3: Implement minimal modules.** No playback controls or storage access; CPU loop runs 500ms only in dev (local-only bind). Avoid changing liveness readiness behavior.
- [ ] **Step 4: Verify HTTP tests, dev/release route absence and build.** Expect PASS; do not measure local timing as a CI test.

### Task 6: Next.js catalog and observable UI states

**Files:** Create `frontend/apps/web/package.json`, `tsconfig.json`, `next.config.ts`, `src/app/{page,loading,layout}.tsx`, `src/app/globals.css`, `src/components/catalog.tsx`, `src/lib/{media-api,media-api.test}.ts`; add `src/app/error.tsx` only if using Next error boundary for fetch errors.

**Interfaces:** `fetchMedia(baseUrl: string): Promise<MediaListResponse>` runs on server using `MediaListResponseSchema`, no public API key; page renders cards, empty/error/loading states without playback UI. Web listens at localhost:3001.

- [ ] **Step 1: Write failing fetch/UI tests.** Valid `{items:[...]}` renders metadata; empty shows a useful message; HTTP 503, network failure and invalid JSON show a safe error state (never raw backend details). Test fetch parser and components with a compatible renderer.
- [ ] **Step 2: Run web tests.** `pnpm --filter @streamflow/web test`; expect FAIL before components exist.
- [ ] **Step 3: Implement page and states.** Server-only API URL defaults to localhost:3000 in dev; no browser CORS requirement. Use `loading.tsx` for pending navigation and a safe error component/boundary for failed fetches.
- [ ] **Step 4: Verify tests/build and browser.** With `make init` and `make dev` running, inspect normal catalog, empty (isolated fixture DB), API-down error and loading; verify visual states and browser console. Record any state that cannot be exercised.

### Task 7: Experiments, docs, CI and final acceptance

**Files:** Create `scripts/perf/` runner, `docs/experiments/` report, `docs/architecture/{context,container}.md`, `docs/adr/001-modular-monolith.md`, `.github/workflows/ci.yml`, `README.md`; adjust Makefile/root scripts as needed.

**Interfaces:** `make init` and `make dev` are the documented clean-checkout entry points; CI runs `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build` with Docker available for Testcontainers. No cloud secrets.

- [ ] **Step 1: Add failing acceptance/smoke checks.** Assert README commands exist, Compose default/profile behavior, C4 diagrams and ADR-001, CI commands, and release route absence. Benchmark runner captures baseline/blocking/mitigated p50/p95/p99, throughput, errors and machine/workload settings; tests validate its output format rather than absolute latency.
- [ ] **Step 2: Run smoke checks and non-mutating code checks; expect failures** until docs/CI/perf runner exist.
- [ ] **Step 3: Implement docs and experiments.** C4 shows metadata path and disconnected optional MinIO; ADR records rationale, tradeoffs, extraction triggers; README provides exact setup/recovery steps. Benchmark only on local controlled services; replace blocking route work with a non-blocking/worker alternative for comparison while retaining an explicit dev-only blocking scenario.
- [ ] **Step 4: Verify clean-checkout sequence and CI-equivalent checks.** `pnpm install`, `make init`, `make dev`, `make up-storage`, `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`; confirm MinIO bucket, migrations/seed repetition, JSON logs, frontend browser states, failure/recovery, experiment evidence and short demo. If Docker/CI/network unavailable, report precise unverified items instead of claiming completion.

No task includes a commit step: commits require the user's separate explicit request.
