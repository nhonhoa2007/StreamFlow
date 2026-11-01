# Milestone 07 Specification: BullMQ, Robust Transcode Jobs & Idempotency Defense

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M07 (Weeks 13–14)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 07 decouples asynchronous, CPU-intensive video processing from the main HTTP API server. It establishes a resilient, restart-safe distributed job processing pipeline using **BullMQ** and **Redis**:

1. **Independent Worker Separation (`backend/apps/media-worker`):**
   - The media worker runs as an autonomous process consuming transcode jobs from Redis via BullMQ.
   - CPU-bound FFmpeg operations run isolated from the Fastify HTTP event loop.
2. **At-Least-Once Delivery with Strict Idempotency:**
   - Deterministic BullMQ Job IDs derived from `(mediaId, sourceAssetId, profileVersion)` prevent duplicate job creation across concurrent requests or retry loops.
   - Database-level unique constraint on `(media_id, source_asset_id, profile_version)` in `transcode_jobs` prevents duplicate database entries.
3. **Bounded Retries with Exponential Backoff & Jitter:**
   - Jobs are configured with bounded retry policies (max 3 attempts).
   - Backoff uses exponential delay with jitter to prevent stampedes against object storage and database during recoveries.
4. **Poison Message Isolation (Quarantine):**
   - Distinguishes between retryable transient errors (network timeouts, S3 rate limits) and permanent non-retryable errors (malformed video headers, unsupported codecs).
   - Permanent errors are quarantined immediately using BullMQ's `UnrecoverableError`, marking the job `FAILED` in PostgreSQL without wasting retry slots.
5. **Atomic Output Publication:**
   - Transcode outputs (HLS rendition playlists, segment files `.ts`, master manifest `.m3u8`, and poster thumbnail) are written to an isolated temporary namespace (`tmp_${jobId}`).
   - Verification phase validates completeness (all manifests and segments exist with non-zero bytes).
   - Only upon verification is the logical media record atomically promoted to `READY` via `publishTranscodedMediaAtomic`. If the worker crashes or is killed before verification, no partial output is published.
6. **Graceful Worker Shutdown:**
   - Traps `SIGTERM` and `SIGINT` signals.
   - `worker.close()` stops receiving new jobs from Redis and allows active jobs to finish or cleanly requeue.
7. **Concurrency Control:**
   - Worker concurrency limit is bounded (default 2 concurrent transcodes per worker process) to prevent CPU/memory exhaustion on host machines.
8. **Educational Experiments & ADR:**
   - `docs/experiments/007-robust-transcode-jobs.md` & `scripts/perf/run-transcode-queue-experiment.mjs`:
     - Test A: Worker kill after 80% segments uploaded; restart; verify no partial output, eventual single logical artifact.
     - Test B: Concurrency limit: Enqueue 10 jobs, assert at most 2 run concurrently.
     - Test C: Duplicate enqueue idempotency: Enqueue 5 identical jobs, assert 1 run.
     - Test D: Poison message handling: Corrupted video input quarantined immediately.
   - `docs/adr/007-job-idempotency-and-retry-strategy.md`: Architecture Decision Record.

---

## 2. Infrastructure & Configuration

### 2.1 Dependencies
- `bullmq` (`^5.41.0` or latest v5): Installed in `backend/apps/api` and `backend/apps/media-worker`.

### 2.2 Environment Configuration (`backend/packages/config`)
- `TRANSCODE_QUEUE_NAME`: `z.string().default("media-transcode-queue")`.
- `TRANSCODE_CONCURRENCY`: `z.coerce.number().int().positive().default(2)`.
- `TRANSCODE_MAX_ATTEMPTS`: `z.coerce.number().int().positive().default(3)`.

---

## 3. Data Flow & Queue Topography

### 3.1 Job Enqueue Flow (API Producer)
1. Admin completes an upload via `POST /v1/admin/uploads/:id/complete` or requests transcode via `POST /v1/admin/media/:id/transcode`.
2. API verifies that the source asset exists (`SOURCE_VIDEO`).
3. API computes deterministic Job ID:
   `jobId = `transcode:${mediaId}:${sourceAssetId}:${profileVersion}``
4. API upserts a record in `transcode_jobs` with status `QUEUED`.
5. API enqueues job to BullMQ queue:
   ```ts
   await transcodeQueue.add("transcode", payload, {
     jobId,
     attempts: 3,
     backoff: {
       type: "exponential",
       delay: 1000,
     },
     removeOnComplete: 100,
     removeOnFail: 500,
   });
   ```
6. If the job ID already exists in BullMQ (active or waiting), BullMQ deduplicates it. API returns 202 Accepted with `jobId`.

### 3.2 Job Processing Flow (Worker Consumer)
1. Worker receives job.
2. Checks DB: if job is already `READY`, exits early (idempotent no-op).
3. Updates `transcode_jobs.status = 'PROCESSING'`, `attempts = attempts + 1`.
4. Transcodes video into temporary workspace directory:
   `${workDir}/hls/tmp_${jobId}`.
5. Verifies all generated files (`master.m3u8`, `*.ts`, `poster.jpg`).
6. Atomically publishes output:
   - Moves/uploads temporary assets into target object storage path: `hls/${mediaId}/`.
   - In a single DB transaction:
     - Inserts rendition `media_assets` records.
     - Updates `transcode_jobs.status = 'READY'`, `progress_percent = 100`.
     - Updates `media.status = 'READY'`, `media.published_at = NOW()`.
     - Invalidates Redis cache for `media:detail:${id}` and `media:catalog:*`.

### 3.3 Poison Message & Quarantine Handling
- When FFmpeg or ffprobe encounters unreadable stream or invalid data, throw `UnrecoverableError(err.message)`.
- Worker catches `UnrecoverableError`:
  - Updates `transcode_jobs.status = 'FAILED'`, `error_message = err.message`.
  - Updates `media.status = 'FAILED'`.
  - BullMQ moves job directly to failed state without triggering remaining attempts.

---

## 4. API Endpoints

1. `POST /v1/admin/media/:id/transcode`:
   - Idempotently triggers transcode for media item's source asset.
   - Returns 202 Accepted with `{ jobId, status: "QUEUED" }`.
2. `GET /v1/admin/transcode-jobs/:id`:
   - Returns transcode job progress, status, attempts, error message.
3. `GET /v1/admin/media/:id/transcode-jobs`:
   - Returns list of transcode jobs for a specific media item.

---

## 5. Definition of Done

1. BullMQ integrated into `backend/apps/api` and `backend/apps/media-worker`.
2. API exposes transcode enqueueing and job status querying endpoints.
3. Media worker operates as an independent service with concurrency limit (2), bounded retries (3), and exponential backoff with jitter.
4. Idempotency guaranteed: identical job enqueues produce exactly 1 execution and never corrupt DB state.
5. Atomic publication verified: worker kill during transcode never causes partial READY state; restarted worker recovers cleanly.
6. Poison messages quarantined: corrupted media files fail immediately without retry loops.
7. Graceful shutdown verified: SIGTERM causes worker to finish in-flight jobs or requeue cleanly without data corruption.
8. Benchmark runner & experiment report created (`scripts/perf/run-transcode-queue-experiment.mjs`, `docs/experiments/007-robust-transcode-jobs.md`).
9. ADR-007 created and committed.
10. All automated tests pass: unit tests, integration tests, acceptance tests, lint, typecheck, build.
