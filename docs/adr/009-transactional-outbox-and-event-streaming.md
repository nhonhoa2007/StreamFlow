# ADR-009: Transactional Outbox Pattern, Kafka Event Streaming & Idempotent Projections

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

StreamFlow requires real-time and historical analytics on playback engagement (play counts, watch time, completion rates). Publishing domain events synchronously to Apache Kafka directly from the HTTP request handler introduces the **dual-write problem**:
1. If the database transaction commits but the network call to Kafka fails or the API container is killed, the event is permanently lost.
2. If the Kafka message is published first but the database transaction rolls back, phantom events trigger inaccurate analytics.
3. Two-phase commit (2PC) / XA transactions across PostgreSQL and Kafka are prohibitively slow, complex, and unsupported in cloud-native microservices.

Furthermore, distributed message brokers provide **at-least-once delivery**, which means network retries or consumer crashes before committing partition offsets will cause duplicate messages to be processed.

---

## Decision

We decide on the **Transactional Outbox Pattern with Polling Publisher and Idempotent Consumer Projections**:

1. **Transactional Outbox Table (`outbox_events`):**
   - When playback sessions are created (`POST /v1/playback/:id/start`), the business record and outbox event are inserted in a **single local database transaction**.
   - PostgreSQL provides ACID guarantees: zero lost events, zero phantom events.
2. **Autonomous Event Relay (`apps/event-relay`):**
   - An independent polling worker queries pending events using `SELECT ... FOR UPDATE SKIP LOCKED`.
   - Non-blocking locking allows multiple relay replicas to process distinct event batches in parallel without deadlocks.
   - Events are published to Kafka topic `media-playback-events` with partition key set to `aggregateId` (`mediaId`), ensuring partition affinity and strict FIFO ordering per media entity.
   - Upon confirmed Kafka acknowledgment, the outbox record is marked `PUBLISHED`.
3. **Apache Kafka (KRaft Mode):**
   - Kafka is deployed without ZooKeeper in KRaft consensus mode, minimizing operational complexity.
4. **Idempotent Analytics Consumer (`apps/analytics-consumer`):**
   - The consumer subscribes to `media-playback-events` in consumer group `streamflow-analytics-group`.
   - Each event is processed inside a database transaction:
     - `INSERT INTO processed_events (event_id, consumer_group) VALUES (...) ON CONFLICT DO NOTHING`.
     - If the event is newly inserted, the read model projection (`media_playback_stats`) is incremented.
     - If the event was already recorded (duplicate delivery), the projection update is skipped.
   - Offsets are committed after the database transaction succeeds.

---

## Consequences

### Positive
- **Guaranteed Consistency:** Eliminates dual-write hazards without requiring distributed transactions.
- **Fault-Tolerant Streaming:** If Kafka is temporarily down, outbox records safely accumulate in PostgreSQL until Kafka recovers.
- **Idempotency Defense:** Consumer crashes or rebalances never result in duplicate playback analytics counts.
- **Ordered Event Streams:** Using `mediaId` as partition key preserves exact sequence for progress telemetry.

### Negative / Tradeoffs
- **Polling Latency & Database Load:** Polling every 1,000 ms introduces slight eventual consistency delay and periodic read queries on PostgreSQL (mitigated by index on `(status, created_at)` and `SKIP LOCKED`).
- **Outbox Storage Growth:** Outbox records accumulate in PostgreSQL; requires periodic cleanup or archiving of `PUBLISHED` rows.
- **Kafka Infrastructure Overhead:** Requires maintaining and running Kafka clusters alongside existing Redis and PostgreSQL systems.
