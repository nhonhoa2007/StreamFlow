# Milestone 08 Specification: NGINX Load Balancing, Stateless API & First Deployment

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M08 (Weeks 15–16)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 08 transitions StreamFlow from a single-process API server into a horizontally scalable, multi-replica deployment fronted by an **NGINX L7 reverse proxy and load balancer**:

1. **Horizontal Scaling Behind NGINX (`infra/nginx/nginx.conf`):**
   - 2+ API replicas (`api-1`, `api-2`) pooled behind an NGINX upstream block with round-robin load distribution.
   - HTTP keepalive pooling (`keepalive 32`) between NGINX and upstream API replicas.
2. **Transparent Proxy Headers & Request Tracking:**
   - Ingestion and forwarding of `X-Request-ID` (preserving client-supplied IDs or generating NGINX `$request_id`).
   - Forwarding standard proxy headers: `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`.
3. **Stateless API Verification:**
   - Authentication relies strictly on asymmetric/symmetric JWT access tokens verified via shared `JWT_SECRET`.
   - Refresh token rotation and session revocation are centralized in PostgreSQL (`refresh_sessions`).
   - Cache-aside is centralized in Redis.
   - Clients can hit any API replica interchangeably without sticky sessions; cross-replica token validity is verified.
4. **Passive Health Checks & Transparent Failover:**
   - NGINX configured with `proxy_next_upstream error timeout http_502 http_503;`.
   - If an API instance terminates, crashes, or becomes unresponsive, NGINX transparently retries the request against the surviving replica, providing zero 5xx errors to the client.
5. **Multi-Stage Docker Architecture (`infra/docker/api.Dockerfile`):**
   - Multi-stage build (base -> builder -> production runner) minimizing production image footprint and isolating compile-time dependencies.
6. **Deployment Artifacts & Runbooks:**
   - C4 Deployment Diagram: `docs/architecture/deployment.md`.
   - Restart & Rollback Runbook: `docs/runbooks/deployment-and-rollback.md`.
   - Architecture Decision Record: `docs/adr/008-nginx-reverse-proxy-and-stateless-failover.md`.
   - Experiment Runner & Report: `scripts/perf/run-nginx-failover-experiment.mjs` and `docs/experiments/008-nginx-stateless-failover.md`.

---

## 2. Infrastructure Architecture & File Layout

### 2.1 File Map
- `infra/nginx/nginx.conf`: NGINX upstream, proxy headers, timeouts, and next-upstream failover.
- `infra/docker/api.Dockerfile`: Multi-stage production container build for the NestJS Fastify API.
- `infra/compose/compose.stage-b.yaml`: Local 2-replica API deployment with NGINX, PostgreSQL, Redis, and MinIO.
- `docs/architecture/deployment.md`: C4 deployment diagram and topology.
- `docs/runbooks/deployment-and-rollback.md`: Zero-downtime rolling restart, staging deployment, and rollback procedures.
- `docs/adr/008-nginx-reverse-proxy-and-stateless-failover.md`: ADR-008.
- `scripts/perf/run-nginx-failover-experiment.mjs`: Automated failover and stateless session validation runner.
- `docs/experiments/008-nginx-stateless-failover.md`: Experiment report.

---

## 3. NGINX Configuration Specification

### 3.1 Upstream Block
```nginx
upstream api_cluster {
    server api-1:3000 max_fails=3 fail_timeout=10s;
    server api-2:3000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}
```

### 3.2 Proxy & Failover Policy
```nginx
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Request-ID $request_id;

proxy_connect_timeout 2s;
proxy_read_timeout 10s;
proxy_send_timeout 10s;

# Transparent passive failover
proxy_next_upstream error timeout http_502 http_503;
proxy_next_upstream_tries 2;
proxy_next_upstream_timeout 5s;
```

---

## 4. Definition of Done

1. `infra/nginx/nginx.conf` created with upstream load balancing, proxy headers, keepalive, and passive failover.
2. `infra/docker/api.Dockerfile` created with clean multi-stage compilation.
3. `infra/compose/compose.stage-b.yaml` created declaring 2 API replicas behind NGINX.
4. Stateless authentication verified: login on replica A produces token accepted by replica B.
5. Failover experiment runner (`scripts/perf/run-nginx-failover-experiment.mjs`) demonstrates seamless failover under traffic when an instance stops.
6. Deployment diagram (`docs/architecture/deployment.md`) and Runbook (`docs/runbooks/deployment-and-rollback.md`) documented.
7. ADR-008 written and committed.
8. Acceptance tests updated in `scripts/acceptance.test.mjs` and 100% passing.
