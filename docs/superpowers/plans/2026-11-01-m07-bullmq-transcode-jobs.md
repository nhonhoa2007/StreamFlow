# StreamFlow M07 BullMQ, Robust Transcode Jobs & Idempotency Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple CPU-intensive video transcoding from the Fastify API into an independent BullMQ media-worker process featuring deterministic job deduplication, bounded retries with jitter, poison message quarantine, and atomic output publication.

**Architecture:** An independent `media-worker` process consumes transcode jobs from Redis via BullMQ with bounded concurrency (`concurrency: 2`). API acts as producer, generating deterministic job IDs derived from `(mediaId, sourceAssetId, profileVersion)` to guarantee idempotency across enqueues. Worker transcodes to a temporary namespace, verifies segment and playlist integrity, and atomically publishes the media to `READY` state.

**Tech Stack:** BullMQ v5, Redis 7 (ioredis), FFmpeg, ffprobe, NestJS 11, Drizzle ORM, PostgreSQL 16, Vitest, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-11-01-m07-bullmq-transcode-jobs-design.md`

## Global Constraints

- Worker process must run independently from the API server and gracefully stop accepting new jobs on `SIGTERM`/`SIGINT`.
- BullMQ Job ID must be deterministically constructed from `transcode:${mediaId}:${sourceAssetId}:${profileVersion}` to prevent duplicate active jobs.
- Concurrency on the transcode worker must be bounded to 2 concurrent jobs.
- Retries must be bounded to at most 3 attempts with exponential backoff and jitter.
- Output publication must be atomic: partial segments or interrupted transcoding runs must never result in a `READY` media status.
- Unrecoverable/poison messages (e.g. invalid video format) must be quarantined immediately without wasting retry attempts.
- Commits use Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. Duplicate enqueue attempts for the same media, asset, and profile version must result in exactly 1 running job and 0 database conflicts.
2. Worker killed or crashing during segment transcode must leave the media in non-READY state and restart cleanly to finish without duplicate artifacts.
3. Concurrency limit of 2 must be strictly respected when 10 jobs are queued simultaneously.
4. Corrupted video payload must immediately fail as a poison message and transition job to `FAILED` without retrying 3 times.
5. Graceful shutdown (`worker.close()`) must allow in-flight jobs to finish or requeue cleanly without leaving orphaned processing locks.

---

### Task 1: BullMQ Infrastructure & Configuration

**Files:**
- Modify: `backend/packages/config/src/index.ts`
- Modify: `backend/packages/config/src/index.test.ts`
- Modify: `backend/apps/api/package.json`
- Modify: `backend/apps/media-worker/package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `TRANSCODE_QUEUE_NAME`, `TRANSCODE_CONCURRENCY`, `TRANSCODE_MAX_ATTEMPTS` in `@streamflow/config`.

- [ ] **Step 1: Write failing test for transcode queue config**
In `backend/packages/config/src/index.test.ts`, assert `TRANSCODE_QUEUE_NAME` defaults to `"media-transcode-queue"`, `TRANSCODE_CONCURRENCY` defaults to 2, and `TRANSCODE_MAX_ATTEMPTS` defaults to 3.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/config test`
Expected: FAIL.

- [ ] **Step 3: Implement config and add bullmq dependencies**
Add `TRANSCODE_QUEUE_NAME`, `TRANSCODE_CONCURRENCY`, and `TRANSCODE_MAX_ATTEMPTS` to `backend/packages/config/src/index.ts`. Add `bullmq` to `backend/apps/api/package.json` and `backend/apps/media-worker/package.json`. Update `.env.example`. Run `pnpm install`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/config test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/packages/config/ backend/apps/api/package.json backend/apps/media-worker/package.json .env.example pnpm-lock.yaml
git commit -m "feat(config): add bullmq dependencies and transcode queue settings"
```

---

### Task 2: Queue Contracts & Idempotency Key Utilities

**Files:**
- Create: `shared/contracts/src/transcode.ts`
- Create: `shared/contracts/src/transcode.test.ts`
- Modify: `shared/contracts/src/index.ts`

**Interfaces:**
- Produces:
  - `TranscodeJobPayload`: `{ mediaId: string; sourceAssetId: string; profileVersion: number; sourceObjectKey: string }`
  - `TranscodeJobStatusResponse`: schema & type
  - `getTranscodeJobId(mediaId: string, sourceAssetId: string, profileVersion: number): string`

- [ ] **Step 1: Write failing test for transcode contracts & jobId generator**
In `transcode.test.ts`, test:
1. `getTranscodeJobId("m1", "a1", 1)` returns `"transcode:m1:a1:1"`.
2. `TranscodeJobPayloadSchema.parse` validates correct payload and rejects missing fields.
3. `TranscodeJobStatusResponseSchema` validates status response.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/contracts test`
Expected: FAIL.

- [ ] **Step 3: Implement contracts & jobId generator**
Implement `transcode.ts` with Zod schemas and `getTranscodeJobId`. Export from `shared/contracts/src/index.ts`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/contracts test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add shared/contracts/
git commit -m "feat(contracts): add transcode job schemas and deterministic job id helper"
```

---

### Task 3: API Queue Producer & Admin Transcode Endpoints

**Files:**
- Create: `backend/apps/api/src/queue/queue.module.ts`
- Create: `backend/apps/api/src/queue/queue.service.ts`
- Modify: `backend/apps/api/src/admin/admin.controller.ts`
- Modify: `backend/apps/api/src/admin/admin.service.ts`
- Modify: `backend/apps/api/src/app.module.ts`
- Create: `backend/apps/api/test/queue.integration.test.ts`

**Interfaces:**
- Consumes: `getTranscodeJobId`, `TranscodeJobPayload` from `@streamflow/contracts`, `transcodeJobsTable` from `@streamflow/database`.
- Produces:
  - `QueueService.enqueueTranscode(mediaId, sourceAssetId, profileVersion)`
  - `POST /v1/admin/media/:id/transcode`
  - `GET /v1/admin/transcode-jobs/:id`
  - `GET /v1/admin/media/:id/transcode-jobs`

- [ ] **Step 1: Write failing integration test for enqueue and job status**
In `queue.integration.test.ts`:
1. Seeds user, media, and source asset.
2. `POST /v1/admin/media/:id/transcode` returns 202 Accepted with deterministic `jobId`.
3. Calling `POST /v1/admin/media/:id/transcode` a second time is idempotent, returns same `jobId` without inserting duplicate DB records.
4. `GET /v1/admin/transcode-jobs/:id` returns status `QUEUED` and 0 attempts.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL.

- [ ] **Step 3: Implement QueueService, QueueModule, and Admin endpoints**
Implement BullMQ `Queue` in `QueueService` with Redis connection. Create endpoints in `AdminController` and logic in `AdminService`. Connect in `AppModule`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/apps/api/
git commit -m "feat(api): implement bullmq transcode queue producer and admin job endpoints"
```

---

### Task 4: Media Worker BullMQ Consumer with Concurrency & Bounded Retries

**Files:**
- Create: `backend/apps/media-worker/src/worker.ts`
- Modify: `backend/apps/media-worker/src/index.ts`
- Create: `backend/apps/media-worker/test/worker-queue.test.ts`

**Interfaces:**
- Consumes: `TranscodeJobPayload`, `getTranscodeJobId` from `@streamflow/contracts`, `executeTranscodePipeline` from `./transcode-pipeline.ts`.
- Produces: `createTranscodeWorker(options)` returning `{ worker, close }`.

- [ ] **Step 1: Write failing test for BullMQ worker consumer**
In `worker-queue.test.ts`:
1. Starts worker listening on isolated test queue.
2. Enqueues job with mock pipeline runner.
3. Verifies worker processes job, updates status to `PROCESSING` and then `READY`.
4. Tests concurrency: verifies worker does not execute more than 2 jobs concurrently.
5. Tests graceful shutdown: `await worker.close()` shuts down cleanly.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/media-worker test`
Expected: FAIL.

- [ ] **Step 3: Implement BullMQ worker**
In `worker.ts`, configure BullMQ `Worker` with `concurrency: 2`. Handle `progress` and `error` events. Implement graceful shutdown on `SIGTERM`/`SIGINT`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/media-worker test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/apps/media-worker/
git commit -m "feat(media-worker): implement bullmq consumer with concurrency and bounded retries"
```

---

### Task 5: Atomic Output Publication & Poison Message Quarantine

**Files:**
- Modify: `backend/apps/media-worker/src/transcode-pipeline.ts`
- Modify: `backend/apps/media-worker/src/worker.ts`
- Create: `backend/apps/media-worker/test/atomic-publish.test.ts`

**Interfaces:**
- Produces: Atomic publication with temporary directory verification and immediate quarantine for corrupted media files via `UnrecoverableError`.

- [ ] **Step 1: Write failing test for atomic publication and poison message**
In `atomic-publish.test.ts`:
1. Verify simulated worker interruption leaves temporary files unpromoted, and `media.status` remains unchanged.
2. Corrupted video payload throws `UnrecoverableError`, marks DB `transcode_jobs.status = 'FAILED'`, and does not retry 3 times.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/media-worker test`
Expected: FAIL.

- [ ] **Step 3: Implement atomic temp verification and poison quarantine**
In `transcode-pipeline.ts`, output into `tmp_${jobId}` directory, verify files, then promote. Catch probe/ffmpeg errors and throw `UnrecoverableError` on unreadable input.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/media-worker test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/apps/media-worker/
git commit -m "feat(media-worker): add atomic output publication and poison message quarantine"
```

---

### Task 6: Experiment 007 Runner, Report & ADR-007

**Files:**
- Create: `scripts/perf/run-transcode-queue-experiment.mjs`
- Create: `docs/experiments/007-robust-transcode-jobs.md`
- Create: `docs/adr/007-job-idempotency-and-retry-strategy.md`
- Modify: `scripts/acceptance.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write failing acceptance test checking M07 deliverables**
In `scripts/acceptance.test.mjs`, assert `docs/adr/007-job-idempotency-and-retry-strategy.md`, `docs/experiments/007-robust-transcode-jobs.md`, and `scripts/perf/run-transcode-queue-experiment.mjs` exist and validate M07 criteria.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement experiment runner, experiment report, and ADR-007**
Write `run-transcode-queue-experiment.mjs` executing crash recovery, concurrency limit, duplicate idempotency, and poison quarantine scenarios. Write ADR-007 and update README.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All pass 100%.

- [ ] **Step 5: Commit**
```bash
git add scripts/ docs/ README.md
git commit -m "docs: add m07 transcode queue experiment report, adr-007, and acceptance tests"
```
