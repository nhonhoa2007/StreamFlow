# ADR-001: Modular Monolith Architecture for Initial System Foundation

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

When architecting a Video on Demand (VOD) and media platform like StreamFlow, an early design dilemma is choosing between a **Distributed Microservices Architecture** and a **Modular Monolith**.

Microservices offer independent deployment and separate failure domains, but introduce significant early costs:
1. Distributed data consistency complexity (distributed transactions, saga orchestrators, eventual consistency).
2. Network overhead, serialization costs, and latency on every cross-domain boundary.
3. High operational overhead (multiple deployment pipelines, service meshes, service discovery).
4. Premature decomposition before domain boundaries (Media, Catalog, Library, Playback) are fully understood.

## Decision

We decide to build StreamFlow as a **Modular Monolith** organized in a **pnpm monorepo**:
1. All domain modules (`HealthModule`, `MediaModule`, and future `CatalogModule`, `UploadModule`, `PlaybackModule`) reside within a single backend API process (`backend/apps/api`).
2. Strict module boundaries are enforced: modules communicate via dependency injection and in-process TypeScript interfaces, not internal HTTP loopbacks.
3. Cross-cutting schemas and contracts are centralized in `shared/contracts` (`@streamflow/contracts`) as the single source of truth for both frontend and backend.
4. Tooling is unified via Biome (single formatter/linter across the entire monorepo) and Turborepo.

## Consequences

### Positive
- **Zero Network Latency Between Modules:** In-process function calls eliminate network serialization overhead.
- **Atomic Migrations & Type Safety:** Changes to contracts or database schemas are immediately validated across API and Web with zero type drift.
- **Fast Developer Workflow:** One single repository, one build graph, and one command to spin up local infrastructure.
- **Lower Resource Consumption:** A single API process uses significantly less RAM and CPU than 5–6 individual Node.js microservices.

### Negative / Tradeoffs
- **Single Process Failure Domain:** A fatal process crash or unhandled error in one module affects all modules in the API instance. (Mitigated by stateless design and multi-replica deployment in M08).
- **Discipline Required:** Developers must strictly honor module boundaries and avoid reaching directly into other modules' internal database tables.

## Decomposition Triggers (When to Extract Services)

Service extraction will only be evaluated when one of the following concrete, measurable triggers is reached:
1. **CPU/Resource Asymmetry:** Background media processing (FFmpeg transcoding) consumes heavy CPU cores that starve the API Event Loop. -> *Trigger for extracting `media-worker` in M05/M07.*
2. **High-Throughput Asynchronous Streaming:** Playback analytics events flood the primary transactional database. -> *Trigger for extracting `event-relay` and `analytics-consumer` with Kafka in M09.*
3. **Independent Scaling:** Specific endpoints experience 10x-100x traffic volume requiring distinct autoscaling thresholds.
