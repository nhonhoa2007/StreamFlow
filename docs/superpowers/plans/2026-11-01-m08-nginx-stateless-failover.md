# StreamFlow M08 NGINX Load Balancing, Stateless API & First Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish an NGINX L7 load-balanced multi-replica deployment where 2+ stateless API instances serve traffic interchangeably, handle transparent upstream failover under traffic, and build from a minimal multi-stage Dockerfile.

**Architecture:** NGINX reverse proxy distributes client requests across two Fastify API replicas using round-robin with keepalive pooling and automatic `proxy_next_upstream` retry on connection error or 502/503. Authentication, sessions, and caching are entirely stateless with respect to the API processes (backed by PostgreSQL and Redis).

**Tech Stack:** NGINX 1.25 / Alpine, Docker, Docker Compose, NestJS 11, Fastify, JWT, PostgreSQL 16, Redis 7, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-m08-nginx-stateless-failover-design.md`

## Global Constraints

- NGINX must transparently retry failed upstream requests (`proxy_next_upstream error timeout http_502 http_503;`).
- API instances must be completely stateless: user sessions, tokens, and uploads must work across replicas without sticky sessions.
- Multi-stage Dockerfile must isolate build-time dependencies from the runtime image.
- Commits use Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. Stopping one API replica during active HTTP traffic must produce 0 failed 5xx requests to clients due to transparent NGINX next-upstream retry.
2. A JWT token or refresh session created on replica 1 must be immediately valid and operational on replica 2.
3. Proxy headers (`X-Request-ID`, `X-Forwarded-For`, `X-Forwarded-Proto`) must be correctly forwarded without stripping or spoofing.
4. NGINX keepalive connection pooling to upstreams must be configured to prevent TCP connection exhaustion.
5. Deployment and rollback procedures must provide a deterministic step-by-step runbook for staging releases.

---

### Task 1: NGINX Configuration & Proxy Headers

**Files:**
- Create: `infra/nginx/nginx.conf`
- Create: `infra/nginx/nginx.test.mjs`

- [ ] **Step 1: Write failing test verifying NGINX configuration syntax and directives**
In `infra/nginx/nginx.test.mjs`, assert `nginx.conf` contains `upstream api_cluster`, `proxy_next_upstream error timeout http_502 http_503`, `X-Request-ID`, `keepalive 32`, and passes `nginx -t` validation if NGINX binary is available.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test infra/nginx/nginx.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `infra/nginx/nginx.conf`**
Write NGINX reverse proxy configuration with upstream pooling, headers, keepalive, and failover directives.

- [ ] **Step 4: Run test to verify success**
Run: `node --test infra/nginx/nginx.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add infra/nginx/
git commit -m "feat(infra): add nginx reverse proxy configuration with keepalive and failover"
```

---

### Task 2: Multi-Stage Production Dockerfile

**Files:**
- Create: `infra/docker/api.Dockerfile`
- Create: `infra/docker/dockerfile.test.mjs`

- [ ] **Step 1: Write failing test for Dockerfile stages and directives**
In `dockerfile.test.mjs`, assert `api.Dockerfile` contains `FROM node:22-alpine AS base`, `FROM base AS builder`, `FROM base AS runner`, and sets `NODE_ENV=production`.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test infra/docker/dockerfile.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement multi-stage `infra/docker/api.Dockerfile`**
Create multi-stage Dockerfile compiling monorepo dependencies and emitting minimal runner image.

- [ ] **Step 4: Run test to verify success**
Run: `node --test infra/docker/dockerfile.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add infra/docker/
git commit -m "feat(infra): add multi-stage production dockerfile for api service"
```

---

### Task 3: Multi-Replica Stage B Compose Configuration

**Files:**
- Create: `infra/compose/compose.stage-b.yaml`
- Create: `infra/compose/compose-stage-b.test.mjs`

- [ ] **Step 1: Write failing test verifying Compose Stage B topology**
In `compose-stage-b.test.mjs`, parse YAML and assert services `nginx`, `api-1`, `api-2`, `postgres`, `redis`, `minio` exist and ports are properly mapped.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test infra/compose/compose-stage-b.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `infra/compose/compose.stage-b.yaml`**
Write Stage B Docker Compose manifest with 2 API replicas and NGINX gateway.

- [ ] **Step 4: Run test to verify success**
Run: `node --test infra/compose/compose-stage-b.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add infra/compose/
git commit -m "feat(infra): add stage-b docker compose manifest with 2 api replicas and nginx"
```

---

### Task 4: Stateless Cross-Replica Authentication & Integration

**Files:**
- Create: `backend/apps/api/test/stateless-failover.integration.test.ts`

- [ ] **Step 1: Write failing test for cross-replica stateless operations**
In `stateless-failover.integration.test.ts`:
1. Spin up two independent NestJS API app instances (`app1` and `app2`) connected to the same PostgreSQL and Redis.
2. Register and login via `app1`, receive access token and refresh cookie.
3. Call `GET /v1/auth/me` on `app2` with token from `app1` -> assert 200 OK with correct user profile.
4. Call `POST /v1/auth/refresh` on `app2` using cookie from `app1` -> assert 200 OK with rotated tokens.
5. Revoke session via `POST /v1/auth/logout` on `app1` -> assert session is revoked on `app2`.

- [ ] **Step 2: Run test to verify execution**
Run: `pnpm --filter @streamflow/api test test/stateless-failover.integration.test.ts`
Expected: PASS (or reveal any stateful process leaks).

- [ ] **Step 3: Commit**
```bash
git add backend/apps/api/test/stateless-failover.integration.test.ts
git commit -m "test(api): verify cross-replica stateless authentication and session rotation"
```

---

### Task 5: Failover Experiment Runner & Report

**Files:**
- Create: `scripts/perf/run-nginx-failover-experiment.mjs`
- Create: `docs/experiments/008-nginx-stateless-failover.md`

- [ ] **Step 1: Write experiment runner simulating upstream replica failover**
In `run-nginx-failover-experiment.mjs`:
1. Launches two HTTP servers representing `api-1` and `api-2`.
2. Spins up an upstream proxy or simulated round-robin pool with `next_upstream` retry.
3. Generates 100 RPS load.
4. Forcibly kills `api-1` midway through the test.
5. Asserts 100% of client requests succeed (0 failed 5xx errors) via automatic failover to `api-2`.
6. Prints latency distribution and failover report.

- [ ] **Step 2: Run experiment script to verify output**
Run: `node scripts/perf/run-nginx-failover-experiment.mjs`
Expected: PASS.

- [ ] **Step 3: Write experiment report**
Write `docs/experiments/008-nginx-stateless-failover.md` detailing failover metrics, zero-downtime observation, and cross-replica statelessness.

- [ ] **Step 4: Commit**
```bash
git add scripts/perf/ docs/experiments/
git commit -m "docs: add m08 nginx failover experiment runner and report"
```

---

### Task 6: Deployment Diagram, Runbook, ADR-008 & Acceptance

**Files:**
- Create: `docs/architecture/deployment.md`
- Create: `docs/runbooks/deployment-and-rollback.md`
- Create: `docs/adr/008-nginx-reverse-proxy-and-stateless-failover.md`
- Modify: `scripts/acceptance.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write failing acceptance test checking M08 deliverables**
In `scripts/acceptance.test.mjs`, assert `docs/adr/008-nginx-reverse-proxy-and-stateless-failover.md`, `docs/experiments/008-nginx-stateless-failover.md`, `docs/runbooks/deployment-and-rollback.md`, and `docs/architecture/deployment.md` exist.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement architecture docs, runbook, ADR-008, and update README**
Write C4 deployment diagram, deployment & rollback runbook, ADR-008, and update README.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All pass 100%.

- [ ] **Step 5: Commit**
```bash
git add docs/ scripts/ README.md
git commit -m "docs: add m08 deployment architecture, runbook, adr-008, and acceptance tests"
```
