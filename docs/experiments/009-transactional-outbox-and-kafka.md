# Experiment 009: Transactional Outbox, Kafka Streaming & Idempotent Projections

- **Date:** 2026-11-01
- **Milestone:** M09 Kafka, Consumer Groups, Transactional Outbox & Analytics Projections
- **Environment:** Apache Kafka (KRaft) / PostgreSQL 16 / Node.js
- **Source Script:** `scripts/perf/run-outbox-kafka-experiment.mjs`

---

## 1. Executive Summary

Distributed architectures frequently suffer from the **dual-write problem**: updating a local database and publishing a message to a message broker in separate steps cannot be executed atomically across two separate network systems. If the application crashes between the database commit and the broker publish, events are lost. If the application publishes first and the database transaction aborts, phantom events are created.

Milestone 09 eliminates this problem using the **Transactional Outbox Pattern**:
1. Business state and outbox events are committed in a **single atomic PostgreSQL transaction**.
2. An autonomous **Event Relay** service asynchronously polls outbox records using `FOR UPDATE SKIP LOCKED` and publishes them to Kafka.
3. The **Analytics Consumer** idempotently processes events using a database inbox deduplication table (`processed_events`), ensuring eventual consistency without duplicate projection increments.

---

## 2. Experimental Scenarios & Invariant Verification

### Scenario A: Outbox Durability Under Simulated API Crash

- **Fault Injection:** The API server commits 5 playback sessions and 5 outbox event records into PostgreSQL, then immediately crashes before attempting any network call.
- **Verification:** The Event Relay starts up, queries `WHERE status = 'PENDING' FOR UPDATE SKIP LOCKED`, batches the 5 records to Kafka, and marks them `PUBLISHED`.
- **Result:** **0 lost events (100% durability)**.

| Invariant | Target | Observed | Status |
|---|---|---|---|
| Event Durability | 5/5 preserved in DB | 5/5 preserved in DB | PASS |
| Relay Claim & Publish | 5/5 published to Kafka | 5/5 published to Kafka | PASS |
| Outbox Status Update | All marked PUBLISHED | All marked PUBLISHED | PASS |

---

### Scenario B: Consumer Crash & Idempotent Deduplication

- **Fault Injection:** An event is received by the Analytics Consumer. The consumer begins a database transaction, inserts `eventId` into `processed_events`, increments `play_count` from 0 to 1, and commits to PostgreSQL. However, before the consumer can commit its Kafka partition offset, the consumer crashes.
- **Redelivery:** Kafka broker redelivers the uncommitted message upon consumer restart.
- **Deduplication Check:** The consumer attempts to insert into `processed_events (event_id, consumer_group) ... ON CONFLICT DO NOTHING`. Because the event was already recorded, the insertion yields zero rows and the projection update is skipped.
- **Result:** **0 duplicate count increments (`play_count` = 1)**.

| Delivery Cycle | Event ID | Action Taken | Resulting `play_count` |
|---|---|---|---|
| **Cycle 1 (Initial)** | `evt-redelivery-uuid-12345` | Record event & increment count | 1 |
| **Cycle 2 (Redelivery)** | `evt-redelivery-uuid-12345` | Conflict detected, update skipped | **1 (Idempotent)** |

---

### Scenario C: Partition Key Affinity & Ordering

- **Condition:** 20 playback events for two media streams (`media-alpha` and `media-beta`) are published with `key = aggregateId`.
- **Target:** Messages sharing the same `mediaId` land on the identical Kafka partition and are consumed in strict FIFO chronological sequence.
- **Result:** **0 out-of-order anomalies detected**.

---

## 3. Summary Table

| Scenario | Target | Observed | Result |
|---|---|---|---|
| **A. API Crash Recovery** | 0 lost events | 5/5 published | PASS |
| **B. Consumer Redelivery** | Exactly 1 count increment | 1 count increment | PASS |
| **C. Key Ordering** | Strict FIFO per media entity | 0 order violations | PASS |
