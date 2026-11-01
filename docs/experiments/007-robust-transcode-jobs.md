# Experiment 007: BullMQ, Robust Transcode Jobs & Idempotency Defense

- **Date:** 2026-11-01
- **Milestone:** M07 BullMQ, Robust Transcode Jobs
- **Environment:** Redis 7 / BullMQ 6.5 / PostgreSQL 16 / FFmpeg 7 / Node.js
- **Source Script:** `scripts/perf/run-transcode-queue-experiment.mjs`

---

## 1. Executive Summary

Milestone 07 validates asynchronous, decoupled background job processing using BullMQ for video transcoding. This experiment tests the system under four failure and stress scenarios:
1. **Worker Crash & Restart Recovery:** Verification of atomic output publication and zero partial `READY` leakage.
2. **Concurrency Bounding:** Strict worker concurrency enforcement under queue saturation.
3. **Duplicate Enqueue Idempotency:** Elimination of duplicate processing when identical payloads are enqueued.
4. **Poison Message Quarantine:** Instant isolation of corrupted video inputs without retry exhaustion.

---

## 2. Experimental Scenarios & Results

### Scenario A: Worker Crash Recovery & Atomic Output Publication

- **Failure Injection:** Worker is forcibly terminated or encounters an unhandled process failure after generating 80% of HLS segments.
- **Verification Invariant:** The media item must remain in `DRAFT` status throughout the failure; no partial HLS master manifest or broken segments may be published to clients.
- **Recovery:** Upon worker restart / requeue, the transcode pipeline executes completely and promotes the artifact to `READY`.

| Metric | Target | Observed | Result |
|---|---|---|---|
| Partial `READY` Leakage | 0 | 0 | PASS |
| Clean Publication upon Restart | 1 logical artifact | 1 logical artifact (`master.m3u8`) | PASS |
| Recovery Invariant | Maintained | Maintained | PASS |

---

### Scenario B: Concurrency Limit Enforcement

- **Stress Injection:** 10 transcode jobs submitted concurrently to the BullMQ queue with `concurrency: 2`.
- **Target:** The worker must never process more than 2 jobs simultaneously, preventing CPU saturation and out-of-memory (OOM) crashes on the media worker host.

| Total Enqueued Jobs | Worker Concurrency Limit | Max Observed Active Transcodes | Completed Jobs |
|---:|---:|---:|---:|
| **10** | **2** | **2** | **10** |

**Observation:** Exactly 2 FFmpeg transcoding pipelines executed concurrently at all times, completing all 10 jobs in bounded waves without CPU starvation.

---

### Scenario C: Duplicate Enqueue Idempotency

- **Test Condition:** The same media item, source asset, and profile version is enqueued 5 times in rapid succession.
- **Mechanism:** Deterministic job ID derivation `transcode_${mediaId}_${sourceAssetId}_${profileVersion}` paired with PostgreSQL unique constraint `(media_id, source_asset_id, profile_version)`.

| Enqueue Attempts | BullMQ Queue Additions | Actual Worker Executions | Database Conflicts |
|---:|---:|---:|---:|
| **5** | **1** | **1** | **0** |

**Observation:** BullMQ native job ID deduplication prevents queue duplication, and database unique constraints protect data consistency.

---

### Scenario D: Poison Message Quarantine

- **Test Condition:** A corrupt video payload (missing `moov` atom header) is submitted to the queue with `attempts: 3`.
- **Mechanism:** Non-retryable errors throw `UnrecoverableError`, immediately transitioning `transcode_jobs.status` to `FAILED` and quarantining the job without wasting retry slots.

| Configured Retries | Actual Executions | Retries Triggered | Final Status |
|---:|---:|---:|---|
| **3** | **1** | **0** | `FAILED` (Quarantined) |

**Observation:** The corrupted file was quarantined on the first attempt with diagnostic error recorded, freeing worker slots for valid jobs.

---

## 3. Summary Table

| Scenario | Target | Observed | Status |
|---|---|---|---|
| **Worker Crash Recovery** | Eventual single READY artifact | 1 artifact, zero partial leakage | PASS |
| **Concurrency Limit** | Max 2 simultaneous | Max 2 simultaneous | PASS |
| **Duplicate Idempotency** | 1 execution for 5 duplicates | 1 execution | PASS |
| **Poison Quarantine** | 1 execution (no retry loops) | 1 execution | PASS |
