# ADR-007: BullMQ Asynchronous Processing, Idempotency & Retry Strategy

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

Video transcoding and adaptive bitrate (ABR) ladder generation are computationally intensive, CPU-bound operations. Running FFmpeg synchronously within the HTTP API server degrades API latency, starves the Fastify event loop, and risks catastrophic node crashes under concurrent uploads.

Furthermore, distributed background processing introduces inherent failure modes:
1. **Network Disconnections & Timeouts:** Transient S3 or database connectivity hiccups during long segment uploads.
2. **Worker Restarts & Crashes:** Sudden container eviction or host restart while a transcode is partially complete.
3. **Duplicate Enqueues:** Network retries from admin clients or automated triggers submitting identical jobs multiple times.
4. **Poison Messages:** Corrupted, truncated, or malicious video files causing repeated FFmpeg crashes.

We need an asynchronous queue architecture that guarantees at-least-once delivery, strict idempotency, graceful worker shutdown, bounded retries, and atomic publication.

---

## Decision

We decide to adopt **BullMQ backed by Redis** with an independent worker process (`apps/media-worker`):

1. **Queue Topography & Isolation:**
   - The HTTP API acts purely as a producer, enqueuing jobs to `media-transcode-queue` without executing FFmpeg.
   - `apps/media-worker` runs as an isolated process dedicated to CPU-bound FFmpeg tasks.
2. **Deterministic Job Idempotency:**
   - Job IDs are derived deterministically:
     `jobId = transcode_${mediaId}_${sourceAssetId}_${profileVersion}`
   - BullMQ natively deduplicates enqueues sharing the same `jobId` in active or waiting states.
   - PostgreSQL enforces a composite unique constraint on `(media_id, source_asset_id, profile_version)` in `transcode_jobs`.
3. **Bounded Retries with Exponential Backoff & Jitter:**
   - Jobs are configured with `attempts: 3` and exponential backoff (`delay: 1000ms`, doubled on each attempt with random jitter).
4. **Poison Message Quarantine (`UnrecoverableError`):**
   - Non-retryable errors (e.g., corrupted media headers, missing `moov` atom, unreadable streams) throw BullMQ's `UnrecoverableError`.
   - BullMQ immediately moves the job to the `failed` state without wasting retry slots, and the worker records the failure in PostgreSQL.
5. **Atomic Output Publication & Staging Namespace:**
   - All HLS manifests, video segments, and thumbnails are initially generated in a job-scoped temporary directory (`tmp_${jobId}`).
   - Before publishing, an integrity verification step confirms all rendition playlists, segments, and thumbnails exist and have non-zero bytes.
   - Upon successful verification, outputs are atomically promoted to the permanent path and database pointers (`media.status = 'READY'`, `transcode_jobs.status = 'COMPLETED'`) are updated within a single transaction. Interrupted runs never publish broken partial streams.
6. **Graceful Worker Shutdown:**
   - `worker.close()` is bound to `SIGTERM` and `SIGINT`, stopping new job acquisition while allowing active jobs to complete cleanly.

---

## Consequences

### Positive
- **Event Loop Decoupling:** Heavy FFmpeg CPU loads no longer impact HTTP API latency or healthcheck response times.
- **Fault-Tolerant Crashes:** Worker failure mid-transcode leaves media in `DRAFT`; restart and requeue cleanly complete transcoding without duplicate artifacts.
- **Resource Protection:** Strict worker concurrency limits (`concurrency: 2`) prevent host OOM and CPU thrashing.
- **Poison Message Isolation:** Malformed files are quarantined immediately, preventing cascading worker retries.

### Negative / Tradeoffs
- **Redis Dependency for Queues:** Redis becomes a core dependency for background job scheduling (mitigated by Redis persistence and BullMQ durability).
- **Disk Storage Overhead:** Staging outputs in `tmp_${jobId}` temporarily requires local scratch disk space before atomic promotion.
- **Eventual Consistency:** Upload completion returns 202 Accepted; clients must poll or listen to status endpoints to know when media becomes `READY`.
