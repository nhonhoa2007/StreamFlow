# Milestone 10 Specification: Observability, Resiliency, Chaos Exercises & Postmortems

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M10 (Weeks 19–20)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 10 establishes production-grade observability, reliability engineering, and chaos testing across all StreamFlow services:

1. **Prometheus Metrics Endpoint (`GET /metrics`):**
   - Standard Prometheus exposition format for scraping by Prometheus/OpenTelemetry agents.
   - **RED Method (Requests, Errors, Duration):**
     - `http_requests_total{method, route, status}`: Counter of all HTTP requests.
     - `http_request_duration_seconds{method, route}`: Histogram tracking request duration percentiles (p50, p95, p99).
   - **USE Method (Utilization, Saturation, Errors):**
     - `db_pool_connections_active`, `db_pool_connections_idle`: PostgreSQL connection pool saturation.
     - `transcode_queue_waiting_jobs`, `transcode_queue_active_jobs`: BullMQ queue lag and backlog depth.
     - `outbox_events_pending_count`: Transactional outbox relay lag.
2. **Distributed Tracing & Log Correlation:**
   - Propagation of unified `traceId` / `requestId` across HTTP Fastify layer, BullMQ job payload, and Kafka event headers.
   - Structured logging via `@streamflow/logger` with guaranteed sanitization and redaction of sensitive credentials (`password`, `authorization`, `token`, `secret`, AWS presigned query parameters).
3. **Monitoring Infrastructure (`infra/monitoring/`):**
   - `infra/monitoring/prometheus.yml`: Scrape targets configuration with 15s interval.
   - `infra/monitoring/alerts.yml`: Prometheus alert rules for high p95 latency (>500ms for 5m), high 5xx rate (>1% over 5m), database pool saturation (>85%), and transcode queue backlog (>50 jobs for 10m).
   - `infra/monitoring/dashboards/streamflow-overview.json`: Complete Grafana dashboard definition visualizing RED & USE golden signals.
4. **Three Chaos Exercises & Formal Postmortems (`docs/postmortems/`):**
   - **Chaos 1:** Redis outage -> Cache-aside gracefully degrades to PostgreSQL; API availability stays 100%. (Documented in `001-redis-outage-cache-degradation.md`).
   - **Chaos 2:** Media worker failure -> Uploads and enqueues continue unhindered; queue depth grows; worker restart drains backlog cleanly without partial publications. (Documented in `002-transcode-worker-backlog-and-recovery.md`).
   - **Chaos 3:** PostgreSQL connection exhaustion -> `/health/ready` probe trips to 503 within 3s; NGINX proxy sheds traffic; API protects itself from cascading crash. (Documented in `003-database-saturation-and-readiness-tripping.md`).
5. **Incident Response Runbook:**
   - `docs/runbooks/incident-response.md`: Operational triage, golden signal diagnosis, and remediation playbook for on-call engineers.
6. **Architecture Decision Record (ADR-010):**
   - `docs/adr/010-observability-slo-and-chaos-engineering.md`: Architectural decisions covering SLIs, SLOs, log sanitization, and chaos verification.
7. **Automated Chaos Verification Runner & Report:**
   - `scripts/perf/run-chaos-resiliency-experiment.mjs` & `docs/experiments/010-chaos-and-observability.md`.

---

## 2. Metrics Specification

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status` | Total HTTP requests handled |
| `http_request_duration_seconds` | Histogram | `method`, `route` | Latency distribution of HTTP requests |
| `db_pool_connections_active` | Gauge | - | Number of active PostgreSQL connections |
| `db_pool_connections_idle` | Gauge | - | Number of idle PostgreSQL connections |
| `transcode_queue_waiting_jobs` | Gauge | `queue` | Number of transcode jobs waiting in queue |
| `transcode_queue_active_jobs` | Gauge | `queue` | Number of transcode jobs currently processing |
| `outbox_events_pending_count` | Gauge | - | Number of pending un-relayed outbox events |

---

## 3. Log Redaction Rules

Logger must automatically redact or mask:
- Field names matching: `password`, `token`, `secret`, `authorization`, `cookie`, `jwt`.
- Values matching URL query parameters: `X-Amz-Signature`, `X-Amz-Credential`, `X-Amz-Security-Token`.

---

## 4. Definition of Done

1. `GET /metrics` endpoint implemented in API emitting standard Prometheus metrics.
2. Log redaction verified: sensitive passwords, tokens, and query credentials never leak to log streams.
3. `infra/monitoring/prometheus.yml`, `infra/monitoring/alerts.yml`, and `infra/monitoring/dashboards/streamflow-overview.json` created.
4. Three postmortems created in `docs/postmortems/`:
   - `001-redis-outage-cache-degradation.md`
   - `002-transcode-worker-backlog-and-recovery.md`
   - `003-database-saturation-and-readiness-tripping.md`
5. `docs/runbooks/incident-response.md` created.
6. `docs/adr/010-observability-slo-and-chaos-engineering.md` created.
7. `scripts/perf/run-chaos-resiliency-experiment.mjs` and `docs/experiments/010-chaos-and-observability.md` created.
8. Acceptance tests in `scripts/acceptance.test.mjs` and layout checks pass 100%.
