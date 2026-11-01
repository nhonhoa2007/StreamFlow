# StreamFlow M09 Kafka, Consumer Groups, Transactional Outbox & Analytics Projections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Transactional Outbox Pattern to guarantee zero event loss between PostgreSQL and Apache Kafka, build an autonomous Event Relay service, and establish an Analytics Consumer projecting playback metrics with idempotent deduplication.

**Architecture:** Playback API writes session state and outbox events in a single PostgreSQL transaction. An independent `event-relay` service polls and publishes events to Kafka with partition key affinity (`mediaId`). An `analytics-consumer` service consumes from the topic and atomically updates the `media_playback_stats` read projection while recording processed event IDs to prevent duplicate processing under redelivery.

**Tech Stack:** Apache Kafka (KRaft), kafkajs, PostgreSQL 16, Drizzle ORM, NestJS 11, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-m09-kafka-outbox-analytics-design.md`

## Global Constraints

- Domain operations must write business records and outbox events in the same database transaction.
- Outbox polling must use non-blocking locking (`FOR UPDATE SKIP LOCKED`) to allow multiple relay workers without contention.
- Kafka message keys must be `aggregateId` (`mediaId`) to guarantee strict in-order processing per media stream.
- Consumers must be idempotent: duplicate delivery of the same event must never double-count analytics projections.
- Commits use Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. Simulating an API crash immediately after DB transaction commit must result in zero lost events; the relay picks up and publishes the pending outbox record.
2. Simulating a consumer crash after DB update but before offset commit must result in zero duplicate increments in `media_playback_stats`.
3. Outbox events with the same `mediaId` must map to the same Kafka partition key and maintain FIFO ordering.
4. Outbox polling must not lock other rows or block concurrent transactions.
5. Graceful shutdown on both relay and consumer must flush in-flight batches before exiting.

---

### Task 1: Database Schema for Outbox, Processed Events & Playback Stats

**Files:**
- Modify: `backend/packages/database/src/schema.ts`
- Modify: `backend/packages/database/src/queries.ts`
- Modify: `backend/packages/database/src/index.ts`
- Modify: `backend/packages/database/test/database.integration.test.ts`

**Interfaces:**
- Produces: `outboxEventsTable`, `processedEventsTable`, `mediaPlaybackStatsTable`, and query helpers `claimPendingOutboxEvents`, `markOutboxEventPublished`, `processAnalyticsEventAtomic`.

- [ ] **Step 1: Write failing test for Outbox and Analytics tables**
In `backend/packages/database/test/database.integration.test.ts`:
1. Tests inserting and claiming pending outbox events.
2. Tests `processAnalyticsEventAtomic`: first execution increments stats and records event; second execution with identical `eventId` is a no-op (idempotent).

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/database test`
Expected: FAIL.

- [ ] **Step 3: Implement schemas and queries in `@streamflow/database`**
Add `outboxEventsTable`, `processedEventsTable`, `mediaPlaybackStatsTable` to `schema.ts`. Add query helpers in `queries.ts`. Generate/update Drizzle migrations.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/database test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/packages/database/
git commit -m "feat(database): add outbox events, processed events, and playback stats tables"
```

---

### Task 2: Kafka Configuration & Infrastructure

**Files:**
- Modify: `backend/packages/config/src/index.ts`
- Modify: `backend/packages/config/src/index.test.ts`
- Modify: `infra/compose/compose.yaml`
- Modify: `.env.example`
- Root: `package.json`

**Interfaces:**
- Produces: `KAFKA_BROKERS`, `KAFKA_PLAYBACK_TOPIC`, `KAFKA_CONSUMER_GROUP` in `@streamflow/config`.

- [ ] **Step 1: Write failing test for Kafka configuration**
In `backend/packages/config/src/index.test.ts`, assert `KAFKA_BROKERS` defaults to `"127.0.0.1:9092"`, `KAFKA_PLAYBACK_TOPIC` defaults to `"media-playback-events"`, and `KAFKA_CONSUMER_GROUP` defaults to `"streamflow-analytics-group"`.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/config test`
Expected: FAIL.

- [ ] **Step 3: Implement Kafka config, add kafkajs, and update Compose**
Update `config/src/index.ts`, `.env.example`, and `compose.yaml` with Kafka KRaft service. Install `kafkajs`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/config test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/packages/config/ infra/compose/compose.yaml .env.example package.json pnpm-lock.yaml
git commit -m "feat(config): add kafka configuration and compose service"
```

---

### Task 3: Transactional Outbox Event Emission in Playback API

**Files:**
- Modify: `backend/apps/api/src/playback/playback.service.ts`
- Modify: `backend/apps/api/test/playback.integration.test.ts`

**Interfaces:**
- Consumes: `outboxEventsTable` from `@streamflow/database`.
- Produces: Atomic write of `playback_sessions` and `outbox_events` on `POST /v1/playback/:id/start`.

- [ ] **Step 1: Write failing test verifying outbox record emission**
In `backend/apps/api/test/playback.integration.test.ts`:
Call `POST /v1/playback/:id/start`. Assert session is created AND an outbox record with `event_type = 'playback.started'` and `status = 'PENDING'` is created in the same transaction.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test test/playback.integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement transactional outbox write in `PlaybackService`**
In `playback.service.ts`, wrap session insertion and outbox event insertion inside `db.transaction(...)`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/api test test/playback.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/apps/api/
git commit -m "feat(api): transactionally emit playback outbox events on session start"
```

---

### Task 4: Autonomous Event Relay Service (`backend/apps/event-relay`)

**Files:**
- Create: `backend/apps/event-relay/package.json`
- Create: `backend/apps/event-relay/tsconfig.json`
- Create: `backend/apps/event-relay/src/relay.ts`
- Create: `backend/apps/event-relay/src/index.ts`
- Create: `backend/apps/event-relay/test/relay.test.ts`

**Interfaces:**
- Produces: `createEventRelay(options)` returning `{ start, pollOnce, close }`.

- [ ] **Step 1: Write failing test for Event Relay**
In `relay.test.ts`:
1. Seeds 3 pending outbox events across 2 different `aggregateId`s.
2. Invokes `pollOnce()`.
3. Asserts Kafka producer received all 3 messages with matching partition keys.
4. Asserts all 3 outbox records in DB are transitioned to `PUBLISHED` with `published_at` timestamp.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/event-relay test`
Expected: FAIL.

- [ ] **Step 3: Implement Event Relay service**
Implement `relay.ts` with polling loop, Kafka publisher, and batch publication status update.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/event-relay test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/apps/event-relay/
git commit -m "feat(event-relay): implement transactional outbox polling and kafka publishing"
```

---

### Task 5: Analytics Consumer & Idempotent Projection (`backend/apps/analytics-consumer`)

**Files:**
- Create: `backend/apps/analytics-consumer/package.json`
- Create: `backend/apps/analytics-consumer/tsconfig.json`
- Create: `backend/apps/analytics-consumer/src/consumer.ts`
- Create: `backend/apps/analytics-consumer/src/index.ts`
- Create: `backend/apps/analytics-consumer/test/consumer.test.ts`

**Interfaces:**
- Produces: `createAnalyticsConsumer(options)` returning `{ processMessage, close }`.

- [ ] **Step 1: Write failing test for Analytics Consumer**
In `consumer.test.ts`:
1. Dispatches `playback.started` event to consumer.
2. Verifies `media_playback_stats` has `play_count = 1`.
3. Dispatches duplicate event with same `eventId`.
4. Verifies `media_playback_stats` still has `play_count = 1` (idempotent deduplication).

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/analytics-consumer test`
Expected: FAIL.

- [ ] **Step 3: Implement Analytics Consumer service**
Implement `consumer.ts` subscribing to Kafka topic and executing `processAnalyticsEventAtomic`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/analytics-consumer test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/apps/analytics-consumer/
git commit -m "feat(analytics-consumer): implement idempotent kafka consumer for playback projections"
```

---

### Task 6: Experiment 009, Sequence Diagram, ADR-009 & Acceptance

**Files:**
- Create: `scripts/perf/run-outbox-kafka-experiment.mjs`
- Create: `docs/experiments/009-transactional-outbox-and-kafka.md`
- Create: `docs/architecture/outbox-sequence.md`
- Create: `docs/adr/009-transactional-outbox-and-event-streaming.md`
- Modify: `scripts/acceptance.test.mjs`
- Modify: `scripts/check-layout.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write failing acceptance test checking M09 deliverables**
In `scripts/acceptance.test.mjs`, assert ADR-009, outbox sequence diagram, experiment 009 report, and runner exist.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement experiment runner, docs, and update layout check**
Write `run-outbox-kafka-experiment.mjs`, `009-transactional-outbox-and-kafka.md`, `outbox-sequence.md`, `009-transactional-outbox-and-event-streaming.md`. Update `check-layout.test.mjs` (remove `event-relay` and `analytics-consumer` from future leaves) and update `README.md`.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All pass 100%.

- [ ] **Step 5: Commit**
```bash
git add scripts/ docs/ README.md
git commit -m "docs: add m09 outbox kafka experiment, sequence diagram, adr-009, and acceptance tests"
```
