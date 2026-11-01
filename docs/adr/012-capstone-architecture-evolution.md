# ADR-012: Capstone Architecture Evolution & System Retrospective (v1 to v4)

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

StreamFlow was engineered across a 24-week curriculum to serve as a comprehensive, production-grade engineering laboratory for backend architecture, distributed systems, high availability, and reliability engineering. Starting from an empty repository, the platform evolved systematically across four architectural maturity tiers:

1. **Level 1 — Modular Monolith Foundation (Milestones 01–04):**
   - Established strict boundary isolation (`pnpm` workspaces + Turborepo).
   - Identity, RBAC, and Keyset cursor pagination (eliminating deep `OFFSET` scanning).
   - Optimistic Concurrency Control (OCC) and monotonic playback telemetry.
   - Direct-to-storage presigned uploads eliminating backend process memory bloat.
2. **Level 2 — Asynchronous Media & Cache Tuning (Milestones 05–07):**
   - FFmpeg non-upscaling ABR transcoding ladder (1080p to 360p) with master playlist generation.
   - Redis Cache-Aside with **Singleflight in-flight deduplication** and TTL jitter, eliminating cache stampedes.
   - Autonomous BullMQ worker process with bounded concurrency, retry jitter, poison message quarantine, and atomic output publication.
3. **Level 3 — Distributed Runtime & Observability (Milestones 08–10):**
   - Multi-replica stateless API deployment fronted by NGINX with passive next-upstream failover.
   - Transactional Outbox Pattern with Kafka streaming and idempotent analytics projections.
   - Prometheus metrics exposition (`GET /metrics`), Grafana dashboard, sensitive log redaction, and formal chaos postmortems.
4. **Level 4 — Cloud-Native Operations & Capstone (Milestones 11–12):**
   - Kubernetes manifests, Horizontal Pod Autoscaling (HPA), and Pod Disruption Budgets (PDB).
   - Capacity planning (100, 1k, 10k viewers), CDN cost modeling, STRIDE threat model, and disaster recovery runbooks.

---

## Decision

We formalize the core architectural invariants that define StreamFlow's final production topology:

1. **Modular Monolith First, Microservices Never as a Default:**
   - Single repository with independent domain packages (`@streamflow/contracts`, `@streamflow/database`, `@streamflow/cache`, `@streamflow/config`, `@streamflow/logger`).
   - Internal module interactions happen via typed in-memory interfaces, avoiding distributed network latency and failure modes for synchronous domain operations.
2. **Stateless Compute with Externalized Durable State:**
   - API pods are strictly stateless. Sessions, authentication, and caching live in PostgreSQL and Redis. Any replica can handle any user request interchangeably.
3. **Dual-Write Immunity via Transactional Outbox:**
   - Any operation requiring both database state and external messaging commits business records and `outbox_events` in a single ACID transaction. The asynchronous Event Relay guarantees zero lost events even if API pods crash.
4. **Thundering Herd Immunity via Singleflight:**
   - Hot content cache misses under high concurrency (e.g. 100 simultaneous requests) coalesce into exactly one underlying database query.
5. **Decoupled Heavy Computation:**
   - CPU-bound video processing is isolated into independent background worker pools (`media-worker`), protecting HTTP event loops from starvation.

---

## Retrospective Review of ADR Decisions (001–012)

| ADR | Topic | Validated Outcome |
|---|---|---|
| **ADR-001** | Modular Monolith | Monorepo workspaces cleanly scale to 10 packages without dependency circularity |
| **ADR-002** | Token & Session Strategy | Centralized `refresh_sessions` successfully prevents token reuse and enables instant revocation |
| **ADR-003** | OCC & Monotonic Telemetry | `expectedVersion` and monotonic sequence validation eliminate race condition clobbering |
| **ADR-004** | Direct-to-Storage Upload | API process memory stays flat (<50MB) while uploading multi-gigabyte media assets |
| **ADR-005** | HLS ABR Architecture | FFmpeg generates multi-bitrate rendition ladders with zero video upscaling |
| **ADR-006** | Cache-Aside & Singleflight | Cache hits reduce read latency by 24×; 100 concurrent misses trigger exactly 1 DB query |
| **ADR-007** | BullMQ & Idempotency | Deterministic job IDs prevent duplicate runs; poison messages quarantine immediately |
| **ADR-008** | NGINX & Stateless Failover | Terminating an API instance produces zero 5xx errors to clients via `proxy_next_upstream` |
| **ADR-009** | Outbox & Kafka Projections | Zero event loss on producer crash; inbox deduplication ensures exact-once projections |
| **ADR-010** | Observability & Chaos | RED & USE metrics exposed; credential redaction blocks log leaks; 3 postmortems verified |
| **ADR-011** | Kubernetes Adoption | Declarative manifests, HPA, and PDB provide elastic cloud-native scaling |
| **ADR-012** | Capstone Architecture | Synthesis of capacity planning, STRIDE threat model, and disaster recovery |

---

## Consequences

### Positive
- **Proven Resilience:** Every critical failure mode (Redis down, DB pool saturated, worker crashed, duplicate enqueue) is proven with automated experiment scripts.
- **Cost-Optimized Scale:** Egress models demonstrate that a 95% CDN cache hit ratio reduces origin bandwidth by 20×, making 10,000 concurrent streams financially viable.
- **Enterprise Engineering Rigor:** Standardized with full test coverage (unit, integration, acceptance), C4 diagrams, ADRs, runbooks, and postmortems.

### Negative / Tradeoffs
- **System Footprint:** The complete production stack includes PostgreSQL, Redis, Kafka, MinIO, NGINX, and Kubernetes, requiring automated deployment pipelines for maintainability.
