# ADR-010: Observability Strategy, Service Level Objectives (SLOs) & Chaos Engineering

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

As StreamFlow scales across multiple containerized replicas and asynchronous worker processes (BullMQ, Kafka), black-box operation becomes a major liability:
1. When latency spikes or 5xx errors occur, engineers need immediate visibility into whether the bottleneck is CPU, database pool exhaustion, or external storage.
2. Inadvertent logging of user credentials, bearer tokens, or presigned S3 URLs poses severe security and compliance risks.
3. Without explicit Service Level Objectives (SLOs) and Service Level Indicators (SLIs), alerting is either noisy or delayed.
4. Without deliberate chaos failure injection, fail-open fallbacks and queue recovery mechanisms decay over time.

---

## Decision

We establish a comprehensive **Observability and Chaos Engineering Architecture**:

1. **Prometheus Exposition Endpoint (`GET /metrics`):**
   - The API exposes a standard Prometheus scrape endpoint collecting:
     - **RED Metrics:** `http_requests_total` (counter) and `http_request_duration_seconds` (histogram).
     - **USE Metrics:** `db_pool_connections_active` and `db_pool_connections_idle` (gauges).
2. **Service Level Objectives (SLOs):**
   - **Availability:** 99.5% successful requests (HTTP status < 500) calculated over 30-day rolling windows.
   - **Latency:** 95% of catalog requests served in under 500ms (`p95 < 500ms`).
   - **Error Budget:** If 5xx error rate exceeds 1% over 5 minutes, an immediate SEV-2 alert is dispatched.
3. **Strict Credential & Secret Log Redaction:**
   - `@streamflow/logger` is configured with deterministic path masking (`password`, `token`, `secret`, `authorization`, `cookie`, `jwt`).
   - S3 presigned URLs are sanitized to mask `X-Amz-Signature` and credential tokens before writing to stdout.
4. **Monitoring & Alerting Manifests (`infra/monitoring/`):**
   - Prometheus scrape config (`prometheus.yml`), alert rules (`alerts.yml`), and Grafana dashboard (`streamflow-overview.json`) are version-controlled in the repository.
5. **Chaos Testing & Blameless Postmortems:**
   - Resiliency under component failure is validated through automated chaos drills (Redis outage, media worker crash, database pool saturation).
   - Any degradation resulting in client impact requires a blameless postmortem in `docs/postmortems/` within 48 hours.

---

## Consequences

### Positive
- **Rapid Incident Triage:** Correlated RED and USE metrics enable on-call engineers to pinpoint bottlenecks within seconds.
- **Security Compliance:** Automated log redaction eliminates the risk of credential leakage in centralized log aggregators.
- **Continuous Resilience Validation:** Automated chaos tests verify that fail-open fallbacks and recovery mechanisms function before real production outages occur.

### Negative / Tradeoffs
- **Metrics Memory Overhead:** In-memory tracking of request durations and histogram buckets consumes a small slice of Node.js heap.
- **Alert Tuning Effort:** Static latency thresholds may require adjustment as catalog size and media traffic grow.
