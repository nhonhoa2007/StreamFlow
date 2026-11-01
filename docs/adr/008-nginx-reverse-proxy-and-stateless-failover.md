# ADR-008: NGINX Reverse Proxy, Stateless Architecture & Passive Failover

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

As user traffic expands, running a single API process creates a single point of failure (SPOF) and caps throughput at the capacity of a single Node.js event loop.

To achieve high availability and horizontal scalability, we need an architecture where multiple API instances can run in parallel. This requires resolving several distributed systems challenges:
1. **Load Balancing & Upstream Management:** Distributing incoming HTTP connections efficiently across backend replicas without TCP connection churn.
2. **Session & Authentication Affinity (Sticky Sessions vs. Stateless):** Evaluating whether clients must be pinned to a specific server instance.
3. **Failover & Zero-Downtime Resilience:** Ensuring unexpected container crashes or rolling deployment restarts do not drop client requests or return 502/503 errors.
4. **Header Transparency & Tracing:** Preserving true client IPs and distributed trace IDs across reverse proxy boundaries.

---

## Decision

We decide on an **NGINX L7 Reverse Proxy with Stateless API Replicas and Passive Failover**:

1. **Reverse Proxy & Upstream Pooling (`infra/nginx/nginx.conf`):**
   - Deploy NGINX as an edge reverse proxy fronting an upstream cluster (`api_cluster`) of 2+ API instances (`api-1:3000`, `api-2:3000`).
   - Enable HTTP/1.1 keepalive pooling (`keepalive 32`) to upstream servers to avoid TCP handshake overhead.
2. **Stateless API Design (No Sticky Sessions):**
   - The API is strictly stateless. Access tokens are cryptographic JWTs verified via `JWT_SECRET`.
   - Refresh token sessions are tracked centrally in PostgreSQL (`refresh_sessions`).
   - Catalog cache is centralized in Redis.
   - Any API replica can serve any request from any client at any time. Sticky sessions are rejected to enable perfect round-robin load distribution.
3. **Passive Health Checks & Transparent Failover:**
   - Configure NGINX with `proxy_next_upstream error timeout http_502 http_503;`.
   - If an API instance terminates, crashes, or returns 502/503, NGINX transparently retries the request against the next upstream replica within a 5-second window, delivering zero 5xx errors to the client.
4. **Transparent Proxy Headers:**
   - `X-Request-ID`: NGINX passes through existing client request IDs or generates a new UUID via `$request_id`.
   - `X-Forwarded-For`, `X-Forwarded-Proto`, and `Host` are forwarded to ensure logging and security auditing have accurate client context.
5. **Multi-Stage Containerization (`infra/docker/api.Dockerfile`):**
   - Separate build stages (base -> builder -> runner) ensure only compiled artifacts and production dependencies are deployed.

---

## Consequences

### Positive
- **High Availability:** The loss of any single API replica causes zero downtime for clients.
- **Horizontal Scalability:** Additional API replicas can be added to `api_cluster` without modifying client applications.
- **Performance:** Upstream keepalive connections reduce TCP latency and socket resource consumption on host servers.
- **Maintainability:** True statelessness eliminates complex sticky-session routing, cache affinity, and in-memory synchronization.

### Negative / Tradeoffs
- **NGINX OSS Passive Health Check Limitations:** Open-source NGINX detects upstream failures only when an actual client request fails (passive health check), unlike NGINX Plus which performs proactive out-of-band probe polling. Mitigated by low `proxy_connect_timeout (2s)` and instant `proxy_next_upstream` retry.
- **Idempotency Requirement for Retries:** Upstream retries on timeout or 502/503 apply to idempotent methods and safely retriable requests. Non-idempotent mutations rely on application-level idempotency keys (`idempotency_key` and OCC `expectedVersion`) to avoid duplicate execution.
- **Container Network Binding:** Fastify API server must bind to `0.0.0.0` within Docker containers rather than `127.0.0.1` to accept connections routed through the NGINX bridge network.
