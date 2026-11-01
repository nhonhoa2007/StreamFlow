# Milestone 09 Specification: Kafka, Consumer Groups, Transactional Outbox & Analytics Projections

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M09 (Weeks 17–18)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 09 introduces asynchronous distributed event streaming with strict delivery guarantees. It establishes the **Transactional Outbox Pattern** to eliminate dual-write hazards, streams playback telemetry through **Apache Kafka**, and builds an **Analytics Read Model Projection** with end-to-end deduplication:

1. **Transactional Outbox Pattern (`outbox_events` table):**
   - Domain operations (e.g., `playback.started`) write their business state and outbox events in a **single atomic PostgreSQL transaction**.
   - Solves the dual-write problem: prevents lost events if an API crashes after DB commit but before publishing, and prevents phantom events if DB commit fails after publishing.
2. **Autonomous Event Relay Service (`backend/apps/event-relay`):**
   - Polls and claims unhandled events using `SELECT ... FOR UPDATE SKIP LOCKED`.
   - Publishes events to Kafka topic `media-playback-events` with partition keys derived from `aggregateId` (guaranteeing FIFO ordering per media entity).
   - Marks outbox records as `PUBLISHED` upon delivery confirmation.
3. **Analytics Consumer & Idempotent Projection (`backend/apps/analytics-consumer`):**
   - Subscribes to `media-playback-events` using consumer group `streamflow-analytics-group`.
   - Uses an inbox/deduplication table (`processed_events`) within a database transaction.
   - Idempotently updates the `media_playback_stats` read projection (`play_count`, `total_watch_time_seconds`, `last_played_at`).
   - If the consumer crashes after database commit but before Kafka offset commit, event re-delivery causes zero duplicate increments.
4. **Apache Kafka (KRaft Mode):**
   - Integrated via `kafkajs`.
   - Containerized in `infra/compose/compose.yaml` using KRaft mode (`apache/kafka:3.7.0`), eliminating ZooKeeper overhead.
5. **Educational Experiments & Architecture Documentation:**
   - `scripts/perf/run-outbox-kafka-experiment.mjs` & `docs/experiments/009-transactional-outbox-and-kafka.md`:
     - Test A: API crash simulation (outbox durability and guaranteed eventual relay).
     - Test B: Consumer crash simulation (at-least-once delivery with idempotent projection).
     - Test C: Partition key ordering (FIFO sequence per media entity).
   - Sequence Diagram: `docs/architecture/outbox-sequence.md`.
   - Architecture Decision Record: `docs/adr/009-transactional-outbox-and-event-streaming.md`.

---

## 2. Database Schema Additions (`@streamflow/database`)

### 2.1 Outbox Table (`outbox_events`)
- `id`: UUID (Primary Key)
- `aggregateType`: `varchar(64)` (e.g. `"playback"`)
- `aggregateId`: UUID (e.g. `mediaId`)
- `eventType`: `varchar(64)` (e.g. `"playback.started"`)
- `payload`: JSONB
- `status`: `varchar(20)` (`"PENDING"`, `"PUBLISHED"`, `"FAILED"`)
- `publishedAt`: Timestamp with time zone (nullable)
- `createdAt`: Timestamp with time zone
- Indexes: `(status, createdAt)`

### 2.2 Processed Events Table (`processed_events`)
- `eventId`: UUID (Primary Key)
- `consumerGroup`: `varchar(64)` (Composite Key with `eventId`)
- `processedAt`: Timestamp with time zone

### 2.3 Analytics Read Projection (`media_playback_stats`)
- `mediaId`: UUID (Primary Key, references `media.id`)
- `playCount`: Integer (default 0)
- `totalWatchTimeSeconds`: BigInt (default 0)
- `lastPlayedAt`: Timestamp with time zone
- `updatedAt`: Timestamp with time zone

---

## 3. Component Topography & Data Flow

```
[Client]
   │ POST /v1/playback/:id/start
   ▼
[API Server] ─── (Single DB Transaction) ───┐
   │                                        │
   ├─► INSERT playback_sessions             │
   └─► INSERT outbox_events (PENDING) ◄─────┘
   ▲
   │ (Polling via SKIP LOCKED)
[Event Relay Service]
   │ Publish to Kafka (Key: mediaId)
   ▼
[Kafka Topic: media-playback-events]
   │ Consumer Group: streamflow-analytics-group
   ▼
[Analytics Consumer] ─── (Single DB Transaction) ───┐
   │                                                │
   ├─► INSERT processed_events (ON CONFLICT DO NOTHING)
   └─► UPDATE media_playback_stats (play_count++) ◄─┘
```

---

## 4. Definition of Done

1. `outbox_events`, `processed_events`, and `media_playback_stats` tables created in `@streamflow/database` with migrations and helper queries.
2. `KAFKA_BROKERS` added to `@streamflow/config` and `kafka` service added to Docker Compose.
3. API writes playback events transactionally to `outbox_events` on `/v1/playback/:id/start`.
4. `backend/apps/event-relay` service created, polling and publishing to Kafka with partition key ordering.
5. `backend/apps/analytics-consumer` service created, consuming events and idempotently updating `media_playback_stats`.
6. Experiment runner (`scripts/perf/run-outbox-kafka-experiment.mjs`) validates:
   - Outbox recovery after simulated producer crash.
   - Idempotent deduplication after simulated consumer crash.
   - In-order processing per partition key.
7. Sequence diagram (`docs/architecture/outbox-sequence.md`) and ADR-009 documented.
8. Acceptance tests in `scripts/acceptance.test.mjs` updated and 100% passing.
