# StreamFlow M10 Observability, Resiliency, Chaos Exercises & Postmortems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish production observability with Prometheus metrics and Grafana dashboards, guarantee sensitive log redaction, document three formal chaos postmortems, create an incident response runbook, and verify resilience under simulated failures.

**Architecture:** API exposes a standard `GET /metrics` endpoint exporting RED (Rate, Errors, Duration) and USE (Utilization, Saturation, Errors) signals. Structured logging enforces strict redaction of credentials. Prometheus scrape configs, alerting rules, and Grafana dashboard JSON are maintained in `infra/monitoring/`. Three chaos failure modes are documented and validated via an automated experiment runner.

**Tech Stack:** Prometheus, Grafana, OpenTelemetry, NestJS 11, Fastify, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-m10-observability-resiliency-chaos-design.md`

## Global Constraints

- `GET /metrics` must output standard Prometheus text format with type declarations and valid metric names.
- Logging must strictly sanitize sensitive fields (passwords, tokens, authorization headers, presigned S3 signatures).
- Postmortems must follow the blameless engineering standard: Timeline, Impact, Root Cause, Trigger, Detection, and Action Items.
- Commits use Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. `GET /metrics` must export correct request counts, latencies, and active connection gauges without runtime crashes.
2. Logging payloads containing `password`, `token`, or `X-Amz-Signature` must be masked before outputting to streams.
3. Chaos exercise 1 (Redis outage) must confirm fail-open graceful degradation to DB without 500 errors.
4. Chaos exercise 2 (Worker crash) must confirm queue backlog accumulates safely and drains cleanly on recovery.
5. Chaos exercise 3 (DB saturation) must confirm `/health/ready` immediately reports 503 and protects the service from cascading failures.

---

### Task 1: Prometheus Metrics Module & GET /metrics in API

**Files:**
- Create: `backend/apps/api/src/metrics/metrics.service.ts`
- Create: `backend/apps/api/src/metrics/metrics.controller.ts`
- Create: `backend/apps/api/src/metrics/metrics.module.ts`
- Modify: `backend/apps/api/src/app.module.ts`
- Create: `backend/apps/api/test/metrics.integration.test.ts`

**Interfaces:**
- Produces: `GET /metrics` returning Prometheus format metrics including `http_requests_total`, `http_request_duration_seconds`, and connection gauges.

- [ ] **Step 1: Write failing test for GET /metrics**
In `backend/apps/api/test/metrics.integration.test.ts`:
Query `GET /metrics`. Assert 200 OK with `text/plain` content type, containing `# HELP http_requests_total`, `http_requests_total`, and `db_pool_connections_active`.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test test/metrics.integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement MetricsModule and interceptor**
Create `MetricsService` collecting in-memory metrics and formatting Prometheus output. Create `MetricsController` and wire in `AppModule`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/api test test/metrics.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/apps/api/
git commit -m "feat(api): implement prometheus metrics module and /metrics endpoint"
```

---

### Task 2: Sensitive Data & Secret Log Redaction

**Files:**
- Modify: `backend/packages/logger/src/index.ts`
- Modify: `backend/packages/logger/src/index.test.ts`

**Interfaces:**
- Produces: `createLogger({ redact: [...] })` masking `password`, `token`, `secret`, `authorization`, `cookie`, `jwt`, and S3 presigned signature parameters.

- [ ] **Step 1: Write failing test for log redaction**
In `backend/packages/logger/src/index.test.ts`:
Log an object containing `password: "my-secret-password"`, `authorization: "Bearer xyz123"`, and a URL with `X-Amz-Signature=secret123`. Assert output string masks these sensitive values with `[REDACTED]`.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/logger test`
Expected: FAIL.

- [ ] **Step 3: Implement redaction in Pino logger configuration**
Configure Pino redaction paths and URL sanitizer in `backend/packages/logger/src/index.ts`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/logger test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/packages/logger/
git commit -m "feat(logger): add sensitive credential and presigned url redaction"
```

---

### Task 3: Monitoring Infrastructure (Prometheus, Alerts & Grafana)

**Files:**
- Create: `infra/monitoring/prometheus.yml`
- Create: `infra/monitoring/alerts.yml`
- Create: `infra/monitoring/dashboards/streamflow-overview.json`
- Create: `infra/monitoring/monitoring.test.mjs`

**Interfaces:**
- Produces: Prometheus scraper config, alert rules, and Grafana dashboard JSON.

- [ ] **Step 1: Write failing test for monitoring configs**
In `infra/monitoring/monitoring.test.mjs`:
Assert `prometheus.yml`, `alerts.yml`, and `streamflow-overview.json` exist, have valid YAML/JSON, and contain expected alert expressions and panels.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test infra/monitoring/monitoring.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement monitoring manifests**
Write `prometheus.yml`, `alerts.yml`, and `streamflow-overview.json`.

- [ ] **Step 4: Run test to verify success**
Run: `node --test infra/monitoring/monitoring.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add infra/monitoring/
git commit -m "feat(infra): add prometheus scrape config, alerting rules, and grafana dashboard"
```

---

### Task 4: Three Production Chaos Postmortems

**Files:**
- Create: `docs/postmortems/001-redis-outage-cache-degradation.md`
- Create: `docs/postmortems/002-transcode-worker-backlog-and-recovery.md`
- Create: `docs/postmortems/003-database-saturation-and-readiness-tripping.md`

- [ ] **Step 1: Write Postmortem 001: Redis Outage**
Document Timeline, Impact, Root Cause, Trigger, Detection, and Corrective Actions for fail-open cache degradation.

- [ ] **Step 2: Write Postmortem 002: Worker Backlog**
Document Timeline, Impact, Root Cause, and Recovery for media worker downtime and BullMQ queue draining.

- [ ] **Step 3: Write Postmortem 003: Database Saturation**
Document Timeline, Impact, Root Cause, and Prevention for connection pool exhaustion and readiness probe tripping.

- [ ] **Step 4: Commit**
```bash
git add docs/postmortems/
git commit -m "docs: add postmortems for redis outage, worker backlog, and db saturation"
```

---

### Task 5: Incident Response Runbook

**Files:**
- Create: `docs/runbooks/incident-response.md`

- [ ] **Step 1: Implement Incident Response Runbook**
Write on-call triage procedures, severity matrix (SEV-1 to SEV-3), golden signals diagnostic flows, and mitigation steps.

- [ ] **Step 2: Commit**
```bash
git add docs/runbooks/incident-response.md
git commit -m "docs: add on-call incident response and golden signals triage runbook"
```

---

### Task 6: Chaos Experiment Runner, ADR-010 & Acceptance

**Files:**
- Create: `scripts/perf/run-chaos-resiliency-experiment.mjs`
- Create: `docs/experiments/010-chaos-and-observability.md`
- Create: `docs/adr/010-observability-slo-and-chaos-engineering.md`
- Modify: `scripts/acceptance.test.mjs`
- Modify: `scripts/check-layout.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write failing acceptance test checking M10 deliverables**
In `scripts/acceptance.test.mjs`, assert ADR-010, 3 postmortems, incident runbook, experiment 010 report, and runner exist.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement experiment runner, ADR-010, and update README**
Write `run-chaos-resiliency-experiment.mjs`, `010-chaos-and-observability.md`, `010-observability-slo-and-chaos-engineering.md`. Update `check-layout.test.mjs` (remove `monitoring` and `postmortems` from future leaves) and update `README.md`.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All pass 100%.

- [ ] **Step 5: Commit**
```bash
git add scripts/ docs/ README.md
git commit -m "docs: add m10 chaos experiment, adr-010, and acceptance tests"
```
